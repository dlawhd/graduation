"""운영을 변경하지 않고 캐시 비교의 API 전용 변경·실패 복구·다른 작업 보호를 검사한다."""
import json
import os
import pathlib
import tempfile
import unittest
from test_deploy import FakeDocker, OLD, SHA, load

trial_module = load('texture_cache_trial', 'texture-cache-trial.py')


class CacheDocker(FakeDocker):
    """비밀값을 포함한 환경과 동일 이미지의 설정 변경만 흉내 낸다. DB 변경 명령은 부모가 거절한다."""
    def __init__(self, root, failure=None):
        super().__init__(root)
        self.failure = failure
        self.current['Config']['Labels']['org.opencontainers.image.revision'] = SHA
        self.changed = False

    def __call__(self, args, data=None, timeout=30):
        if args[:2] == ['docker', 'compose']:
            files = [args[i+1] for i, arg in enumerate(args[:-1]) if arg == '-f']
            last = pathlib.Path(files[-1])
            override = json.loads(last.read_text())['services']['api'] if last.suffix == '.json' else None
            if 'config' in args:
                result = json.loads(super().__call__(args, data, timeout))
                if override:
                    result['services']['api']['image'] = override['image']
                    result['services']['api'].setdefault('environment', {}).update(override.get('environment', {}))
                    if self.failure == 'unrelated':
                        result['services']['db']['image'] = 'changed'
                return json.dumps(result)
            if 'up' in args:
                self.calls.append(args)
                if args[-1] != 'api' or '--no-deps' not in args or '--pull' not in args:
                    raise AssertionError('UNSAFE_RECREATE')
                self.current = self.api(OLD)
                self.current['Config']['Labels']['org.opencontainers.image.revision'] = SHA
                self.current['Id'] = 'trial-api' if override.get('environment') else 'restored-api'
                self.current['Config']['Env'] += [f'{key}={value}' for key, value in override.get('environment', {}).items()]
                self.changed = bool(override.get('environment'))
                if self.changed and self.failure == 'apply':
                    raise trial_module.deploy.DeployError('APPLY_FAILED')
                return ''
        if args[0] == 'sudo' and args[-1].endswith('/health') and self.changed and self.failure == 'health':
            raise trial_module.deploy.DeployError('HEALTH_FAILED')
        return super().__call__(args, data, timeout)


class TextureCacheTrialTest(unittest.TestCase):
    def setup_trial(self, root, failure=None):
        (root / 'docker-compose.prod.yml').write_text('services: {}')
        (root / 'docker-compose.diagnostics.yml').write_text('services: {}')
        os.chmod(root / 'docker-compose.diagnostics.yml', 0o600)
        fake = CacheDocker(root, failure)
        return trial_module.TextureCacheTrial(root, SHA, run=fake, pause=lambda _: None), fake

    def test_round_trip_preserves_image_db_and_original_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            obj, fake = self.setup_trial(pathlib.Path(directory))
            original = list(fake.current['Config']['Env'])
            self.assertEqual(obj.disable()['status'], 'CACHE_DISABLED')
            self.assertIn(trial_module.FLAG + '=false', fake.current['Config']['Env'])
            self.assertEqual(obj.restore()['status'], 'RESTORED')
            self.assertEqual(fake.current['Config']['Env'], original)
            self.assertEqual(fake.current['Image'], OLD)
            self.assertEqual(fake.db['Id'], 'db-original')
            for path in pathlib.Path(directory).rglob('*.json'):
                self.assertNotIn('must-not-appear', path.read_text())
            self.assertEqual(sum('up' in call for call in fake.calls), 2)

    def test_new_process_can_restore_from_numeric_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            obj, fake = self.setup_trial(root)
            self.assertEqual(obj.disable()['status'], 'CACHE_DISABLED')
            other = trial_module.TextureCacheTrial(root, SHA, run=fake, pause=lambda _: None)
            self.assertEqual(other.restore()['status'], 'RESTORED')

    def test_recreate_or_readiness_failure_restores_original_environment(self):
        for failure in ['apply', 'health']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                obj, fake = self.setup_trial(pathlib.Path(directory), failure)
                result = obj.disable()
                self.assertEqual(result['status'], 'FAILED')
                self.assertTrue(result['rollbackHealthy'])
                self.assertNotIn(trial_module.FLAG, trial_module.env_of(fake.current))

    def test_unrelated_override_does_not_restart_api(self):
        with tempfile.TemporaryDirectory() as directory:
            obj, fake = self.setup_trial(pathlib.Path(directory), 'unrelated')
            self.assertEqual(obj.disable()['status'], 'FAILED')
            self.assertFalse(any('up' in call for call in fake.calls))

    def test_other_operator_changes_are_not_overwritten(self):
        for change in ['image', 'environment', 'container', 'database', 'compose']:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                obj, fake = self.setup_trial(root)
                self.assertEqual(obj.disable()['status'], 'CACHE_DISABLED')
                if change == 'image': fake.current['Image'] = 'other-image'
                if change == 'environment': fake.current['Config']['Env'].append('OTHER_CHANGE=true')
                if change == 'container': fake.current['Id'] = 'other-container'
                if change == 'database': fake.db['Id'] = 'other-database'
                if change == 'compose': (root / 'docker-compose.prod.yml').write_text('other config')
                with self.assertRaises(trial_module.deploy.DeployError): obj.restore()
                self.assertEqual(sum('up' in call for call in fake.calls), 1)

    def test_precheck_does_not_create_trial_or_restart_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            obj, fake = self.setup_trial(root)
            obj.precheck()
            self.assertFalse(obj.active.exists())
            self.assertFalse(list(root.glob('api-texture-trial-*')))
            self.assertFalse(any('up' in call for call in fake.calls))

    def test_existing_trial_or_higher_priority_setting_is_rejected(self):
        for change in ['active', 'disabled', 'command', 'json', 'revision']:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                obj, fake = self.setup_trial(root)
                if change == 'active': obj.active.write_text('{}')
                if change == 'disabled': fake.current['Config']['Env'].append(trial_module.FLAG + '=false')
                if change == 'command': fake.current['Config']['Cmd'] = ['--' + trial_module.PROPERTY + '=false']
                if change == 'json': fake.current['Config']['Env'].append('SPRING_APPLICATION_JSON=must-not-log')
                if change == 'revision': fake.current['Config']['Labels']['org.opencontainers.image.revision'] = 'other'
                result = obj.disable()
                self.assertEqual(result['status'], 'FAILED')
                self.assertFalse(any('up' in call for call in fake.calls))
                self.assertNotIn('must-not-log', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
