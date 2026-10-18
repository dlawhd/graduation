"""로컬 HTTP 대역의 오류·지연에 실제 k6가 중단되는지 검사한다. EC2 성능 시험이 아니다."""

import http.cookies
import http.server
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("load_guard", ROOT.parent / "monitoring" / "guard-load.py")
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def fixture():
    return {"schema": 1, "scope": "isolated-local", "runId": "ltabcdef12", "pageSize": 20, "notesPerJar": 40,
            "accounts": [{"userId": i + 1, "loginId": "ltabcdef12" + str(i), "password": "mock-only-password"}
                         for i in range(10)],
            "jars": [{"jarId": j + 1, "ownerId": j + 1, "name": "ltabcdef12-jar-" + str(j),
                      "noteIds": list(range(j * 40 + 40, j * 40, -1))} for j in range(3)]}


def handler(fault):
    class LocalApi(http.server.BaseHTTPRequestHandler):
        """HTTP 대역만 담당한다. 실제 Spring 인증·권한은 별도 Docker 시험에서 검사한다."""
        def log_message(self, *_):
            pass

        def send(self, status, data, cookie=None, raw=False):
            body = data.encode() if raw else json.dumps({"data": data}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            if cookie:
                self.send_header("Set-Cookie", cookie + "; Path=/")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass

        def do_POST(self):
            if self.path != "/api/v1/auth/login":
                self.send(403, {})
                return
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            account = next(a for a in fixture()["accounts"] if a["loginId"] == body["loginId"])
            self.send(200, {"userId": account["userId"]}, "accessToken=local-user-" + str(account["userId"]))

        def do_GET(self):
            path = urllib.parse.urlparse(self.path)
            if path.path == "/api/v1/csrf":
                self.send(200, {"headerName": "X-XSRF-TOKEN", "token": "local-csrf"}, "XSRF-TOKEN=local-csrf")
                return
            cookies = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
            if "accessToken" not in cookies:
                self.send(401, {})
                return
            user = int(cookies["accessToken"].value[len("local-user-"):])
            if path.path == "/api/v1/me":
                self.send(200, {"userId": user})
                return
            data = fixture()

            def jar_item(jar):
                return {**jar, "isOpen": True, "myRole": "OWNER" if jar["ownerId"] == user else "MEMBER",
                        "memberCount": 10, "maxMembers": 10, "design": None, "openMode": "ALL_AT_ONCE"}

            if path.path == "/api/v1/jars":
                self.send(200, {"items": [jar_item(j) for j in data["jars"]], "page": 0,
                                "size": 20, "totalElements": 3, "totalPages": 1})
                return
            parts = path.path.split("/")
            jar = next(j for j in data["jars"] if j["jarId"] == int(parts[4]))
            if len(parts) == 5:
                if fault == "slow":
                    time.sleep(.65)
                self.send(200, jar_item(jar))
                return
            if parts[5] != "notes":
                self.send(403, {})
                return
            if fault == "http_error":
                self.send(500, {})
                return
            if fault == "invalid_json":
                self.send(200, "not-json", raw=True)
                return
            page = int(urllib.parse.parse_qs(path.query)["page"][0])
            items = [{"noteId": note, "authorId": 1, "title": data["runId"] + "-note-1",
                      "previewContent": "mock text", "isEncrypted": False, "attachments": [],
                      "reactionCounts": [], "myReaction": None, "commentCount": 0}
                     for note in jar["noteIds"][page * 20:(page + 1) * 20]]
            self.send(200, {"items": items, "page": page, "size": 20, "totalElements": 40, "totalPages": 2})

    return LocalApi


@unittest.skipUnless(shutil.which("k6"), "Actual k6 executable required")
class AbortTest(unittest.TestCase):
    """실제 k6 종료 코드와 완료 반복 수로 최종 실패와 실행 중 중단을 구분한다."""
    def run_case(self, fault):
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler(fault))
        server.daemon_threads = True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        process = None
        try:
            with tempfile.TemporaryDirectory(prefix="memoryjar-read-probe-") as temporary:
                folder = pathlib.Path(temporary)
                manifest = folder / "fixture.json"
                manifest.write_text(json.dumps(fixture()), encoding="utf-8")
                summary = folder / "summary.json"
                env = dict(os.environ, HTTP_PROXY="", HTTPS_PROXY="", NO_PROXY="127.0.0.1,localhost")
                started = time.monotonic()
                with (folder / "k6.log").open("wb") as log:
                    process = guard.start_process([shutil.which("k6"), "run", "--no-usage-report", "--summary-export", str(summary),
                        "--env", "FIXTURE_PATH=" + str(manifest), "--env",
                        "BASE_URL=http://127.0.0.1:" + str(server.server_port), "--env",
                        "LOCAL_ABORT_PROBE=" + ("0" if fault is None else "1"), str(ROOT / "read-local.js")],
                        env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
                    try:
                        process.wait(timeout=30)
                    finally:
                        guard.stop_owned(process)
                metrics = json.loads(summary.read_text())["metrics"]
                def metric(name):
                    return metrics[name].get("values", metrics[name])
                if fault is None:
                    self.assertEqual(0, process.returncode)
                    self.assertEqual(30, metric("read_requests")["count"])
                    self.assertEqual(0, metric("read_errors")["rate"] if "rate" in metric("read_errors")
                                     else metric("read_errors")["value"])
                else:
                    self.assertNotEqual(0, process.returncode)
                    self.assertLess(metric("read_requests")["count"], 400, "종료 시 실패가 아니라 실행 중 중단해야 함")
                    self.assertLess(time.monotonic() - started, 28)
                    if fault == "slow":
                        self.assertGreater(metric("http_req_duration{phase:read,endpoint:jar_detail}")["p(95)"], 500)
                    else:
                        errors = metric("read_errors")
                        self.assertGreater(errors.get("rate", errors.get("value")), .01)
        finally:
            guard.stop_owned(process)
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_normal_contract_finishes(self):
        self.run_case(None)

    def test_http_error_aborts(self):
        self.run_case("http_error")

    def test_invalid_json_aborts(self):
        self.run_case("invalid_json")

    def test_slow_response_aborts(self):
        self.run_case("slow")


if __name__ == "__main__":
    unittest.main(verbosity=2)
