#!/usr/bin/env python3
"""승인된 EC2 시험 준비: 백업·전용 데이터 INSERT·저속 기능 확인. k6 부하는 실행하지 않는다."""

import argparse
import datetime
import hashlib
import http.cookiejar
import json
import os
import pathlib
import re
import secrets
import shlex
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
TARGET = "ubuntu@52.78.116.71"
IDENTITY = pathlib.Path("C:/Users/whdgu/Downloads/graduation-key.pem")
API = "https://api.esjh.shop"
BODY = "실제 사용자 내용이 아닌 시험용 본문입니다. " * 20
TABLES = ("users", "user_local_credentials", "jars", "jar_members", "notes", "jar_open_events")


def run(command, data=None, timeout=120):
    """비밀값·SQL·응답 원문이 오류 출력에 섞이지 않도록 캡처하고 고정 오류만 반환한다."""
    completed = subprocess.run(command, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               timeout=timeout)
    if completed.returncode:
        raise RuntimeError("COMMAND_FAILED_OUTPUT_REDACTED")
    return completed.stdout


def ssh_args():
    return ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
            "-o", "ConnectTimeout=8", "-i", str(IDENTITY), TARGET]


def remote(command, text=None):
    return run(ssh_args() + [command], None if text is None else text.encode("utf-8"))


def local_sql_command(container):
    shell = ('set +x; test -n "${MARIADB_ROOT_PASSWORD:-}" || exit 1; '
             'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; '
             'exec mariadb -uroot --default-character-set=utf8mb4 --batch --raw --skip-column-names appdb')
    return ["docker", "exec", "-i", container, "sh", "-c", shell]


def sql(text, container=None):
    shell = ('set +x; test -n "${MARIADB_ROOT_PASSWORD:-}" || exit 1; '
             'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; '
             'exec mariadb -uroot --default-character-set=utf8mb4 --batch --raw --skip-column-names appdb')
    if container:
        return run(local_sql_command(container), text.encode()).decode()
    return remote("docker exec -i mariadb sh -c " + shlex.quote(shell), text).decode()


def write_private(path, value):
    # 기존 파일을 덮어쓰지 않는다. 출력 위치는 무시되는 build/ 또는 사용자 백업 폴더다.
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
    os.chmod(path, 0o600)


def hex_text(value):
    return "CONVERT(0x" + value.encode("utf-8").hex() + " USING utf8mb4)"


def validate_plan(plan):
    if plan.get("schema") != 1 or not re.fullmatch(r"lt[a-f0-9]{8}", plan.get("runId", "")):
        raise ValueError("INVALID_PLAN")
    if len(plan.get("accounts", [])) != 10:
        raise ValueError("TEN_ACCOUNTS_REQUIRED")
    for index, account in enumerate(plan["accounts"]):
        if account["loginId"] != plan["runId"] + "%02d" % index:
            raise ValueError("INVALID_LOGIN_ID")
        if not re.fullmatch(r"Lt!7[a-f0-9]{32}", account["password"]):
            raise ValueError("INVALID_GENERATED_PASSWORD")
        if not re.fullmatch(r"\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+", account["hash"]):
            raise ValueError("INVALID_ARGON2_SETTINGS")


def plan_checksum(plan):
    return hashlib.sha256(json.dumps(plan, sort_keys=True).encode()).hexdigest()


def make_plan(folder):
    token = "lt" + secrets.token_hex(4)
    accounts = [{"loginId": token + "%02d" % i, "password": "Lt!7" + secrets.token_hex(16)} for i in range(10)]
    java = pathlib.Path(os.environ.get("JAVA_HOME", "")) / "bin" / "java.exe"
    if not java.is_file():
        raise ValueError("JAVA_17_HOME_REQUIRED")
    bundle = ROOT / "build" / "isolated-e2e-runtime"
    classpath = os.pathsep.join(str(bundle / part) for part in ("classes/main", "classes/test", "lib/*"))
    output = run([str(java), "-cp", classpath,
        "shop.esjh.memoryjar.isolated.ReadFixturePasswords"],
        json.dumps([a["password"] for a in accounts]).encode()).decode()
    # 라이브러리 초기화 경고가 stdout에 있어도 정해진 IPC 표식만 읽고 원문을 출력하지 않는다.
    messages = [line[len("READ_FIXTURE_HASHES="):] for line in output.splitlines() if line.startswith("READ_FIXTURE_HASHES=")]
    if len(messages) != 1:
        raise ValueError("HASH_TOOL_PROTOCOL_FAILED")
    hashes = json.loads(messages[0])
    for account, hashed in zip(accounts, hashes):
        account["hash"] = hashed
    plan = {"schema": 1, "runId": token, "accounts": accounts}
    validate_plan(plan)
    write_private(folder / "plan.private.json", plan)
    return plan


def seed_sql(plan, fail_before_commit=False):
    """기존 행을 수정·삭제하지 않고 176개 행을 하나의 트랜잭션으로 추가한다."""
    validate_plan(plan)
    prefix = hex_text(plan["runId"])
    lines = ["SET @fixture_lock=GET_LOCK('memoryjar_read_fixture',0);", "DELIMITER //", "BEGIN NOT ATOMIC",
        "DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; DO RELEASE_LOCK('memoryjar_read_fixture'); RESIGNAL; END;",
        "IF COALESCE(@fixture_lock,0) <> 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PREPARATION_ALREADY_RUNNING'; END IF;",
        "START TRANSACTION;",
        "IF DATABASE() <> 'appdb' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='WRONG_DATABASE'; END IF;",
        "IF COALESCE((SELECT version FROM flyway_schema_history WHERE success=1 AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1),'') <> '52' OR (SELECT count(*) FROM flyway_schema_history WHERE success=0) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SCHEMA_MISMATCH'; END IF;",
        "IF (SELECT count(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='appdb' AND TABLE_NAME IN ('users','user_local_credentials','jars','jar_members','notes','jar_open_events') AND ENGINE='InnoDB') <> 6 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='TRANSACTIONAL_TABLES_REQUIRED'; END IF;",
        "IF (SELECT count(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='appdb') <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='UNREVIEWED_TRIGGER'; END IF;",
        "IF (SELECT count(*) FROM user_local_credentials WHERE LEFT(login_id,10)=" + prefix + ") > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FIXTURE_ALREADY_EXISTS'; END IF;",
        "IF (SELECT count(*) FROM user_local_credentials c JOIN users u ON u.id=c.user_id WHERE c.login_id REGEXP '^lt[0-9a-f]{8}[0-9]{2}$' AND u.email=CONCAT(c.login_id,'@example.invalid')) > 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OTHER_TEST_FIXTURE_EXISTS'; END IF;",
        "SET @ts=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 9 HOUR);"]
    for i, account in enumerate(plan["accounts"]):
        email = hex_text(account["loginId"] + "@example.invalid")
        lines += ["INSERT INTO users(email,name,provider,provider_id,created_at,updated_at,session_version) VALUES ("
                  + email + "," + hex_text("시험친구" + str(i)) + ",NULL,NULL,@ts,@ts,0);",
                  "SET @u%d=LAST_INSERT_ID();" % i,
                  "INSERT INTO user_local_credentials(user_id,login_id,password_hash,password_changed_at,created_at,updated_at) VALUES (@u%d," % i
                  + hex_text(account["loginId"]) + "," + hex_text(account["hash"]) + ",@ts,@ts,@ts);"]
    for j in range(3):
        lines += ["INSERT INTO jars(owner_id,name,description,theme,max_members,open_at,open_mode,lock_level,created_at,updated_at) VALUES (@u%d," % j
                  + hex_text(plan["runId"] + "-jar-" + str(j)) + "," + hex_text("전용 텍스트 조회 기능 검증")
                  + ",'SPRING',10,DATE_SUB(@ts,INTERVAL 1 DAY),'ALL_AT_ONCE','TITLE_ONLY',@ts,@ts);",
                  "SET @j%d=LAST_INSERT_ID();" % j,
                  "INSERT INTO jar_open_events(jar_id,opened_at,reason,created_at,updated_at) VALUES (@j%d,DATE_SUB(@ts,INTERVAL 1 DAY),'SCHEDULED',@ts,@ts);" % j]
        for i in range(10):
            lines.append("INSERT INTO jar_members(jar_id,user_id,role,joined_at,created_at,updated_at) VALUES (@j%d,@u%d,'%s',@ts,@ts,@ts);" % (j, i, "OWNER" if i == j else "MEMBER"))
        for n in range(40):
            lines.append("INSERT INTO notes(jar_id,author_id,title,content,is_encrypted,note_date,location,tags_json,created_at,updated_at) VALUES (@j%d,@u%d," % (j, n % 10)
                         + hex_text(plan["runId"] + "-note-" + str(n)) + "," + hex_text(BODY)
                         + ",0,DATE(@ts)," + hex_text("가상 장소") + "," + hex_text('["시험"]') + ",@ts,@ts);")
    if fail_before_commit:
        lines.append("SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LOCAL_ROLLBACK_PROBE';")
    lines += ["COMMIT;", "DO RELEASE_LOCK('memoryjar_read_fixture');", "END//", "DELIMITER ;"]
    return "\n".join(lines) + "\n"


def manifest(plan, container=None):
    prefix = hex_text(plan["runId"])
    accounts = []
    rows = sql("SELECT u.id,c.login_id FROM user_local_credentials c JOIN users u ON u.id=c.user_id WHERE LEFT(c.login_id,10)=" + prefix + " ORDER BY c.login_id;", container)
    for line in rows.splitlines():
        user_id, login = line.split("\t")
        original = next(a for a in plan["accounts"] if a["loginId"] == login)
        accounts.append({"userId": int(user_id), "loginId": login, "password": original["password"]})
    jars = []
    for line in sql("SELECT jar_id,name,owner_id FROM jars WHERE LEFT(name,10)=" + prefix + " ORDER BY jar_id;", container).splitlines():
        jar_id, name, owner = line.split("\t")
        notes = sql("SELECT note_id FROM notes WHERE jar_id=" + str(int(jar_id)) + " ORDER BY created_at DESC,note_id DESC;", container)
        jars.append({"jarId": int(jar_id), "name": name, "ownerId": int(owner), "noteIds": [int(n) for n in notes.splitlines()]})
    if len(accounts) != 10 or len(jars) != 3 or any(len(j["noteIds"]) != 40 for j in jars):
        raise RuntimeError("FIXTURE_COUNTS_MISMATCH_DO_NOT_RETRY_INSERT")
    return {"schema": 1, "scope": "ec2-prepared", "runId": plan["runId"], "accounts": accounts,
            "jars": jars, "pageSize": 20, "notesPerJar": 40}


def local_check(container, plan):
    # 실제 운영/개발 DB를 로컬 시험 대상으로 잘못 지정하지 못하도록 restore 전용 컨테이너만 허용한다.
    if not re.fullmatch(r"memoryjar-restore-[a-f0-9]{16}", container):
        raise ValueError("DISPOSABLE_RESTORE_CONTAINER_REQUIRED")
    if run(["docker", "context", "show"]).decode().strip() != "desktop-linux":
        raise ValueError("LOCAL_DOCKER_REQUIRED")
    info = json.loads(run(["docker", "inspect", container]))[0]
    if info["HostConfig"]["NetworkMode"] != "none" or info["Config"]["Labels"].get("memoryjar.backup-restore") != "temporary":
        raise ValueError("RESTORE_ISOLATION_REQUIRED")
    tables = sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='appdb' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;", container).splitlines()
    if any(not re.fullmatch(r"[a-zA-Z0-9_]+", t) for t in tables):
        raise ValueError("INVALID_TABLE_IDENTIFIER")
    checksums = "CHECKSUM TABLE " + ",".join("appdb.`" + t + "`" for t in tables) + " EXTENDED;"
    before = sql(checksums, container)
    if any(line.endswith("\tNULL") for line in before.splitlines()):
        raise ValueError("TABLE_CHECKSUM_UNAVAILABLE")
    def expected_failure(statement, marker):
        result = subprocess.run(local_sql_command(container), input=statement.encode(),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        # 단순 통신 오류나 SQL 문법 오류를 의도한 롤백·중복 거절 성공으로 오인하지 않는다.
        signal_error = rb"ERROR\s+1644\s+\(45000\)[^\r\n]*:\s*" + re.escape(marker.encode())
        if result.returncode == 0 or re.search(signal_error, result.stderr) is None:
            raise AssertionError("EXPECTED_SQL_FAILURE_NOT_OBSERVED")
    expected_failure(seed_sql(plan, fail_before_commit=True), "LOCAL_ROLLBACK_PROBE")
    if sql(checksums, container) != before:
        raise AssertionError("ROLLBACK_DID_NOT_PRESERVE_ROWS")
    sql(seed_sql(plan), container)
    value = manifest(plan, container)
    expected_failure(seed_sql(plan), "FIXTURE_ALREADY_EXISTS")
    if manifest(plan, container) != value:
        raise AssertionError("DUPLICATE_REQUEST_CHANGED_FIXTURE")
    user_ids = ",".join(str(a["userId"]) for a in value["accounts"])
    jar_ids = ",".join(str(j["jarId"]) for j in value["jars"])
    # 세션 정리 SQL도 복원 사본에서 실행한다. 기존 사용자의 실제 토큰은 노출·변경하지 않는다.
    token_marker = hex_text(plan["runId"] + "-local-session-probe")
    sql("INSERT INTO refresh_tokens(user_id,token_hash,expires_at,created_at) VALUES ("
        + str(value["accounts"][0]["userId"]) + ",SHA2(" + token_marker
        + ",256),DATE_ADD(NOW(),INTERVAL 1 DAY),NOW());", container)
    if sql(revoke_test_sessions_sql(value), container).strip() != "1":
        raise AssertionError("TEST_SESSION_CLEANUP_FAILED")
    # 복원 시험 DB 안에서만, 방금 생성한 ID만 정리하고 기존 모든 행의 checksum을 대조한다.
    sql("START TRANSACTION; DELETE FROM refresh_tokens WHERE user_id IN (" + user_ids + "); DELETE FROM notes WHERE jar_id IN (" + jar_ids + "); DELETE FROM jar_open_events WHERE jar_id IN (" + jar_ids
        + "); DELETE FROM jar_members WHERE jar_id IN (" + jar_ids + "); DELETE FROM jars WHERE jar_id IN (" + jar_ids
        + "); DELETE FROM user_local_credentials WHERE user_id IN (" + user_ids + "); DELETE FROM users WHERE id IN (" + user_ids + "); COMMIT;", container)
    if sql(checksums, container) != before:
        raise AssertionError("ORIGINAL_ROWS_CHANGED")
    return {"rollbackVerified": True, "duplicateRejected": True, "originalTableChecksumsUnchanged": True, "testSessionCleanupVerified": True,
            "accounts": 10, "jars": 3, "notes": 120}


def backup(folder):
    script = r'''set -euo pipefail
umask 077
backup_dir=$(mktemp -d /home/ubuntu/appdb-backup-XXXXXXXX)
docker exec mariadb sh -c 'set +x; test -n "${MARIADB_ROOT_PASSWORD:-}"; export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb-dump -uroot --single-transaction --quick --routines --events --triggers --hex-blob --databases appdb' | gzip > "$backup_dir/appdb.sql.gz.partial"
gzip -t "$backup_dir/appdb.sql.gz.partial"
gzip -dc "$backup_dir/appdb.sql.gz.partial" | tail -n 10 | grep -q '^-- Dump completed on '
mv "$backup_dir/appdb.sql.gz.partial" "$backup_dir/appdb.sql.gz"
cd "$backup_dir"
sha256sum appdb.sql.gz > SHA256SUMS
printf '%s\n' "$backup_dir"
sha256sum appdb.sql.gz
'''
    lines = remote("bash -s", script).decode().splitlines()
    remote_folder = lines[0]
    if not re.fullmatch(r"/home/ubuntu/appdb-backup-[A-Za-z0-9]{8}", remote_folder):
        raise ValueError("UNEXPECTED_BACKUP_PATH")
    local = pathlib.Path(tempfile.mkdtemp(prefix="memoryjar-backup-", dir="C:/Users/whdgu/Downloads"))
    run(["scp", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-i", str(IDENTITY),
         TARGET + ":" + remote_folder + "/appdb.sql.gz", TARGET + ":" + remote_folder + "/SHA256SUMS", str(local)])
    actual = hashlib.sha256((local / "appdb.sql.gz").read_bytes()).hexdigest()
    if actual != lines[1].split()[0] or not (local / "SHA256SUMS").read_text().startswith(actual + " "):
        raise ValueError("BACKUP_CHECKSUM_MISMATCH")
    result = {"remoteFolder": remote_folder, "localFolder": str(local), "sha256": actual,
              "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    write_private(folder / "backup.json", result)
    return result


def verify_runtime(folder):
    expected = json.loads((folder / "runtime.json").read_text())["containers"]
    template = ('{"name":{{json .Name}},"image":{{json .Image}},"running":{{.State.Running}},'
                '"startedAt":{{json .State.StartedAt}},"restarts":{{.RestartCount}},"oomKilled":{{.State.OOMKilled}}}')
    current = [json.loads(line) for line in remote("docker inspect --format " + shlex.quote(template)
                                               + " spring-api mariadb").decode().splitlines()]
    if current != expected:
        raise ValueError("DEPLOYMENT_OR_CONTAINER_STATE_CHANGED_RECHECK_FIRST")


def revoke_test_sessions_sql(value):
    """실패한 준비에서 남은 전용 계정 세션만 폐기한다. 실제 사용자·sessionVersion은 변경하지 않는다."""
    if value.get("scope") != "ec2-prepared" or not re.fullmatch(r"lt[a-f0-9]{8}", value.get("runId", "")):
        raise ValueError("PREPARED_FIXTURE_REQUIRED")
    if len(value.get("accounts", [])) != 10 or any(type(a["userId"]) is not int or a["userId"] <= 0 for a in value["accounts"]):
        raise ValueError("TEN_PREPARED_IDENTITIES_REQUIRED")
    user_ids = ",".join(str(a["userId"]) for a in value["accounts"])
    return ("UPDATE refresh_tokens r JOIN users u ON u.id=r.user_id JOIN user_local_credentials c ON c.user_id=u.id "
            "SET r.revoked_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 9 HOUR) WHERE r.revoked_at IS NULL AND r.user_id IN ("
            + user_ids + ") AND LEFT(c.login_id,10)=" + hex_text(value["runId"])
            + " AND u.email=CONCAT(c.login_id,'@example.invalid'); SELECT ROW_COUNT();")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """인증정보를 다른 주소로 넘기거나 로그인 HTML을 성공으로 오인하지 않는다."""
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def preflight(folder):
    """순차·저속 HTTP만 확인하고 지연 시간·처리량을 성능 기준값으로 저장하지 않는다."""
    verify_runtime(folder)
    value = json.loads((folder / "fixture.private.json").read_text(encoding="utf-8"))
    if value.get("scope") != "ec2-prepared":
        raise ValueError("PREPARED_FIXTURE_REQUIRED")
    progress_path = folder / ("preflight-attempt-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + ".jsonl")
    def progress(event, account, path, error=None):
        with progress_path.open("a", encoding="utf-8") as log:
            json.dump({"event": event, "accountIndex": account, "path": path,
                       "errorType": error, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}, log)
            log.write("\n")
    samples = []
    for index, account in enumerate(value["accounts"]):
        cookies = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                    urllib.request.HTTPCookieProcessor(cookies), NoRedirect())
        logged_in = False

        def request(path, body=None, headers=None):
            if not (path in ("/api/v1/csrf", "/api/v1/auth/login", "/api/v1/auth/logout", "/api/v1/me",
                             "/api/v1/jars?page=0&size=20")
                    or re.fullmatch(r"/api/v1/jars/[0-9]+(?:/notes\?page=[01]&size=20)?", path)):
                raise ValueError("UNAPPROVED_PREFLIGHT_PATH")
            time.sleep(.5)
            data = None if body is None else json.dumps(body).encode()
            call = urllib.request.Request(API + path, data=data,
                headers={"Content-Type": "application/json", **(headers or {})})
            progress("start", index, path)
            try:
                with opener.open(call, timeout=5) as response:
                    if response.status != 200:
                        raise ValueError("PREFLIGHT_HTTP_FAILED")
                    raw = response.read().decode()
                progress("success", index, path)
            except Exception as error:
                progress("failed", index, path, type(error).__name__)
                raise
            return raw, json.loads(raw)["data"]

        try:
            _, csrf = request("/api/v1/csrf")
            if csrf["headerName"] != "X-XSRF-TOKEN":
                raise ValueError("UNEXPECTED_CSRF_HEADER")
            _, authenticated = request("/api/v1/auth/login", {"loginId": account["loginId"], "password": account["password"]},
                                       {"X-XSRF-TOKEN": csrf["token"]})
            logged_in = True
            if authenticated["userId"] != account["userId"]:
                raise ValueError("LOGIN_IDENTITY_MISMATCH")
            _, me = request("/api/v1/me")
            if int(me["userId"]) != account["userId"]:
                raise ValueError("ME_IDENTITY_MISMATCH")
            raw, _ = request("/api/v1/jars?page=0&size=20")
            samples.append({"endpoint": "jar_list", "jarIndex": 0, "page": 0, "userId": account["userId"], "status": 200, "body": raw})
            if index == 0:
                for jar_index, jar in enumerate(value["jars"]):
                    for endpoint, page, suffix in [("jar_detail", 0, ""), ("note_list", 0, "/notes?page=0&size=20"), ("note_list", 1, "/notes?page=1&size=20")]:
                        raw, _ = request("/api/v1/jars/" + str(jar["jarId"]) + suffix)
                        samples.append({"endpoint": endpoint, "jarIndex": jar_index, "page": page,
                                        "userId": account["userId"], "status": 200, "body": raw})
        finally:
            if logged_in:
                _, csrf = request("/api/v1/csrf")
                request("/api/v1/auth/logout", {}, {"X-XSRF-TOKEN": csrf["token"]})
    checked = json.loads(run(["node", str(ROOT / "tools/load/check-prepared-responses.mjs")],
        json.dumps({"api": API, "fixture": value, "samples": samples}).encode()))
    verify_runtime(folder)
    write_private(folder / "preflight-summary.json", {**checked, "accountsChecked": 10, "loggedOut": 10,
                  "mode": "SEQUENTIAL_FUNCTIONAL_CHECK_NO_VUS", "loadStarted": False})
    print("EC2_PREPARATION_FUNCTIONAL_CHECK_PASSED: ten identities, 19 read responses, logged out; not a performance result")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["plan", "inspect", "runtime", "backup", "local-check", "provision", "preflight", "fixture-status", "revoke-test-sessions"])
    parser.add_argument("--folder", type=pathlib.Path, required=True)
    parser.add_argument("--container")
    parser.add_argument("--approve-provision", action="store_true")
    parser.add_argument("--approve-session-cleanup", action="store_true")
    parser.add_argument("--restored-backup-sha256")
    args = parser.parse_args()
    args.folder.mkdir(parents=True, exist_ok=True)
    if args.mode == "plan":
        make_plan(args.folder)
        print("PRIVATE_PLAN_CREATED: ten unique test accounts; passwords not printed")
        return
    if args.mode == "backup":
        result = backup(args.folder)
        print("BACKUP_VERIFIED_AND_COPIED: " + result["localFolder"])
        return
    if args.mode == "runtime":
        template = ('{"name":{{json .Name}},"image":{{json .Image}},"running":{{.State.Running}},'
                    '"startedAt":{{json .State.StartedAt}},"restarts":{{.RestartCount}},"oomKilled":{{.State.OOMKilled}}}')
        rows = remote("docker inspect --format " + shlex.quote(template) + " spring-api mariadb").decode().splitlines()
        containers = [json.loads(row) for row in rows]
        if len(containers) != 2 or not all(c["running"] and not c["oomKilled"] for c in containers):
            raise ValueError("OPERATING_CONTAINERS_NOT_READY")
        image = next(c["image"] for c in containers if c["name"] == "/spring-api")
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", image):
            raise ValueError("INVALID_IMAGE_ID")
        digests = json.loads(remote("docker image inspect --format '{{json .RepoDigests}}' " + image))
        result = {"containers": containers, "apiDigests": digests}
        write_private(args.folder / "runtime.json", result)
        print(json.dumps(result))
        return
    if args.mode == "inspect":
        result = json.loads(sql("SELECT JSON_OBJECT('dbVersion',VERSION(),'migration',(SELECT version FROM flyway_schema_history WHERE success=1 AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1),'failedMigrations',(SELECT count(*) FROM flyway_schema_history WHERE success=0),'triggers',(SELECT count(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='appdb'),'testAccounts',(SELECT count(*) FROM user_local_credentials WHERE login_id REGEXP '^lt[0-9a-f]{8}[0-9]{2}$'),'users',(SELECT count(*) FROM users),'jars',(SELECT count(*) FROM jars),'notes',(SELECT count(*) FROM notes));"))
        write_private(args.folder / "inspect.json", result)
        print(json.dumps(result))
        return
    plan = json.loads((args.folder / "plan.private.json").read_text(encoding="utf-8"))
    validate_plan(plan)
    if args.mode == "local-check":
        if not re.fullmatch(r"[a-f0-9]{64}", args.restored_backup_sha256 or ""):
            raise ValueError("RESTORED_BACKUP_CHECKSUM_REQUIRED")
        result = local_check(args.container or "", plan)
        result.update(planSha256=plan_checksum(plan), sourceBackupSha256=args.restored_backup_sha256, signalErrorCode=1644,
                      sqlSha256=hashlib.sha256(seed_sql(plan).encode()).hexdigest())
        write_private(args.folder / "local-provision-check-v3.json", result)
        print(json.dumps(result))
        return
    if args.mode == "preflight":
        preflight(args.folder)
        return
    if args.mode == "revoke-test-sessions":
        if not args.approve_session_cleanup:
            raise ValueError("EXPLICIT_TEST_SESSION_CLEANUP_APPROVAL_REQUIRED")
        verify_runtime(args.folder)
        value = json.loads((args.folder / "fixture.private.json").read_text(encoding="utf-8"))
        if value["runId"] != plan["runId"]:
            raise ValueError("PREPARED_PLAN_MISMATCH")
        check = json.loads((args.folder / "local-provision-check-v3.json").read_text())
        if check.get("testSessionCleanupVerified") is not True or check.get("planSha256") != plan_checksum(plan):
            raise ValueError("LOCAL_SESSION_CLEANUP_CHECK_REQUIRED")
        affected = int(sql(revoke_test_sessions_sql(value)).strip())
        write_private(args.folder / "test-session-cleanup.json", {"revokedTestRefreshTokens": affected,
                      "scope": "DEDICATED_TEST_ACCOUNTS_ONLY"})
        print("TEST_REFRESH_SESSIONS_REVOKED: " + str(affected))
        return
    if args.mode == "fixture-status":
        value = json.loads((args.folder / "fixture.private.json").read_text(encoding="utf-8"))
        user_ids = ",".join(str(int(a["userId"])) for a in value["accounts"])
        jar_ids = ",".join(str(int(j["jarId"])) for j in value["jars"])
        result = json.loads(sql("SELECT JSON_OBJECT('accounts',(SELECT count(*) FROM users WHERE id IN (" + user_ids
            + ")),'jars',(SELECT count(*) FROM jars WHERE jar_id IN (" + jar_ids + ")),'members',(SELECT count(*) FROM jar_members WHERE jar_id IN (" + jar_ids
            + ")),'notes',(SELECT count(*) FROM notes WHERE jar_id IN (" + jar_ids + ")),'openEvents',(SELECT count(*) FROM jar_open_events WHERE jar_id IN (" + jar_ids
            + ")),'foreignMembers',(SELECT count(*) FROM jar_members WHERE jar_id IN (" + jar_ids + ") AND user_id NOT IN (" + user_ids
            + ")),'foreignAuthors',(SELECT count(*) FROM notes WHERE jar_id IN (" + jar_ids + ") AND author_id NOT IN (" + user_ids
            + ")),'refreshTotal',(SELECT count(*) FROM refresh_tokens WHERE user_id IN (" + user_ids
            + ")),'refreshActive',(SELECT count(*) FROM refresh_tokens WHERE user_id IN (" + user_ids + ") AND revoked_at IS NULL));"))
        write_private(args.folder / ("fixture-status-" + datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S") + ".json"), result)
        print(json.dumps(result))
        return
    if not args.approve_provision:
        raise ValueError("EXPLICIT_PROVISION_APPROVAL_REQUIRED")
    check_file = args.folder / "local-provision-check-v3.json"
    if not check_file.exists():
        check_file = args.folder / "local-provision-check-v2.json"
    validation = json.loads(check_file.read_text())
    record = json.loads((args.folder / "backup.json").read_text())
    if not all(validation.get(k) is True for k in ("rollbackVerified", "duplicateRejected", "originalTableChecksumsUnchanged")):
        raise ValueError("LOCAL_PROVISION_VERIFICATION_REQUIRED")
    if validation.get("signalErrorCode") != 1644:
        raise ValueError("EXACT_SQL_FAILURE_VERIFICATION_REQUIRED")
    backup_file = pathlib.Path(record["localFolder"]) / "appdb.sql.gz"
    if hashlib.sha256(backup_file.read_bytes()).hexdigest() != record["sha256"]:
        raise ValueError("BACKUP_REQUIRED")
    if validation.get("planSha256") != plan_checksum(plan) or validation.get("sourceBackupSha256") != record["sha256"]:
        raise ValueError("VERIFIED_PLAN_AND_BACKUP_MUST_MATCH")
    if validation.get("sqlSha256") != hashlib.sha256(seed_sql(plan).encode()).hexdigest():
        raise ValueError("VERIFIED_SQL_MUST_MATCH")
    captured = record.get("capturedAt")
    # 초기 백업 기록과도 호환하되 실제로 복사한 파일의 시각으로 30분 제한을 유지한다.
    captured_timestamp = datetime.datetime.fromisoformat(captured).timestamp() if captured else backup_file.stat().st_mtime
    age = datetime.datetime.now(datetime.timezone.utc).timestamp() - captured_timestamp
    if not 0 <= age <= 1800 or (args.folder / "fixture.private.json").exists():
        raise ValueError("FRESH_BACKUP_AND_UNPROVISIONED_PLAN_REQUIRED")
    verify_runtime(args.folder)
    # 실패 시 자동 재시도하지 않는다. 커밋 후 통신이 끊겼다면 먼저 조회로 결과를 확인해야 한다.
    sql(seed_sql(plan))
    value = manifest(plan)
    write_private(args.folder / "fixture.private.json", value)
    write_private(args.folder / "provision-summary.json", {"scope": "PREPARATION_ONLY_NOT_LOAD_TEST",
        "accounts": 10, "jars": 3, "notes": 120, "runId": plan["runId"]})
    print("FIXTURE_PROVISIONED: 10 accounts, 3 jars, 120 text notes; no load started")


if __name__ == "__main__":
    try:
        main()
    except Exception as failure:
        print("PREPARATION_STOPPED (" + type(failure).__name__ + "): private command/SQL/response details suppressed; do not retry writes blindly", file=sys.stderr)
        sys.exit(1)
