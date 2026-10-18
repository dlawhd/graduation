"""실행 중 DB의 검증된 캐시 값을 기본 배포 파일에 보존한다. DB 재생성은 하지 않는다."""
import argparse
import copy
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile


COMMAND = ['mariadbd', '--key-buffer-size=8M', '--aria-pagecache-buffer-size=32M']
CACHE = {'keyBuffer': 8388608, 'ariaCache': 33554432, 'innodbPool': 134217728}


def amended(text):
    """기본 db 서비스에 명령만 추가한다. 기존 명령이 있거나 구조가 모호하면 중단한다."""
    if len(re.findall(r'^  db:\s*$', text, re.M)) != 1:
        raise ValueError('UNSUPPORTED_DB_SECTION')
    section = re.search(r'^  db:\s*\n(.*?)(?=^  [^\s#]|^\S|\Z)', text, re.M | re.S)
    if not section or re.search(r'^    command:', section.group(1), re.M):
        raise ValueError('EXISTING_COMMAND_REQUIRES_REVIEW')
    start = section.start(1)
    return text[:start] + '    # 1GiB 서버에서 검증한 DB 캐시 예산. InnoDB 기본 128MiB는 유지한다.\n' + \
        '    command: ' + json.dumps(COMMAND) + '\n' + text[start:]


def run(args, data=None):
    """Compose에는 인증값이 포함되므로 자식 출력은 캡처하고 오류 원문은 노출하지 않는다."""
    try:
        result = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        if result.returncode:
            raise ValueError('COMMAND_FAILED_REDACTED')
        return result.stdout
    except (OSError, subprocess.TimeoutExpired):
        raise ValueError('COMMAND_UNAVAILABLE_OR_TIMEOUT') from None


def resolved(base):
    return json.loads(run(['docker', 'compose', '--project-name', 'deploy', '-f', str(base),
                           'config', '--format', 'json']))


def same_except_command(before, after):
    """환경·포트·이미지·볼륨 등은 모두 그대로인지 실제 Compose 해석 결과를 비교한다."""
    expected = copy.deepcopy(before)
    expected['services']['db']['command'] = COMMAND
    if expected != after:
        raise ValueError('UNRELATED_COMPOSE_CHANGE')


def snapshot():
    raw = json.loads(run(['docker', 'inspect', 'spring-api', 'mariadb']))
    identity = [[c['Id'], c['Image'], c['State']['StartedAt'], c['RestartCount'], c['State']['OOMKilled']]
                for c in raw]
    if not all(c['State']['Running'] and not c['State']['OOMKilled'] for c in raw):
        raise ValueError('UNHEALTHY_CONTAINERS')
    if raw[1]['Config']['Cmd'] != COMMAND:
        raise ValueError('RUNNING_DB_COMMAND_MISMATCH')
    shell = ('set +x; test -n "${MARIADB_ROOT_PASSWORD:-}" || exit 1; '
             'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb -uroot --batch --skip-column-names')
    sql = "SELECT JSON_OBJECT('keyBuffer',@@key_buffer_size,'ariaCache',@@aria_pagecache_buffer_size,'innodbPool',@@innodb_buffer_pool_size);"
    if json.loads(run(['docker', 'exec', '-i', 'mariadb', 'sh', '-c', shell], sql.encode())) != CACHE:
        raise ValueError('RUNNING_DB_CACHE_MISMATCH')
    return identity


def trusted_base(base):
    """소유자 외에 파일을 바꿀 수 있는 계정이 있으면 반영을 거절한다."""
    if base.is_symlink() or not base.is_file():
        return False
    if os.name != 'posix':
        return True
    import grp
    import pwd
    info = base.stat()
    if info.st_uid != os.getuid() or info.st_mode & 0o002:
        return False
    if info.st_mode & 0o020:
        owner = pwd.getpwuid(info.st_uid).pw_name
        group = grp.getgrgid(info.st_gid)
        if set(group.gr_mem) - {owner} or any(u.pw_gid == info.st_gid and u.pw_uid != info.st_uid for u in pwd.getpwall()):
            return False
    return True


def persist(root, apply=False, expected_hash=None):
    """고정 경로만 대상으로 백업 후 파일을 원자 교체한다. 운영 프로세스는 변경하지 않는다."""
    base = pathlib.Path(root) / 'docker-compose.prod.yml'
    if not trusted_base(base):
        raise ValueError('UNSAFE_BASE_CONFIG')
    raw = base.read_bytes()
    original_mode = base.stat().st_mode & 0o777
    digest = hashlib.sha256(raw).hexdigest()
    if apply and digest != expected_hash:
        raise ValueError('BASE_CHANGED_REVIEW_AGAIN')
    before = resolved(base)
    identity = snapshot()
    if before['services']['db'].get('command') == COMMAND:
        return {'status': 'ALREADY_PERSISTED', 'sha256': digest, 'containersUnchanged': True}
    if before['services']['db'].get('command') is not None:
        raise ValueError('EXISTING_COMMAND_REQUIRES_REVIEW')
    changed = amended(raw.decode('utf-8')).encode('utf-8')
    # 같은 폴더에서 해석해야 상대 경로의 env_file·볼륨 의미가 바뀌지 않는다.
    fd, name = tempfile.mkstemp(prefix='.db-memory-candidate-', suffix='.yml', dir=str(base.parent))
    candidate = pathlib.Path(name)
    backup = None
    replaced = False
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(changed)
        # 기본 파일에도 인증값이 있으므로 반영 시 소유자만 읽고 쓰도록 권한을 강화한다.
        os.chmod(candidate, 0o600)
        same_except_command(before, resolved(candidate))
        if base.read_bytes() != raw or snapshot() != identity:
            raise ValueError('STATE_CHANGED_REVIEW_AGAIN')
        if not apply:
            return {'status': 'PLAN_VALIDATED', 'sha256': digest, 'cache': CACHE, 'containersUnchanged': True}
        # 인증정보가 포함된 원본은 서버 안에만 권한 600으로 보존한다. 출력하지 않는다.
        fd, backup_name = tempfile.mkstemp(prefix='db-memory-base-backup-', suffix='.yml', dir=str(base.parent))
        backup = pathlib.Path(backup_name)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(candidate, base)
        replaced = True
        same_except_command(before, resolved(base))
        if snapshot() != identity:
            raise ValueError('POSTCHECK_STATE_CHANGED')
        return {'status': 'PERSISTED_WITHOUT_RESTART', 'sha256': hashlib.sha256(changed).hexdigest(),
                'backup': str(backup), 'cache': CACHE, 'containersUnchanged': True}
    except Exception:
        # 교체 후 검증에 실패하면 이 실행의 파일만 되돌린다. 다른 작업자의 파일은 덮어쓰지 않는다.
        if replaced and base.read_bytes() == changed:
            fd, restore_name = tempfile.mkstemp(prefix='.db-memory-restore-', dir=str(base.parent))
            restore = pathlib.Path(restore_name)
            try:
                with os.fdopen(fd, 'wb') as stream:
                    stream.write(raw)
                os.chmod(restore, original_mode)
                os.replace(restore, base)
            finally:
                restore.unlink(missing_ok=True)
        raise
    finally:
        # 이 실행이 만든 임시 파일만 제거한다. 백업은 실패해도 보존한다.
        candidate.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-sha256')
    args = parser.parse_args()
    # API 배포와 같은 잠금으로 동시 변경을 막는다. 표준 라이브러리만 사용한다.
    import fcntl
    root = pathlib.Path('/home/ubuntu/deploy')
    fd = os.open(str(root / '.memoryjar-api-deploy.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            print(json.dumps(persist(root, args.apply, args.expected_sha256)))
        return 0
    except Exception as error:
        print(json.dumps({'status': 'FAILED', 'error': str(error) if isinstance(error, ValueError) else 'ERROR_REDACTED'}))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
