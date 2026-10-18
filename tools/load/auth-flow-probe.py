"""전용 계정 3개의 기존 3초 인증 흐름을 계측하고 실패 후 늦은 세션까지 정리한다."""
import argparse
import datetime
import http.cookiejar
import importlib.util
import json
import pathlib
import queue
import re
import subprocess
import threading
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


prep = load('auth_prep', 'tools/load/ec2-read-prep.py')
guard = load('auth_guard', 'tools/monitoring/guard-load.py')
recovery = load('auth_recovery', 'tools/load/auth-recovery.py')


class AuthProbe:
    """실제 사용자와 비용 경로를 제외하고, 인증·계측·후속 정리의 책임을 분리한다."""
    def __init__(self, fixture, runtime, output):
        self.fixture, self.runtime, self.output = fixture, runtime, output
        if fixture.get('scope') != 'ec2-prepared' or not re.fullmatch(r'lt[a-f0-9]{8}', fixture.get('runId', '')):
            raise ValueError('DEDICATED_FIXTURE_REQUIRED')
        accounts = fixture.get('accounts', [])
        if len(accounts) != 10 or len({a['userId'] for a in accounts}) != 10:
            raise ValueError('TEN_UNIQUE_ACCOUNTS_REQUIRED')
        for account in accounts:
            if type(account['userId']) is not int or account['userId'] <= 0 or not re.fullmatch(re.escape(fixture['runId'])+r'[0-9]{2}', account['loginId']):
                raise ValueError('INVALID_TEST_ACCOUNT')
        self.accounts = accounts[:3]
        self.samples, self.phases, self.attempted = [], [], []
        self.messages, self.policy = queue.Queue(), guard.Policy()
        self.last_received = None
        self.started = time.monotonic()
        self.collector = None

    def where(self):
        ids = ','.join(str(a['userId']) for a in self.accounts)
        return 'r.user_id IN ('+ids+') AND LEFT(c.login_id,10)='+prep.hex_text(self.fixture['runId'])+" AND u.email=CONCAT(c.login_id,'@example.invalid')"

    def active(self):
        return int(prep.sql('SELECT COUNT(*) FROM refresh_tokens r JOIN users u ON u.id=r.user_id JOIN user_local_credentials c ON c.user_id=u.id WHERE r.revoked_at IS NULL AND '+self.where()+';').strip())

    def append(self, name, value):
        with (self.output / name).open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(value)+'\n')

    def pump(self, seconds, safe=True):
        """수집 장애를 0으로 숨기지 않는다. 실패 후 대기는 별도 recovery가 끝까지 유지한다."""
        deadline = time.monotonic()+seconds
        while time.monotonic() < deadline:
            try:
                line = self.messages.get(timeout=min(.5, max(.01, deadline-time.monotonic())))
            except queue.Empty:
                if time.monotonic()-(self.last_received or self.started) > (15 if self.last_received else 20):
                    raise RuntimeError('COLLECTION_STALE')
                continue
            if line is None:
                raise RuntimeError('COLLECTOR_ENDED')
            value = json.loads(line)
            self.append('samples.jsonl', value)
            checked = self.policy.check(value, time.monotonic())
            self.last_received = time.monotonic()
            self.samples.append(value)
            if not value['application']['loginDiagnostics']['enabled']:
                raise RuntimeError('DIAGNOSTICS_DISABLED')
            if safe and checked['warnings']:
                raise RuntimeError('RESOURCE_WARNING')

    def call(self, opener, index, phase, path, body=None, token=None, expected_user=None):
        """허용한 세 인증 경로만 호출하며 원문 응답·쿠키·비밀번호는 기록하지 않는다."""
        self.pump(.01)
        if self.last_received is None or time.monotonic()-self.last_received > 10:
            raise RuntimeError('STALE_BEFORE_HTTP')
        if path not in ['/api/v1/csrf','/api/v1/auth/login','/api/v1/auth/logout']:
            raise ValueError('UNAPPROVED_PATH')
        headers = {'Content-Type':'application/json'}
        if token:
            headers['X-XSRF-TOKEN'] = token
        request = urllib.request.Request(prep.API+path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        entry = {'accountIndex':index,'phase':phase,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        started = time.perf_counter()
        try:
            with opener.open(request, timeout=3) as response:
                entry['httpStatus'] = response.status
                if response.status != 200:
                    raise ValueError('HTTP_FAILED')
                data = json.loads(response.read())['data']
            if phase in ['INITIAL_CSRF','POST_LOGIN_CSRF'] and (data['headerName'] != 'X-XSRF-TOKEN' or not data['token']):
                raise ValueError('CSRF_INVALID')
            if expected_user is not None:
                entry['identityMatched'] = data['userId'] == expected_user
                if not entry['identityMatched']:
                    raise ValueError('IDENTITY_MISMATCH')
            if phase == 'LOGOUT' and data.get('ok') is not True:
                raise ValueError('LOGOUT_NOT_CONFIRMED')
            if time.perf_counter()-started > 3:
                raise RuntimeError('CLIENT_ELAPSED_OVER_3S')
            entry['passed'] = True
            return data
        except Exception as error:
            entry.update(passed=False, errorType=type(error).__name__)
            raise
        finally:
            entry.update(elapsedMillis=(time.perf_counter()-started)*1000,
                         completedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
            self.phases.append(entry)
            self.append('phases.jsonl', entry)
            print(json.dumps(entry), flush=True)

    def cleanup(self):
        """사용한 전용 계정만 정리한다. 늦은 서버 완료 대기는 호출자가 먼저 수행한다."""
        if not self.attempted:
            return 0
        ids = ','.join(str(a['userId']) for a in self.attempted)
        return int(prep.sql('UPDATE refresh_tokens r JOIN users u ON u.id=r.user_id JOIN user_local_credentials c ON c.user_id=u.id SET r.revoked_at=DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 9 HOUR) WHERE r.revoked_at IS NULL AND '+self.where()+' AND r.user_id IN ('+ids+'); SELECT ROW_COUNT();').strip())

    def run(self):
        prep.verify_runtime(self.runtime)
        if self.active() != 0:
            raise ValueError('PREEXISTING_TEST_SESSION')
        settings = json.loads(prep.sql("SELECT JSON_OBJECT('keyBuffer',@@key_buffer_size,'ariaCache',@@aria_pagecache_buffer_size,'innodbPool',@@innodb_buffer_pool_size);").strip())
        if settings != {'keyBuffer':8388608,'ariaCache':33554432,'innodbPool':134217728}:
            raise ValueError('DB_SETTINGS_CHANGED')
        prep.write_private(self.output/'settings.json', settings)
        self.collector = subprocess.Popen(prep.ssh_args()+['python3 -u -'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.collector.stdin.write((ROOT/'tools/monitoring/collect-resources.py').read_bytes())
        self.collector.stdin.close()
        def receive():
            for line in self.collector.stdout:
                self.messages.put(line)
            self.messages.put(None)
        threading.Thread(target=receive, daemon=True).start()
        result = {'status':'COMPLETED','completedFlows':0,'failedPhase':None}
        try:
            self.pump(15)
            for index, account in enumerate(self.accounts):
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
                           urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), prep.NoRedirect())
                csrf = self.call(opener,index,'INITIAL_CSRF','/api/v1/csrf')
                self.attempted.append(account)
                self.call(opener,index,'LOGIN','/api/v1/auth/login',{'loginId':account['loginId'],'password':account['password']},csrf['token'],account['userId'])
                csrf = self.call(opener,index,'POST_LOGIN_CSRF','/api/v1/csrf')
                self.call(opener,index,'LOGOUT','/api/v1/auth/logout',{},csrf['token'])
                result['completedFlows'] += 1
                self.pump(10)
            self.pump(20)
        except Exception:
            result.update(status='STOPPED',failedPhase=next((p['phase'] for p in reversed(self.phases) if not p['passed']),'RESOURCE_OR_PREFLIGHT'))
            result['recovery'] = recovery.settle_after_failure(lambda seconds:self.pump(seconds,False))
        finally:
            if self.collector.poll() is None:
                self.collector.terminate()
            try:
                self.collector.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.collector.kill()
                self.collector.wait(timeout=5)
            result.update(cleanupRevoked=None,remainingActiveTestSessions=None)
            try:
                result['cleanupRevoked'] = self.cleanup()
                result['remainingActiveTestSessions'] = self.active()
                prep.verify_runtime(self.runtime)
            except Exception as error:
                # 정리 실패·서버 교체를 성공/0개로 숨기지 않고 결과 파일에 남긴다.
                result.update(status='STOPPED',cleanupError=type(error).__name__)
                result['failedPhase'] = result['failedPhase'] or 'CLEANUP_OR_RUNTIME'
            result.update(plannedFlows=3,phases=self.phases,sampleCount=len(self.samples),timeoutSeconds=3,loadStarted=False,
                          scope='SEQUENTIAL_AUTH_FLOW_DIAGNOSTIC_NOT_VU_CAPACITY')
            prep.write_private(self.output/'summary.json',result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True, type=pathlib.Path)
    parser.add_argument('--fixture', required=True, type=pathlib.Path)
    parser.add_argument('--output', required=True, type=pathlib.Path)
    parser.add_argument('--approve-sequential-auth', action='store_true')
    args = parser.parse_args()
    if not args.approve_sequential_auth:
        raise ValueError('EXPLICIT_AUTH_PROBE_APPROVAL_REQUIRED')
    # 결과를 일반 소스 폴더에 쓰지 않도록 build 아래로 제한한다. Python 3.8도 지원한다.
    try:
        args.output.resolve().relative_to((ROOT/'build').resolve())
    except ValueError:
        raise ValueError('OUTPUT_MUST_BE_UNDER_BUILD')
    args.output.mkdir(parents=True,exist_ok=False)
    result = AuthProbe(json.loads(args.fixture.read_text(encoding='utf-8')),args.runtime,args.output).run()
    print(json.dumps(result),flush=True)
    return 0 if result['status']=='COMPLETED' and result['remainingActiveTestSessions']==0 else 2


if __name__ == '__main__':
    raise SystemExit(main())
