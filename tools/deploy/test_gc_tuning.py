"""실제 API 재시작 없이 GC 설정의 범위와 DB 보호·원복 경로를 확인한다."""
import json
import os
import pathlib
import tempfile
import unittest

from test_deploy import FakeDocker, OLD, SHA, load

tune = load('tune_api_gc', 'tune-api-gc.py')
SOURCE = 'services:\n  db:\n    image: unchanged\n  api:\n    environment:\n      PRIVATE_VALUE: must-not-appear\n'


class FakeGcDocker(FakeDocker):
    """같은 이미지를 유지하는 API 재구성만 허용하고 DB 변경은 즉시 실패시킨다."""
    def __init__(self, root, failure=None):
        super().__init__(root, diagnostics=False)
        self.failure = failure
        self.current['Config']['Labels']['org.opencontainers.image.revision'] = SHA

    def __call__(self, args, data=None, timeout=30):
        if args[:2] == ['docker','compose']:
            if 'pull' in args:
                raise AssertionError('PULL_FORBIDDEN')
            if 'config' in args:
                value = json.loads(super().__call__(args, data, timeout))
                if 'JAVA_TOOL_OPTIONS' in (self.root/'docker-compose.prod.yml').read_text(encoding='utf-8'):
                    value['services']['api']['environment']['JAVA_TOOL_OPTIONS'] = tune.OPTIONS
                    if self.failure == 'broad': value['services']['db']['image'] = 'unexpected'
                return json.dumps(value)
            if 'up' in args:
                self.calls.append(args)
                if args[-1] != 'api' or '--no-deps' not in args:
                    raise AssertionError('DB_CHANGE_FORBIDDEN')
                enabled = 'JAVA_TOOL_OPTIONS' in (self.root/'docker-compose.prod.yml').read_text(encoding='utf-8')
                self.current = self.api(OLD)
                self.current['Id'] = 'gc-api' if enabled else 'restored-api'
                self.current['Config']['Labels']['org.opencontainers.image.revision'] = SHA
                if enabled: self.current['Config']['Env'].append('JAVA_TOOL_OPTIONS='+tune.OPTIONS)
                return ''
        if args[0] == 'sudo' and args[-1].endswith('/health') and self.current['Id'] == 'gc-api' and self.failure == 'health':
            raise tune.deploy.DeployError('HEALTH_FAILED')
        result = super().__call__(args, data, timeout)
        if args[0] == 'sudo' and args[-1].endswith('/resources'):
            value = json.loads(result)
            value['gc'] = {'collectors':[{'name':'G1 Young Generation'}]}
            value['heap'] = {'maxBytes':224*1024**2}
            if self.failure == 'collector' and self.current['Id'] == 'gc-api':
                value['gc']['collectors'][0]['name'] = 'Copy'
            return json.dumps(value)
        return result


class GcTuningTest(unittest.TestCase):
    """기존 값 덮어쓰기·의도하지 않은 설정 변화·상태 검사 실패 시 적용을 막는다."""
    def case(self, failure=None):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            base = root/'docker-compose.prod.yml'
            base.write_text(SOURCE,encoding='utf-8')
            fake = FakeGcDocker(root, failure)
            result = tune.GcTuner(root, SHA, run=fake, pause=lambda _:None).execute()
            self.assertNotIn('must-not-appear',json.dumps(result))
            if failure:
                self.assertEqual(result['status'],'FAILED')
                self.assertEqual(base.read_text(encoding='utf-8'),SOURCE)
                self.assertTrue(result.get('rollbackHealthy'))
            else:
                self.assertEqual(result['status'],'APPLIED')
                self.assertIn(tune.OPTIONS,base.read_text(encoding='utf-8'))
            self.assertEqual(fake.db['Id'],'db-original')
            return result

    def test_only_gc_options_are_added_to_api(self):
        self.case()

    def test_unrelated_config_change_restores_file_without_restart(self):
        self.assertFalse(self.case('broad')['rollbackAttempted'])

    def test_bad_health_restores_config_and_same_image(self):
        self.assertTrue(self.case('health')['rollbackAttempted'])

    def test_wrong_collector_restores_config(self):
        self.assertTrue(self.case('collector')['rollbackAttempted'])

    def test_existing_options_or_missing_environment_are_rejected(self):
        for value in [SOURCE.replace('      PRIVATE_VALUE', '      JAVA_TOOL_OPTIONS'), 'services:\n  api:\n    image: old\n']:
            with self.assertRaises(tune.deploy.DeployError):
                tune.amend(value)


if __name__ == '__main__':
    unittest.main()
