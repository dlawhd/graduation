"""동일한 운영 API 이미지의 사진 캐시만 임시로 끄고, 기록한 설정으로 복구한다. DB는 변경하지 않는다."""
import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import tempfile

spec = importlib.util.spec_from_file_location('texture_trial_deploy', pathlib.Path(__file__).with_name('deploy-api.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)
FLAG = 'APP_JAR_DESIGN_TEXTURE_CACHE_ENABLED'
PROPERTY = 'app.jar-design.texture-cache-enabled'


def env_of(container):
    """실행 설정은 메모리에서만 비교한다. 인증정보가 든 전체 환경변수를 기록하거나 출력하지 않는다."""
    return dict(item.split('=', 1) for item in container['Config']['Env'])


def env_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


class TextureCacheTrial(deploy.Deployer):
    """기존 API 준비 상태·DB 보호 검사를 재사용하고 원본 Compose를 고치지 않는 비교 실행기다."""
    def __init__(self, root, expected_sha, run=deploy.command, pause=None):
        super().__init__(root, {}, expected_sha, 'dlawhd/graduation', run=run,
                         **({} if pause is None else {'pause': pause}))
        self.active = self.root / 'texture-comparison.active.json'

    def configure(self):
        deploy.require(self.base.is_file() and not self.base.is_symlink(), 'UNSAFE_BASE_CONFIG')
        deploy.require(not self.diag.is_symlink(), 'UNSAFE_DIAGNOSTICS_CONFIG')
        if self.diag.exists():
            deploy.require(self.diag.is_file() and (os.name != 'posix' or not self.diag.stat().st_mode & 0o022),
                           'UNSAFE_DIAGNOSTICS_MODE')
            self.files += ['-f', str(self.diag)]

    def precheck(self):
        """현재 설정과 컨테이너가 일치할 때만 비교를 준비한다. 상위 우선순위의 캐시 설정은 거절한다."""
        deploy.require(bool(re.fullmatch(r'[0-9a-f]{40}', self.expected_sha)), 'INVALID_EXPECTED_SHA')
        deploy.require(not self.active.exists() and not self.active.is_symlink(), 'ANOTHER_TRIAL_ACTIVE')
        self.configure()
        self.api, self.db = self.inspect('spring-api'), self.inspect('mariadb')
        for c in [self.api, self.db]:
            deploy.require(c['State']['Running'] and not c['State']['OOMKilled'], 'UNHEALTHY_BASELINE')
        labels = self.api['Config']['Labels']
        deploy.require(labels.get('org.opencontainers.image.revision') == self.expected_sha, 'REVISION_CHANGED')
        deploy.require(labels.get('com.docker.compose.project') == 'deploy'
                       and labels.get('com.docker.compose.service') == 'api', 'WRONG_API_PROJECT')
        env = env_of(self.api)
        deploy.require(env.get(FLAG, 'true').lower() == 'true', 'CACHE_ALREADY_DISABLED')
        options = list(self.api['Config'].get('Cmd') or []) + list(self.api['Config'].get('Entrypoint') or [])
        options += [env.get(k, '') for k in ['JAVA_TOOL_OPTIONS', 'JDK_JAVA_OPTIONS', 'JAVA_OPTS', '_JAVA_OPTIONS']]
        deploy.require(not any(PROPERTY in item for item in options)
                       and not env.get('SPRING_APPLICATION_JSON'), 'HIGHER_PRIORITY_CONFIG_REQUIRES_REVIEW')
        merged = json.loads(self.run(self.compose('config', '--format', 'json')))
        deploy.require(all(env.get(k) == str(v) for k, v in merged['services']['api'].get('environment', {}).items()),
                       'COMPOSE_ENVIRONMENT_MISMATCH')
        self.before_files = self.fingerprint()
        self.before_cache = self.db_settings()
        self.diagnostic_enabled = env.get('APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED', 'false').lower() == 'true'
        self.read_diagnostic_enabled = env.get('APP_MONITORING_READ_DIAGNOSTICS_ENABLED', 'false').lower() == 'true'
        self.ready(self.api['Image'], self.expected_sha)
        return env, merged

    def disable(self):
        """캐시 하나만 다르게 해석되는 override를 만든 뒤 API만 재구성한다. 실패하면 즉시 복구한다."""
        attempted = False
        try:
            env, original = self.precheck()
            self.record = pathlib.Path(tempfile.mkdtemp(prefix='api-texture-trial-', dir=str(self.root)))
            os.chmod(self.record, 0o700)
            off = {**env, FLAG: 'false'}
            # 환경변수 원문 대신 해시만 보관하며, 복구에 필요한 API 경로·포트와 숫자 기준만 기록한다.
            baseline = {'sha': self.expected_sha, 'image': self.api['Image'], 'apiId': self.api['Id'],
                        'mounts': self.api['Mounts'], 'ports': self.api['HostConfig']['PortBindings'],
                        'db': self.identity(self.db), 'dbCache': self.before_cache, 'files': self.before_files,
                        'loginDiagnostics': self.diagnostic_enabled, 'readDiagnostics': self.read_diagnostic_enabled,
                        'originalEnvHash': env_hash(env), 'disabledEnvHash': env_hash(off)}
            self.save('baseline.json', baseline)
            self.pinned(self.api['Image'], 'restore.json')
            target = self.save('disabled.json', {'services': {'api': {'image': self.api['Image'], 'environment': {FLAG: 'false'}}}})
            merged = json.loads(self.run(self.compose('-f', str(target), 'config', '--format', 'json')))
            expected = json.loads(json.dumps(original))
            expected['services']['api']['image'] = self.api['Image']
            expected['services']['api'].setdefault('environment', {})[FLAG] = 'false'
            deploy.require(merged == expected, 'UNRELATED_CONFIG_CHANGE')
            self.unchanged()
            with self.active.open('x', encoding='utf-8') as stream:
                json.dump({'record': str(self.record)}, stream)
            os.chmod(self.active, 0o600)
            attempted = True
            self.run(self.compose('-f', str(target), 'up', '-d', '--no-deps', '--pull', 'never', 'api'), timeout=90)
            c = self.ready(self.api['Image'], self.expected_sha)
            deploy.require(env_hash(env_of(c)) == baseline['disabledEnvHash'], 'CACHE_OVERRIDE_NOT_APPLIED')
            self.save('applied.json', {'apiId': c['Id'], 'startedAt': c['State']['StartedAt']})
            return {'status': 'CACHE_DISABLED', 'record': str(self.record), 'sha': self.expected_sha,
                    'apiId': c['Id'], 'dbUnchanged': True}
        except Exception as error:
            result = {'status': 'FAILED', 'error': str(error) if isinstance(error, deploy.DeployError) else 'ERROR_REDACTED'}
            if attempted:
                try:
                    self.restore()
                    result['rollbackHealthy'] = True
                except Exception:
                    result['manualRecoveryRequired'] = True
            return result

    def restore(self):
        """이 비교가 만든 설정만 복구한다. DB·원본 설정·다른 배포가 바뀌면 덮어쓰지 않고 중단한다."""
        deploy.require(self.active.is_file() and not self.active.is_symlink(), 'ACTIVE_RECORD_REQUIRED')
        record = pathlib.Path(json.loads(self.active.read_text())['record'])
        deploy.require(record.parent == self.root and not record.is_symlink()
                       and bool(re.fullmatch(r'api-texture-trial-[\w-]+', record.name)), 'UNSAFE_RECORD_PATH')
        saved = json.loads((record / 'baseline.json').read_text())
        deploy.require(saved['sha'] == self.expected_sha, 'RESTORE_REVISION_MISMATCH')
        if len(self.files) == 2:
            self.configure()
        self.before_files = [tuple(item) for item in saved['files']]
        self.db = self.inspect('mariadb')
        deploy.require(self.identity(self.db) == saved['db'], 'DB_CHANGED_DURING_TRIAL')
        self.before_cache = saved['dbCache']
        self.diagnostic_enabled, self.read_diagnostic_enabled = saved['loginDiagnostics'], saved['readDiagnostics']
        self.api = {'Mounts': saved['mounts'], 'HostConfig': {'PortBindings': saved['ports']}}
        self.unchanged()
        c = self.inspect('spring-api')
        deploy.require(c['Image'] == saved['image'], 'ANOTHER_API_IMAGE_REPLACED_OURS')
        current_hash = env_hash(env_of(c))
        deploy.require(current_hash in [saved['originalEnvHash'], saved['disabledEnvHash']], 'ANOTHER_ENVIRONMENT_REPLACED_OURS')
        if current_hash == saved['disabledEnvHash']:
            applied = record / 'applied.json'
            if applied.exists():
                deploy.require(c['Id'] == json.loads(applied.read_text())['apiId'], 'ANOTHER_CONTAINER_REPLACED_OURS')
            self.run(self.compose('-f', str(record / 'restore.json'), 'up', '-d', '--no-deps', '--pull', 'never', 'api'), timeout=90)
        c = self.ready(saved['image'], self.expected_sha)
        deploy.require(env_hash(env_of(c)) == saved['originalEnvHash'], 'ORIGINAL_ENVIRONMENT_NOT_RESTORED')
        self.active.unlink()
        return {'status': 'RESTORED', 'record': str(record), 'sha': self.expected_sha, 'dbUnchanged': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'disable', 'restore'])
    parser.add_argument('--expected-sha', required=True)
    args = parser.parse_args()
    deploy.require(os.geteuid() == 0, 'ROOT_REQUIRED')
    import fcntl
    root = pathlib.Path('/home/ubuntu/deploy')
    with (root / '.memoryjar-api-deploy.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            trial = TextureCacheTrial(root, args.expected_sha)
            if args.action == 'check':
                trial.precheck()
                result = {'status': 'PRECHECK_OK', 'sha': args.expected_sha, 'dbUnchanged': True}
            else:
                result = trial.disable() if args.action == 'disable' else trial.restore()
        except Exception as error:
            result = {'status': 'FAILED', 'error': str(error) if isinstance(error, deploy.DeployError) else 'ERROR_REDACTED'}
    print(json.dumps(result))
    return 0 if result['status'] in ['PRECHECK_OK', 'CACHE_DISABLED', 'RESTORED'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
