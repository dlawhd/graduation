"""실제 Docker·GitHub·DB 없이 배포 명령 대역으로 안전 검사와 원복을 재현한다."""
import importlib.util
import json
import os
import pathlib
import tempfile
import unittest


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, str(pathlib.Path(__file__).with_name(file)))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


deploy = load('deploy', 'deploy-api.py')
manifest = load('manifest', 'image-manifest.py')
SHA = 'a' * 40
DIGEST = 'sha256:' + 'b' * 64
OLD, NEW = 'sha256:' + 'c' * 64, 'sha256:' + 'd' * 64


class FakeDocker:
    """허용된 읽기/교체 명령만 흉내 내며 DB 변경 명령이 호출되면 테스트를 실패시킨다."""
    def __init__(self, root, fail=None, diagnostics=True):
        self.root, self.fail, self.diagnostics = root, fail, diagnostics
        self.calls = []
        self.current = self.api(OLD)
        self.db = {'Id': 'db-original', 'Image': 'db-image', 'State': {'Running': True, 'OOMKilled': False, 'StartedAt': 'db-start'}, 'RestartCount': 0}

    def api(self, image):
        return {'Id': 'old-api' if image == OLD else 'new-api', 'Image': image,
            'State': {'Running': True, 'OOMKilled': False, 'StartedAt': image, 'Pid': 123}, 'RestartCount': 0,
            'Config': {'Env': ['PRIVATE_VALUE=must-not-appear', 'APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED=' + str(self.diagnostics).lower()],
                'Labels': {'com.docker.compose.service': 'api', 'com.docker.compose.project': 'deploy',
                    'org.opencontainers.image.revision': SHA if image == NEW else 'previous'}},
            'Mounts': [], 'HostConfig': {'PortBindings': {'8080/tcp': [{'HostIp': '127.0.0.1', 'HostPort': '8080'}]}}}

    def __call__(self, args, data=None, timeout=30):
        self.calls.append(args)
        if args[:2] == ['docker', 'inspect']:
            return json.dumps([self.current if args[2] == 'spring-api' else self.db])
        if args[:3] == ['docker', 'image', 'inspect']:
            return json.dumps([{'Id': NEW, 'Config': {'Labels': {'org.opencontainers.image.revision': 'e'*40 if self.fail == 'revision' else SHA}}}])
        if args[:2] == ['docker', 'exec']:
            return json.dumps({'keyBuffer': 8388608, 'ariaCache': 33554432, 'innodbPool': 134217728})
        if args[:2] == ['docker', 'compose']:
            if 'config' in args:
                value = {'services': {'api': {'environment': {'PRIVATE_VALUE': 'must-not-appear'}}, 'db': {'image': 'unchanged'}}}
                if str(self.root/'docker-compose.diagnostics.yml') in args:
                    value['services']['api']['environment']['APP_MONITORING_LOGIN_DIAGNOSTICS_ENABLED'] = 'true'
                    if self.fail == 'broad-override': value['services']['db']['image'] = 'unexpected'
                return json.dumps(value)
            if 'pull' in args:
                if args[-2:] != ['pull', 'api']: raise AssertionError('DB_PULL_FORBIDDEN')
                if self.fail == 'pull': raise deploy.DeployError('PULL_FAILED')
                if self.fail == 'config-change': (self.root/'docker-compose.prod.yml').write_text('changed by another operator')
                return ''
            if 'up' in args:
                if args[-1] != 'api' or '--no-deps' not in args or '--pull' not in args: raise AssertionError('DB_WRITE_FORBIDDEN')
                files = [args[i+1] for i, a in enumerate(args[:-1]) if a == '-f']
                pin = json.loads(pathlib.Path(files[-1]).read_text())['services']['api']['image']
                self.current = self.api(OLD if pin == OLD else NEW)
                if self.fail == 'other-api': self.current['Image'] = 'someone-else'
                if self.fail == 'db-change': self.db['Id'] = 'externally-replaced-db'
                if self.fail == 'apply' and self.current['Image'] == NEW: raise deploy.DeployError('APPLY_FAILED')
                return ''
        if args[0] in ['sudo', 'curl']:
            url = args[-1]
            if url.endswith('/health'):
                if self.current['Image'] == NEW and self.fail in ['health', 'rollback']: raise deploy.DeployError('HEALTH_FAILED')
                if self.current['Image'] == OLD and self.fail == 'rollback' and any('up' in c for c in self.calls):
                    raise deploy.DeployError('ROLLBACK_FAILED')
                return json.dumps({'status': 'UP'})
            if url.endswith('/resources'):
                if args[0] == 'curl': return '200' if self.fail == 'public' and self.current['Image'] == NEW else '403'
                return json.dumps({'measurable': True, 'pools': [{'initialized': True, 'totalConnections': 10}],
                    'loginDiagnostics': {'enabled': self.diagnostics}})
            if url.endswith('/csrf'):
                if self.current['Image'] == NEW and self.fail == 'csrf': raise deploy.DeployError('CSRF_FAILED')
                return json.dumps({'data': {'headerName': 'X-XSRF-TOKEN', 'token': 'private-csrf'}})
        raise AssertionError('UNEXPECTED_COMMAND')


class DeploymentTest(unittest.TestCase):
    def run_case(self, fail=None, diagnostics=True, heads=None, change_manifest=None):
        with tempfile.TemporaryDirectory(prefix='memoryjar-deployment-test-') as directory:
            root = pathlib.Path(directory)
            (root/'docker-compose.prod.yml').write_text('services: {}')
            if diagnostics:
                (root/'docker-compose.diagnostics.yml').write_text('services: {}')
                os.chmod(root/'docker-compose.diagnostics.yml', 0o600)
            fake = FakeDocker(root, fail, diagnostics)
            value = manifest.manifest('dlawhd/graduation', SHA, DIGEST)
            if change_manifest: change_manifest(value)
            iterator = iter(heads or [SHA, SHA])
            obj = deploy.Deployer(root, value, SHA, 'dlawhd/graduation', fake, lambda _: next(iterator), lambda _: None)
            result = obj.execute()
            self.assertNotIn('must-not-appear', json.dumps(result))
            self.assertNotIn('private-csrf', json.dumps(result))
            for path in root.glob('api-deploy-*/*.json'):
                self.assertNotIn('must-not-appear', path.read_text())
            return result, fake.calls

    def test_success_only_updates_api_and_keeps_diagnostics(self):
        result, calls = self.run_case()
        self.assertEqual(result['status'], 'DEPLOYED')
        self.assertTrue(result['dbUnchanged'])
        self.assertTrue(result['diagnosticsEnabled'])
        self.assertEqual(sum('up' in c for c in calls), 1)

    def test_no_diagnostics_file_preserves_default_off(self):
        result, _ = self.run_case(diagnostics=False)
        self.assertEqual(result['status'], 'DEPLOYED')
        self.assertFalse(result['diagnosticsEnabled'])

    def test_stale_before_pull_has_no_mutation(self):
        result, calls = self.run_case(heads=['e'*40])
        self.assertEqual(result['error'], 'STALE_COMMIT_REFUSED')
        self.assertFalse(any('pull' in c or 'up' in c for c in calls))

    def test_new_commit_during_pull_prevents_replacement(self):
        result, calls = self.run_case(heads=[SHA, 'e'*40])
        self.assertEqual(result['error'], 'STALE_COMMIT_REFUSED')
        self.assertFalse(any('up' in c for c in calls))

    def test_pull_failure_does_not_replace_api(self):
        result, calls = self.run_case(fail='pull')
        self.assertEqual(result['phase'], 'PULL')
        self.assertFalse(any('up' in c for c in calls))

    def test_compose_change_during_pull_is_not_applied(self):
        result, calls = self.run_case(fail='config-change')
        self.assertEqual(result['error'], 'COMPOSE_CHANGED_DURING_DEPLOY')
        self.assertFalse(any('up' in c for c in calls))

    def test_partial_apply_is_rolled_back(self):
        result, _ = self.run_case(fail='apply')
        self.assertEqual(result['phase'], 'APPLY')
        self.assertTrue(result['rollbackHealthy'])

    def test_rollback_failure_requires_manual_recovery(self):
        result, calls = self.run_case(fail='rollback')
        self.assertTrue(result['rollbackAttempted'])
        self.assertTrue(result['manualRecoveryRequired'])
        self.assertNotIn('rollbackHealthy', result)
        self.assertEqual(sum('up' in c for c in calls), 2)

    def test_external_db_change_stops_further_mutations(self):
        result, calls = self.run_case(fail='db-change')
        self.assertTrue(result['manualRecoveryRequired'])
        self.assertFalse(result['rollbackAttempted'])
        self.assertEqual(sum('up' in c for c in calls), 1)

    def test_wrong_revision_does_not_replace_api(self):
        result, calls = self.run_case(fail='revision')
        self.assertEqual(result['error'], 'IMAGE_REVISION_MISMATCH')
        self.assertFalse(any('up' in c for c in calls))

    def test_broad_diagnostics_override_is_rejected(self):
        result, calls = self.run_case(fail='broad-override')
        self.assertEqual(result['error'], 'DIAGNOSTICS_OVERRIDE_TOO_BROAD')
        self.assertFalse(any('up' in c or 'pull' in c for c in calls))

    def test_bad_health_public_exposure_or_csrf_rolls_back(self):
        for failure in ['health', 'public', 'csrf']:
            with self.subTest(failure=failure):
                result, calls = self.run_case(fail=failure)
                self.assertEqual(result['status'], 'FAILED')
                self.assertTrue(result['rollbackAttempted'])
                self.assertTrue(result['rollbackHealthy'])
                self.assertEqual(sum('up' in c for c in calls), 2)

    def test_unrelated_replacement_is_not_rolled_back(self):
        result, calls = self.run_case(fail='other-api')
        self.assertTrue(result['manualRecoveryRequired'])
        self.assertFalse(result['rollbackAttempted'])
        self.assertEqual(sum('up' in c for c in calls), 1)

    def test_bad_manifest_is_refused_before_any_command(self):
        for key, value in [('sha', 'wrong'), ('digest', 'sha256:injection;command'), ('repository', 'other/repo')]:
            result, calls = self.run_case(change_manifest=lambda m: m.update({key: value}))
            self.assertEqual(result['status'], 'FAILED')
            self.assertEqual(calls, [])

    def test_manifest_producer_rejects_untrusted_values(self):
        with self.assertRaises(ValueError): manifest.manifest('../bad', SHA, DIGEST)
        with self.assertRaises(ValueError): manifest.manifest('dlawhd/graduation', 'latest', DIGEST)


if __name__ == '__main__':
    unittest.main()
