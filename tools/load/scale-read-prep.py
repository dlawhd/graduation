#!/usr/bin/env python3
"""기존 10명 fixture를 보존하고 별도 10명 묶음 29개를 검증 후 추가하는 운영 시험 준비 도구다."""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import subprocess
import sys
import datetime

spec = importlib.util.spec_from_file_location('read_prep', pathlib.Path(__file__).with_name('ec2-read-prep.py'))
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def validate(plan):
    """묶음 수·중복·원래 시험 계정의 범위를 제한하고 비밀값은 출력하지 않는다."""
    if plan.get('schema') != 2 or len(plan.get('groups', [])) != 29:
        raise ValueError('EXACTLY_290_ADDITIONAL_ACCOUNTS_REQUIRED')
    base = plan['base']
    if base.get('scope') != 'ec2-prepared' or len(base['accounts']) != 10 or len(base['jars']) != 3:
        raise ValueError('ORIGINAL_FIXTURE_REQUIRED')
    if not re.fullmatch(r'lt[a-f0-9]{8}', base['runId']):
        raise ValueError('INVALID_BASE_PREFIX')
    ids = [a['userId'] for a in base['accounts']]
    if len(set(ids)) != 10 or any(type(i) is not int or i <= 0 for i in ids):
        raise ValueError('INVALID_BASE_USERS')
    jar_ids = [j['jarId'] for j in base['jars']]
    if len(set(jar_ids)) != 3 or any(type(i) is not int or i <= 0 for i in jar_ids):
        raise ValueError('INVALID_BASE_JARS')
    prefixes = {base['runId']}
    for group in plan['groups']:
        prep.validate_plan(group)
        if group['runId'] in prefixes:
            raise ValueError('DUPLICATE_GROUP')
        prefixes.add(group['runId'])


def seed_sql(plan, fail=False):
    """원래 INSERT 생성기를 재사용하되 29개 묶음을 한 트랜잭션으로 묶고 원본 fixture를 대조한다."""
    validate(plan)
    first = prep.seed_sql(plan['groups'][0]).splitlines()
    stamp = next(i for i, line in enumerate(first) if line.startswith('SET @ts='))
    lines = [line for line in first[:stamp] if 'FIXTURE_ALREADY_EXISTS' not in line
             and 'OTHER_TEST_FIXTURE_EXISTS' not in line]
    for group in plan['groups']:
        lines += [line for line in prep.seed_sql(group).splitlines() if 'FIXTURE_ALREADY_EXISTS' in line]
    base = plan['base']
    checks = ['(u.id=%d AND c.login_id=%s AND u.email=%s)' %
              (a['userId'], prep.hex_text(a['loginId']), prep.hex_text(a['loginId'] + '@example.invalid'))
              for a in base['accounts']]
    lines.append("IF (SELECT count(*) FROM users u JOIN user_local_credentials c ON c.user_id=u.id WHERE "
                 + ' OR '.join(checks) + ") <> 10 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BASE_ACCOUNTS_CHANGED'; END IF;")
    lines.append("IF (SELECT count(*) FROM user_local_credentials c JOIN users u ON u.id=c.user_id WHERE c.login_id REGEXP '^lt[0-9a-f]{8}[0-9]{2}$' AND u.email=CONCAT(c.login_id,'@example.invalid')) <> 10 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='UNEXPECTED_TEST_FIXTURES'; END IF;")
    for jar in base['jars']:
        if type(jar['ownerId']) is not int or jar['ownerId'] not in [a['userId'] for a in base['accounts']]:
            raise ValueError('INVALID_BASE_OWNER')
        lines.append("IF (SELECT count(*) FROM jars WHERE jar_id=%d AND owner_id=%d AND name=%s) <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='BASE_JARS_CHANGED'; END IF;" %
                     (jar['jarId'], jar['ownerId'], prep.hex_text(jar['name'])))
    for group in plan['groups']:
        source = prep.seed_sql(group).splitlines()
        start = next(i for i, line in enumerate(source) if line.startswith('SET @ts='))
        end = source.index('COMMIT;')
        lines.extend(source[start:end])
    if fail:
        lines.append("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LOCAL_ROLLBACK_PROBE';")
    lines += ['COMMIT;', "DO RELEASE_LOCK('memoryjar_read_fixture');", 'END//', 'DELIMITER ;']
    return '\n'.join(lines) + '\n'


def manifest(plan, container=None):
    groups = [plan['base']] + [prep.manifest(g, container) for g in plan['groups']]
    return {'schema': 2, 'scope': 'ec2-grouped-read', 'groups': groups}


def local_check(folder, container, backup_sha):
    """외부 연결 없는 복원 DB에서 전체 롤백·중복 차단·기존 행 checksum 보존을 검사한다."""
    if not re.fullmatch(r'memoryjar-restore-[a-f0-9]{16}', container or ''):
        raise ValueError('DISPOSABLE_RESTORE_REQUIRED')
    if prep.run(['docker', 'context', 'show']).decode().strip() != 'desktop-linux':
        raise ValueError('LOCAL_DOCKER_REQUIRED')
    info = json.loads(prep.run(['docker', 'inspect', container]))[0]
    if info['HostConfig']['NetworkMode'] != 'none' or info['Config']['Labels'].get('memoryjar.backup-restore') != 'temporary':
        raise ValueError('RESTORE_ISOLATION_REQUIRED')
    plan = json.loads((folder / 'scale-plan.private.json').read_text())
    statement = seed_sql(plan)
    tables = prep.sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='appdb' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;", container).splitlines()
    if len(tables) != 25 or any(not re.fullmatch('[a-zA-Z0-9_]+', t) for t in tables):
        raise ValueError('UNEXPECTED_TABLES')
    checksum_sql = 'CHECKSUM TABLE ' + ','.join('appdb.`' + t + '`' for t in tables) + ' EXTENDED;'
    before = prep.sql(checksum_sql, container)
    if any(line.endswith('\tNULL') for line in before.splitlines()):
        raise ValueError('CHECKSUM_UNAVAILABLE')

    def failure(sql, marker):
        result = subprocess.run(prep.local_sql_command(container), input=sql.encode(),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        if result.returncode == 0 or re.search(rb'ERROR\s+1644\s+\(45000\)[^\r\n]*:\s*' + marker.encode(), result.stderr) is None:
            raise AssertionError('EXPECTED_SIGNAL_NOT_OBSERVED')

    failure(seed_sql(plan, True), 'LOCAL_ROLLBACK_PROBE')
    if prep.sql(checksum_sql, container) != before:
        raise AssertionError('ROLLBACK_CHANGED_ROWS')
    prep.sql(statement, container)
    family = manifest(plan, container)
    failure(statement, 'FIXTURE_ALREADY_EXISTS')
    if manifest(plan, container) != family:
        raise AssertionError('DUPLICATE_CHANGED_ROWS')
    added = family['groups'][1:]
    users = ','.join(str(a['userId']) for g in added for a in g['accounts'])
    jars = ','.join(str(j['jarId']) for g in added for j in g['jars'])
    # 폐기용 복원 사본에서만 방금 넣은 행을 삭제한다. 운영에는 INSERT만 실행한다.
    prep.sql('START TRANSACTION; DELETE FROM notes WHERE jar_id IN (' + jars
             + '); DELETE FROM jar_open_events WHERE jar_id IN (' + jars
             + '); DELETE FROM jar_members WHERE jar_id IN (' + jars
             + '); DELETE FROM jars WHERE jar_id IN (' + jars
             + '); DELETE FROM user_local_credentials WHERE user_id IN (' + users
             + '); DELETE FROM users WHERE id IN (' + users + '); COMMIT;', container)
    if prep.sql(checksum_sql, container) != before:
        raise AssertionError('ORIGINAL_ROWS_CHANGED')
    result = {'rollbackVerified': True, 'duplicateRejected': True, 'originalRowsPreserved': True,
              'additionalAccounts': 290, 'additionalJars': 87, 'additionalNotes': 3480,
              'backupSha256': backup_sha, 'planSha256': digest(plan),
              'sqlSha256': hashlib.sha256(statement.encode()).hexdigest()}
    prep.write_private(folder / 'scale-local-check.json', result)
    print('SCALE_LOCAL_SQL_CHECK_PASSED: 290 accounts; rollback, duplicate guard, original checksums')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['plan', 'local-check', 'provision', 'status'])
    parser.add_argument('--folder', type=pathlib.Path, required=True)
    parser.add_argument('--base-fixture', type=pathlib.Path)
    parser.add_argument('--container')
    parser.add_argument('--restored-backup-sha256')
    parser.add_argument('--approve-provision', action='store_true')
    args = parser.parse_args()
    args.folder.mkdir(parents=True, exist_ok=True)
    if args.mode == 'status':
        # 원문 계정·JWT 대신 준비된 ID 범위의 숫자만 출력한다. DB 쓰기는 하지 않는다.
        family = json.loads((args.folder / 'family.private.json').read_text())
        if family.get('scope') != 'ec2-grouped-read' or len(family['groups']) != 30:
            raise ValueError('PREPARED_FAMILY_REQUIRED')
        accounts = [a['userId'] for g in family['groups'] for a in g['accounts']]
        jars = [j['jarId'] for g in family['groups'] for j in g['jars']]
        if len(set(accounts)) != 300 or len(set(jars)) != 90 or any(type(i) is not int or i <= 0 for i in accounts + jars):
            raise ValueError('INVALID_FAMILY_IDENTITIES')
        u, j = ','.join(map(str, accounts)), ','.join(map(str, jars))
        query = ("SELECT JSON_OBJECT('accounts',(SELECT count(*) FROM users WHERE id IN (" + u
                 + ")),'jars',(SELECT count(*) FROM jars WHERE jar_id IN (" + j
                 + ")),'members',(SELECT count(*) FROM jar_members WHERE jar_id IN (" + j
                 + ")),'notes',(SELECT count(*) FROM notes WHERE jar_id IN (" + j
                 + ")),'openEvents',(SELECT count(*) FROM jar_open_events WHERE jar_id IN (" + j
                 + ")),'foreignMembers',(SELECT count(*) FROM jar_members WHERE jar_id IN (" + j
                 + ") AND user_id NOT IN (" + u
                 + ")),'foreignAuthors',(SELECT count(*) FROM notes WHERE jar_id IN (" + j
                 + ") AND author_id NOT IN (" + u
                 + ")),'refreshActive',(SELECT count(*) FROM refresh_tokens WHERE user_id IN (" + u
                 + ") AND revoked_at IS NULL));")
        result = json.loads(prep.sql(query))
        prep.write_private(args.folder / ('status-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S') + '.json'), result)
        print(json.dumps(result))
        return
    if args.mode == 'plan':
        if not args.base_fixture or (args.folder / 'scale-plan.private.json').exists():
            raise ValueError('NEW_PLAN_AND_ORIGINAL_FIXTURE_REQUIRED')
        base = json.loads(args.base_fixture.read_text())
        groups = []
        for i in range(29):
            sub = args.folder / ('group-%02d' % (i + 1))
            sub.mkdir(exist_ok=False)
            groups.append(prep.make_plan(sub))
            print('PRIVATE_GROUPS_PREPARED:', i + 1, flush=True)
        value = {'schema': 2, 'base': base, 'groups': groups}
        validate(value)
        prep.write_private(args.folder / 'scale-plan.private.json', value)
        return
    if args.mode == 'local-check':
        if not re.fullmatch('[a-f0-9]{64}', args.restored_backup_sha256 or ''):
            raise ValueError('BACKUP_HASH_REQUIRED')
        local_check(args.folder, args.container, args.restored_backup_sha256)
        return
    if not args.approve_provision:
        raise ValueError('EXPLICIT_PROVISION_APPROVAL_REQUIRED')
    plan = json.loads((args.folder / 'scale-plan.private.json').read_text())
    statement = seed_sql(plan)
    proof = json.loads((args.folder / 'scale-local-check.json').read_text())
    record = json.loads((args.folder / 'backup.json').read_text())
    actual = hashlib.sha256((pathlib.Path(record['localFolder']) / 'appdb.sql.gz').read_bytes()).hexdigest()
    age = datetime.datetime.now(datetime.timezone.utc).timestamp() - datetime.datetime.fromisoformat(record['capturedAt']).timestamp()
    if not 0 <= age <= 1800 or actual != record['sha256'] or actual != proof['backupSha256']:
        raise ValueError('FRESH_VERIFIED_BACKUP_REQUIRED')
    if not all(proof.get(k) is True for k in ['rollbackVerified', 'duplicateRejected', 'originalRowsPreserved']):
        raise ValueError('LOCAL_PROOF_REQUIRED')
    if proof['planSha256'] != digest(plan) or proof['sqlSha256'] != hashlib.sha256(statement.encode()).hexdigest():
        raise ValueError('PLAN_OR_SQL_CHANGED')
    if (args.folder / 'family.private.json').exists():
        raise ValueError('ALREADY_PROVISIONED')
    prep.verify_runtime(args.folder)
    # 불확실한 통신 실패 시 자동 재시도하지 않는다. DB에 이미 반영됐는지 먼저 조사한다.
    prep.sql(statement)
    family = manifest(plan)
    prep.write_private(args.folder / 'family.private.json', family)
    print('SCALE_FIXTURE_PROVISIONED: total 300 accounts, 90 jars, 3600 text notes')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('SCALE_PREPARATION_STOPPED: ' + type(error).__name__ + '; private details suppressed; do not retry writes blindly', file=sys.stderr)
        sys.exit(1)
