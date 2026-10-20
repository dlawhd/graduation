"""EC2에서 API만 digest로 교체한다. 준비 상태 실패 시 DB를 보존하며 이전 API로 원복한다."""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request


class DeployError(RuntimeError):
    """외부 명령의 환경값·SQL·오류 원문 대신 고정 코드만 보고한다."""


def require(condition, code):
    if not condition:
        raise DeployError(code)


def command(args, data=None, timeout=30):
    """자식 프로세스 출력을 캡처한다. 실패 원문에는 비밀값이 있을 수 있어 출력하지 않는다."""
    try:
        value = subprocess.run(args, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise DeployError('COMMAND_UNAVAILABLE_OR_TIMEOUT') from None
    require(value.returncode == 0, 'COMMAND_FAILED_REDACTED')
    return value.stdout.decode()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """GitHub 토큰이 다른 호스트로 전달되지 않도록 redirect를 거절한다."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def github_head(repository):
    """변경 직전 main을 다시 읽는다. 토큰은 환경으로만 받고 오류 응답은 보존하지 않는다."""
    token = os.environ.get('GITHUB_TOKEN', '')
    require(bool(token), 'GITHUB_TOKEN_REQUIRED')
    request = urllib.request.Request('https://api.github.com/repos/' + repository + '/git/ref/heads/main',
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'memoryjar-deploy'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=10) as response:
            return json.load(response)['object']['sha']
    except Exception:
        raise DeployError('FRESHNESS_LOOKUP_FAILED') from None


class Deployer:
    """명령 실행·최신 커밋 조회·대기를 주입해 운영 변경 없이 실패/원복 경로를 시험할 수 있다."""
    def __init__(self, root, manifest, expected_sha, repository, run=command, head=github_head, pause=time.sleep):
        self.root = pathlib.Path(root).resolve()
        self.manifest, self.expected_sha, self.repository = manifest, expected_sha, repository
        self.run, self.head, self.pause = run, head, pause
        self.base = self.root / 'docker-compose.prod.yml'
        self.diag = self.root / 'docker-compose.diagnostics.yml'
        self.files = ['-f', str(self.base)]
        self.changed = False
        self.phase = 'PRECHECK'

    def inspect(self, name):
        return json.loads(self.run(['docker', 'inspect', name]))[0]

    def compose(self, *args):
        return ['docker', 'compose', '--project-name', 'deploy'] + self.files + list(args)

    @staticmethod
    def identity(c):
        return [c['Id'], c['Image'], c['State']['StartedAt'], c['RestartCount'], c['State']['OOMKilled']]

    def fingerprint(self):
        return [(str(p), hashlib.sha256(p.read_bytes()).hexdigest()) for p in [self.base, self.diag] if p.exists()]

    def unchanged(self):
        require(self.fingerprint() == self.before_files, 'COMPOSE_CHANGED_DURING_DEPLOY')
        require(self.identity(self.inspect('mariadb')) == self.identity(self.db), 'DB_CHANGED_DURING_DEPLOY')

    def db_settings(self):
        shell = ('set +x; test -n "${MARIADB_ROOT_PASSWORD:-}" || exit 1; '
                 'export MYSQL_PWD="$MARIADB_ROOT_PASSWORD"; exec mariadb -uroot --batch --skip-column-names')
        sql = "SELECT JSON_OBJECT('keyBuffer',@@key_buffer_size,'ariaCache',@@aria_pagecache_buffer_size,'innodbPool',@@innodb_buffer_pool_size);"
        return json.loads(self.run(['docker', 'exec', '-i', 'mariadb', 'sh', '-c', shell], data=sql.encode()))

    def private(self, name):
        pid = self.inspect('spring-api')['State']['Pid']
        return json.loads(self.run(['sudo', '-n', 'nsenter', '--target', str(pid), '--net', '--',
            'curl', '--noproxy', '*', '--fail', '--silent', '--max-time', '3',
            'http://127.0.0.1:9091/actuator/' + name], timeout=5))

    def fresh(self):
        require(self.head(self.repository) == self.expected_sha, 'STALE_COMMIT_REFUSED')

    def save(self, name, value):
        path = self.record / name
        with path.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, indent=2)
        os.chmod(path, 0o600)
        return path

    def pinned(self, image, name):
        return self.save(name, {'services': {'api': {'image': image}}})

    def precheck(self):
        """원본 Compose·실행 중 DB·진단 파일을 검증한 뒤에만 변경을 준비한다."""
        m = self.manifest
        require(set(m) == {'schema', 'repository', 'sha', 'digest'} and m['schema'] == 1, 'INVALID_MANIFEST')
        require(bool(re.fullmatch(r'[a-z0-9][a-z0-9_.-]*/[a-z0-9][a-z0-9_.-]*', self.repository or '')), 'INVALID_REPOSITORY')
        require(bool(re.fullmatch(r'[0-9a-f]{40}', self.expected_sha or '')) and m['sha'] == self.expected_sha
                and m['repository'] == self.repository, 'MANIFEST_SOURCE_MISMATCH')
        require(bool(re.fullmatch(r'sha256:[0-9a-f]{64}', m['digest'] or '')), 'INVALID_DIGEST')
        self.target = 'ghcr.io/' + self.repository + '@' + m['digest']
        require(self.base.is_file() and not self.base.is_symlink(), 'BASE_CONFIG_REQUIRED')
        require(not self.diag.is_symlink(), 'UNSAFE_DIAGNOSTICS_FILE')
        self.before_files = self.fingerprint()
        self.fresh()
        self.api, self.db = self.inspect('spring-api'), self.inspect('mariadb')
        for c in [self.api, self.db]:
            require(c['State']['Running'] and not c['State']['OOMKilled'], 'UNHEALTHY_BASELINE')
        require(self.api['Config']['Labels'].get('com.docker.compose.service') == 'api'
                and self.api['Config']['Labels'].get('com.docker.compose.project') == 'deploy', 'WRONG_API_PROJECT')
        original = json.loads(self.run(self.compose('config', '--format', 'json')))
        if self.diag.exists():
            require(self.diag.is_file() and (os.name != 'posix' or not self.diag.stat().st_mode & 0o022),
                    'UNSAFE_DIAGNOSTICS_FILE')
            self.files += ['-f', str(self.diag)]
            merged = json.loads(self.run(self.compose('config', '--format', 'json')))
            allowed = json.loads(json.dumps(original))
            allowed['services']['api'].setdefault('environment', {})['APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED'] = 'true'
            # 진단 파일은 고정 경로다. 플래그 하나 이외의 이미지·DB·포트·볼륨 변경은 거절한다.
            # 후속 조회 진단도 명시적인 true 추가만 허용한다. 다른 설정의 비교 범위는 그대로다.
            read_key = 'APP_MONITORING_READ_DIAGNOSTICS_ENABLED'
            if merged['services']['api'].get('environment', {}).get(read_key) == 'true':
                allowed['services']['api']['environment'][read_key] = 'true'
            require(merged == allowed, 'DIAGNOSTICS_OVERRIDE_TOO_BROAD')
        else:
            merged = original
        expected_env = merged['services']['api'].get('environment', {})
        current_env = dict(x.split('=', 1) for x in self.api['Config']['Env'])
        require(all(current_env.get(k) == str(v) for k, v in expected_env.items()), 'RUNNING_ENV_DIFFERS_FROM_COMPOSE')
        self.diagnostic_enabled = str(expected_env.get('APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED', 'false')).lower() == 'true'
        self.read_diagnostic_enabled = str(expected_env.get('APP_MONITORING_READ_DIAGNOSTICS_ENABLED', 'false')).lower() == 'true'
        self.before_cache = self.db_settings()
        require(self.private('health').get('status') == 'UP', 'BASELINE_HEALTH_FAILED')
        if self.read_diagnostic_enabled:
            # 새 플래그를 모르는 구버전 이미지로 원복해야 하는 상태에서는 활성 배포를 시작하지 않는다.
            require(self.private('resources').get('loginDiagnostics', {}).get('reads', {}).get('enabled') is True,
                    'READ_DIAGNOSTICS_BASELINE_UNSUPPORTED')
        require(shutil.disk_usage(self.root).free >= 1024**3, 'INSUFFICIENT_DISK_SPACE')
        self.record = pathlib.Path(tempfile.mkdtemp(prefix='api-deploy-' + self.expected_sha[:8] + '-', dir=str(self.root)))
        self.save('baseline.json', {'api': self.identity(self.api), 'db': self.identity(self.db), 'cache': self.before_cache,
            'sha': self.expected_sha, 'targetImage': self.target})
        self.rollback = self.pinned(self.api['Image'], 'rollback.json')
        self.pin = self.pinned(self.target, 'target.json')

    def ready(self, image, revision=None):
        """DB 유지·내부 health/Heap/풀·공개 관리 차단·익명 CSRF까지 확인한다. 로그인은 하지 않는다."""
        for _ in range(30):
            try:
                self.unchanged()
                c = self.inspect('spring-api')
                require(c['Image'] == image and c['State']['Running'] and not c['State']['OOMKilled']
                        and c['RestartCount'] == 0, 'API_NOT_READY')
                require(c['Mounts'] == self.api['Mounts'] and c['HostConfig']['PortBindings'] == self.api['HostConfig']['PortBindings'],
                        'API_MOUNTS_OR_PORTS_CHANGED')
                if revision:
                    require(c['Config']['Labels'].get('org.opencontainers.image.revision') == revision, 'WRONG_RUNNING_REVISION')
                require(self.private('health').get('status') == 'UP', 'HEALTH_NOT_UP')
                r = self.private('resources')
                require(r.get('measurable') is True and r['loginDiagnostics']['enabled'] == self.diagnostic_enabled
                        and r.get('pools') and all(p['initialized'] and p['totalConnections'] > 0 for p in r['pools']), 'RESOURCE_CHECK_FAILED')
                require(r['loginDiagnostics'].get('reads', {}).get('enabled', False)
                        == getattr(self, 'read_diagnostic_enabled', False), 'READ_DIAGNOSTICS_CHECK_FAILED')
                require(self.db_settings() == self.before_cache, 'DB_CACHE_CHANGED')
                status = self.run(['curl', '--noproxy', '*', '--silent', '--max-time', '3', '--output', '/dev/null',
                    '--write-out', '%{http_code}', 'http://127.0.0.1:8080/actuator/resources'], timeout=5)
                require(status == '403', 'MANAGEMENT_EXPOSED')
                csrf = json.loads(self.run(['curl', '--noproxy', '*', '--fail', '--silent', '--max-time', '3',
                    'http://127.0.0.1:8080/api/v1/csrf'], timeout=5))['data']
                require(csrf.get('headerName') == 'X-XSRF-TOKEN' and bool(csrf.get('token')), 'CSRF_SMOKE_FAILED')
                return c
            except (DeployError, KeyError, ValueError):
                self.pause(2)
        raise DeployError('READINESS_FAILED')

    def execute(self):
        """pull 실패는 교체 전에 멈춘다. 교체 후 실패하면 이 실행이 만든 API만 이전 이미지로 복귀한다."""
        result = {'status': 'FAILED', 'rollbackAttempted': False}
        try:
            self.precheck()
            self.phase = 'PULL'
            self.run(self.compose('-f', str(self.pin), 'pull', 'api'), timeout=180)
            image = json.loads(self.run(['docker', 'image', 'inspect', self.target]))[0]
            require(image['Config']['Labels'].get('org.opencontainers.image.revision') == self.expected_sha, 'IMAGE_REVISION_MISMATCH')
            self.fresh()
            self.unchanged()
            self.phase = 'APPLY'
            self.changed = True
            self.run(self.compose('-f', str(self.pin), 'up', '-d', '--no-deps', '--pull', 'never', 'api'), timeout=60)
            self.phase = 'VERIFY'
            api = self.ready(image['Id'], self.expected_sha)
            result.update(status='DEPLOYED', sha=self.expected_sha, image=image['Id'], api=self.identity(api),
                          dbUnchanged=True, cache=self.before_cache, diagnosticsEnabled=self.diagnostic_enabled)
        except Exception as error:
            result.update(phase=self.phase, error=str(error) if isinstance(error, DeployError) else 'UNEXPECTED_ERROR_REDACTED')
            if self.changed:
                try:
                    self.unchanged()
                    current = self.inspect('spring-api')
                    if current['Id'] == self.api['Id']:
                        result['originalApiRetained'] = True
                    else:
                        require(current['Image'] == image['Id'], 'ANOTHER_API_REPLACED_OURS')
                        result['rollbackAttempted'] = True
                        self.run(self.compose('-f', str(self.rollback), 'up', '-d', '--no-deps', '--pull', 'never', 'api'), timeout=60)
                        self.ready(self.api['Image'])
                        result['rollbackHealthy'] = True
                except Exception:
                    result['manualRecoveryRequired'] = True
        if hasattr(self, 'record'):
            self.save('result.json', result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True, type=pathlib.Path)
    args = parser.parse_args()
    root = pathlib.Path('/home/ubuntu/deploy')
    # OS 잠금도 사용해 같은 서버의 동시 배포를 막는다. 프로세스 종료 시 자동 해제된다.
    import fcntl
    lock_path = root / '.memoryjar-api-deploy.lock'
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = Deployer(root, json.loads(args.manifest.read_text()), os.environ.get('EXPECTED_SHA'),
                os.environ.get('GITHUB_REPOSITORY')).execute()
    except Exception:
        result = {'status': 'FAILED', 'error': 'INVALID_INPUT_OR_LOCK_REDACTED'}
    print(json.dumps(result))
    return 0 if result['status'] == 'DEPLOYED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
