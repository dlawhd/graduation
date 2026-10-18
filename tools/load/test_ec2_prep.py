"""운영 접속 없이 생성 SQL의 범위·검증과 로컬 대상 보호를 검사한다."""
import copy
import importlib.util
import pathlib
import json
import tempfile
import urllib.parse
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("ec2_prep", ROOT / "ec2-read-prep.py")
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


def plan():
    return {"schema": 1, "runId": "ltabcdef12", "accounts": [
        {"loginId": "ltabcdef12%02d" % i, "password": "Lt!7" + "a" * 32,
         "hash": "$argon2id$v=19$m=19456,t=2,p=1$" + "A" * 22 + "$" + "B" * 43}
        for i in range(10)]}


class PrepTest(unittest.TestCase):
    """시험 도구가 기존 행 수정·삭제·DDL·비밀 출력 경로를 만들지 않는지 확인한다."""
    def test_insert_only_176_rows_in_one_transaction(self):
        sql = prep.seed_sql(plan())
        self.assertEqual(176, sql.count("INSERT INTO "))
        self.assertEqual(1, sql.count("START TRANSACTION;"))
        self.assertEqual(1, sql.count("COMMIT;"))
        for keyword in ("UPDATE ", "DELETE ", "CREATE ", "ALTER ", "DROP "):
            self.assertTrue(keyword not in sql, "SQL must remain insert-only")
        self.assertTrue("ROLLBACK;" in sql and "RESIGNAL;" in sql, "Rollback handler required")
        self.assertTrue("TRANSACTIONAL_TABLES_REQUIRED" in sql)

    def test_password_plaintext_not_sent_to_database(self):
        sql = prep.seed_sql(plan())
        self.assertTrue(plan()["accounts"][0]["password"] not in sql)
        self.assertTrue(prep.hex_text(plan()["accounts"][0]["hash"]) in sql)

    def test_database_schema_collision_trigger_guards_exist(self):
        sql = prep.seed_sql(plan())
        for marker in ("WRONG_DATABASE", "SCHEMA_MISMATCH", "FIXTURE_ALREADY_EXISTS", "UNREVIEWED_TRIGGER"):
            self.assertTrue(marker in sql, "Missing SQL guard")

    def test_injection_or_unexpected_password_settings_are_rejected(self):
        for field, invalid in (("runId", "';DROP TABLE users;--"), ("loginId", "real-user"),
                               ("hash", "$argon2id$v=19$m=1,t=1,p=1$foo$bar")):
            value = copy.deepcopy(plan())
            if field == "runId": value[field] = invalid
            else: value["accounts"][0][field] = invalid
            with self.assertRaises(ValueError): prep.seed_sql(value)

    def test_local_checks_refuse_operating_or_development_container(self):
        with mock.patch.object(prep, "run") as run:
            for name in ("mariadb", "graduation-local-db", "memoryjar-restore-not-valid", ""):
                with self.assertRaises(ValueError): prep.local_check(name, plan())
            run.assert_not_called()

    def test_rollback_probe_occurs_before_commit(self):
        sql = prep.seed_sql(plan(), fail_before_commit=True)
        self.assertLess(sql.index("LOCAL_ROLLBACK_PROBE"), sql.index("COMMIT;"))

    def test_session_cleanup_is_limited_to_test_ids_and_reserved_email(self):
        value = {"scope": "ec2-prepared", "runId": "ltabcdef12", "accounts": [{"userId": i + 1} for i in range(10)]}
        sql = prep.revoke_test_sessions_sql(value)
        self.assertTrue("r.user_id IN (1,2,3,4,5,6,7,8,9,10)" in sql)
        self.assertTrue("@example.invalid" in sql and "LEFT(c.login_id,10)=" in sql)
        self.assertTrue("r.revoked_at IS NULL" in sql)
        self.assertTrue("UPDATE users" not in sql and "session_version" not in sql)
        with self.assertRaises(ValueError): prep.revoke_test_sessions_sql({**value, "accounts": []})

    def test_sequential_preflight_contract_without_network(self):
        # HTTP 연결은 전부 대역으로 받고 응답 판정은 실제 공유 Node 검증기를 사용한다.
        data = {"schema": 1, "scope": "ec2-prepared", "runId": "ltabcdef12", "pageSize": 20, "notesPerJar": 40,
            "accounts": [{"userId": i + 1, "loginId": "ltabcdef12%02d" % i, "password": "mock-only-password"} for i in range(10)],
            "jars": [{"jarId": j + 1, "ownerId": j + 1, "name": "ltabcdef12-jar-" + str(j),
                      "noteIds": list(range(j * 40 + 40, j * 40, -1))} for j in range(3)]}
        calls = []

        class Response:
            status = 200
            def __init__(self, value): self.value = value
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps({"data": self.value}).encode()

        class Opener:
            def open(self, call, timeout):
                path = urllib.parse.urlparse(call.full_url)
                calls.append((call.get_method(), path.path))
                if path.path.endswith("/csrf"): return Response({"headerName": "X-XSRF-TOKEN", "token": "mock-csrf"})
                if path.path.endswith("/login"):
                    login = json.loads(call.data)["loginId"]
                    self.user = next(a["userId"] for a in data["accounts"] if a["loginId"] == login)
                    return Response({"userId": self.user})
                if path.path.endswith("/logout"): return Response({"ok": True})
                if path.path.endswith("/me"): return Response({"userId": self.user})

                def item(jar):
                    return {**jar, "isOpen": True, "myRole": "OWNER" if jar["ownerId"] == self.user else "MEMBER",
                            "memberCount": 10, "maxMembers": 10, "design": None, "openMode": "ALL_AT_ONCE"}
                if path.path == "/api/v1/jars":
                    return Response({"page": 0, "size": 20, "totalElements": 3, "totalPages": 1, "items": [item(j) for j in data["jars"]]})
                jar = next(j for j in data["jars"] if j["jarId"] == int(path.path.split("/")[4]))
                if not path.path.endswith("/notes"): return Response(item(jar))
                page = int(urllib.parse.parse_qs(path.query)["page"][0])
                return Response({"page": page, "size": 20, "totalElements": 40, "totalPages": 2,
                    "items": [{"noteId": n, "title": "ltabcdef12-note-1", "authorId": 1,
                        "previewContent": "가상 본문", "isEncrypted": False, "attachments": [],
                        "reactionCounts": [], "myReaction": None, "commentCount": 0}
                        for n in jar["noteIds"][page * 20:(page + 1) * 20]]})

        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory)
            prep.write_private(folder / "fixture.private.json", data)
            with mock.patch.object(prep, "verify_runtime") as runtime, \
                    mock.patch.object(prep.urllib.request, "build_opener", side_effect=lambda *_: Opener()), \
                    mock.patch.object(prep.time, "sleep"), \
                    mock.patch.object(prep, "remote", side_effect=AssertionError("No SSH in local unit test")):
                prep.preflight(folder)
            result = json.loads((folder / "preflight-summary.json").read_text())
            self.assertEqual(19, result["validatedReadResponses"])
            self.assertEqual(10, result["loggedOut"])
            self.assertFalse(result["loadStarted"])
            self.assertEqual(69, len(calls))
            self.assertEqual(2, runtime.call_count)


if __name__ == "__main__":
    unittest.main(verbosity=2)
