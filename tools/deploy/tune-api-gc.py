"""검증된 동일 API 이미지를 G1 메모리 정리 방식으로 재구성하고 실패 시 설정까지 원복한다."""
import argparse
import copy
import importlib.util
import json
import os
import pathlib
import re
import tempfile

spec = importlib.util.spec_from_file_location('api_deploy', pathlib.Path(__file__).with_name('deploy-api.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)

OPTIONS = '-Xmx224m -XX:+UseG1GC -XX:MaxGCPauseMillis=200'


def amend(text):
    """API의 환경변수에 GC 옵션만 추가한다. 모호한 구조나 기존 옵션은 덮어쓰지 않는다."""
    api = re.search(r'^  api:\s*\n(.*?)(?=^  [^\s#]|^\S|\Z)', text, re.M | re.S)
    if not api or len(re.findall(r'^  api:', text, re.M)) != 1:
        raise deploy.DeployError('AMBIGUOUS_API_SECTION')
    body = api.group(1)
    if re.search(r'^\s+(JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|JAVA_OPTS):', body, re.M):
        raise deploy.DeployError('EXISTING_JVM_OPTIONS_REQUIRES_REVIEW')
    matches = list(re.finditer(r'^    environment:\s*\n', body, re.M))
    if len(matches) != 1:
        raise deploy.DeployError('MAPPING_ENVIRONMENT_REQUIRED')
    point = api.start(1) + matches[0].end()
    return text[:point] + '      # 전체 메모리 정리의 긴 정지를 줄인다. Heap 상한은 기존 약 222MiB 수준으로 유지한다.\n' + \
        '      JAVA_TOOL_OPTIONS: ' + json.dumps(OPTIONS) + '\n' + text[point:]


class GcTuner(deploy.Deployer):
    """기존 배포의 DB 보호·상태 검사 기능을 재사용하고 이미지 pull 없이 API만 재시작한다."""
    def __init__(self, root, expected_sha, run=deploy.command, pause=None):
        super().__init__(root, {}, expected_sha, 'dlawhd/graduation', run=run,
                         **({} if pause is None else {'pause': pause}))

    def replace_base(self, value):
        """원자 교체해 부분 쓰기를 막고 원본 파일의 소유권과 권한을 유지한다."""
        info = self.base.stat()
        fd, name = tempfile.mkstemp(prefix='.gc-config-', dir=str(self.root))
        path = pathlib.Path(name)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(value)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(path, info.st_mode & 0o777)
            if os.name == 'posix':
                os.chown(path, info.st_uid, info.st_gid)
            os.replace(path, self.base)
        finally:
            path.unlink(missing_ok=True)

    def execute(self):
        result = {'status': 'FAILED', 'rollbackAttempted': False}
        replaced = restarted = False
        try:
            deploy.require(bool(re.fullmatch(r'[0-9a-f]{40}', self.expected_sha or '')), 'INVALID_SHA')
            deploy.require(self.base.is_file() and not self.base.is_symlink(), 'UNSAFE_BASE')
            deploy.require(not self.diag.is_symlink(), 'UNSAFE_DIAGNOSTICS')
            self.api, self.db = self.inspect('spring-api'), self.inspect('mariadb')
            deploy.require(self.api['Config']['Labels'].get('org.opencontainers.image.revision') == self.expected_sha,
                           'RUNNING_REVISION_CHANGED')
            deploy.require(all(c['State']['Running'] and not c['State']['OOMKilled'] for c in [self.api, self.db]), 'UNHEALTHY_BASELINE')
            deploy.require(self.api['Config']['Labels'].get('com.docker.compose.project') == 'deploy'
                           and self.api['Config']['Labels'].get('com.docker.compose.service') == 'api', 'WRONG_API_PROJECT')
            current_env = dict(v.split('=', 1) for v in self.api['Config']['Env'])
            deploy.require(not any(current_env.get(k) for k in ['JAVA_TOOL_OPTIONS','JDK_JAVA_OPTIONS','JAVA_OPTS']), 'EXISTING_JVM_OPTIONS')
            raw = self.base.read_bytes()
            changed = amend(raw.decode('utf-8')).encode('utf-8')
            original = json.loads(self.run(self.compose('config', '--format', 'json')))
            if self.diag.exists():
                deploy.require(self.diag.is_file() and (os.name != 'posix' or not self.diag.stat().st_mode & 0o022), 'UNSAFE_DIAGNOSTICS')
                self.files += ['-f', str(self.diag)]
                merged = json.loads(self.run(self.compose('config', '--format', 'json')))
                allowed = copy.deepcopy(original)
                allowed['services']['api'].setdefault('environment', {})['APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED'] = 'true'
                deploy.require(merged == allowed, 'DIAGNOSTICS_OVERRIDE_TOO_BROAD')
            else:
                merged = original
            deploy.require(all(current_env.get(k) == str(v) for k, v in merged['services']['api'].get('environment',{}).items()),
                           'RUNNING_ENV_DIFFERS_FROM_COMPOSE')
            self.diagnostic_enabled = current_env.get('APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED', 'false').lower() == 'true'
            self.before_cache = self.db_settings()
            deploy.require(self.private('health').get('status') == 'UP', 'BASELINE_HEALTH_FAILED')
            self.record = pathlib.Path(tempfile.mkdtemp(prefix='api-gc-', dir=str(self.root)))
            backup = self.record / 'base-before.yml'
            backup.write_bytes(raw)
            os.chmod(backup, 0o600)
            self.save('baseline.json', {'api': self.identity(self.api), 'db': self.identity(self.db),
                                       'cache': self.before_cache, 'sha': self.expected_sha})
            self.pin = self.pinned(self.api['Image'], 'same-image.json')
            self.replace_base(changed)
            replaced = True
            resolved = json.loads(self.run(['docker','compose','--project-name','deploy','-f',str(self.base),'config','--format','json']))
            expected = copy.deepcopy(original)
            expected['services']['api'].setdefault('environment', {})['JAVA_TOOL_OPTIONS'] = OPTIONS
            deploy.require(resolved == expected, 'UNRELATED_CONFIG_CHANGE')
            self.before_files = self.fingerprint()
            self.unchanged()
            restarted = True
            self.run(self.compose('-f',str(self.pin),'up','-d','--no-deps','--pull','never','api'), timeout=60)
            self.ready(self.api['Image'], self.expected_sha)
            r = self.private('resources')
            deploy.require(any('G1' in c['name'] for c in r['gc']['collectors']), 'G1_NOT_ACTIVE')
            deploy.require(220 * 1024**2 <= r['heap']['maxBytes'] <= 225 * 1024**2, 'UNEXPECTED_HEAP_BUDGET')
            result.update(status='APPLIED', heapMaxBytes=r['heap']['maxBytes'],
                          collectors=[c['name'] for c in r['gc']['collectors']], dbUnchanged=True, record=str(self.record))
        except Exception as error:
            result['error'] = str(error) if isinstance(error, deploy.DeployError) else 'ERROR_REDACTED'
            try:
                if replaced:
                    deploy.require(self.base.read_bytes() == changed, 'ANOTHER_CONFIG_REPLACED_OURS')
                    deploy.require(self.identity(self.inspect('mariadb')) == self.identity(self.db), 'DB_CHANGED')
                    deploy.require(self.inspect('spring-api')['Image'] == self.api['Image'], 'ANOTHER_IMAGE_REPLACED_OURS')
                    self.replace_base(raw)
                    if restarted:
                        result['rollbackAttempted'] = True
                        self.before_files = self.fingerprint()
                        self.run(self.compose('-f',str(self.pin),'up','-d','--no-deps','--pull','never','api'),timeout=60)
                        self.ready(self.api['Image'],self.expected_sha)
                    result['rollbackHealthy'] = True
            except Exception:
                result['manualRecoveryRequired'] = True
        if hasattr(self, 'record'):
            self.save('result.json', result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-sha', required=True)
    args = parser.parse_args()
    deploy.require(args.apply and os.geteuid() == 0, 'EXPLICIT_ROOT_APPLY_REQUIRED')
    import fcntl
    root = pathlib.Path('/home/ubuntu/deploy')
    with (root / '.memoryjar-api-deploy.lock').open('r+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = GcTuner(root, args.expected_sha).execute()
    print(json.dumps(result))
    return 0 if result['status'] == 'APPLIED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
