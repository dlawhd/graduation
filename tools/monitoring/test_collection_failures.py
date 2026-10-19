"""외부 통신 없이 지표 수집 실패 단계·고정 분류·비밀값 비노출을 검사한다."""
import importlib.util
import json
import pathlib
import subprocess
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('failure_collector', pathlib.Path(__file__).with_name('collect-resources.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectionFailureTest(unittest.TestCase):
    """오류를 숨기지 않되 원문·명령 인자·응답 본문은 결과에 포함하지 않는다."""
    def test_management_wait_is_five_seconds_with_six_second_command_deadline(self):
        with mock.patch.object(collector, 'command', return_value='{}') as command:
            self.assertEqual({}, collector.read_application(123))
        args = command.call_args[0][0]
        self.assertEqual('5', args[args.index('--max-time') + 1])
        self.assertEqual('http://127.0.0.1:9091/actuator/resources', args[-1])
        self.assertEqual(6, command.call_args[1]['timeout'])

    def test_other_commands_keep_four_second_deadline(self):
        with mock.patch.object(collector.subprocess, 'run') as run:
            run.return_value.stdout = 'ok'
            self.assertEqual('ok', collector.command(['docker', 'inspect']))
        self.assertEqual(4, run.call_args[1]['timeout'])

    def test_fixed_categories_never_include_exception_payload(self):
        errors = [(subprocess.TimeoutExpired(['SECRET'], 4, output='SECRET'), 'COMMAND_TIMEOUT'),
                  (subprocess.CalledProcessError(28, ['SECRET'], stderr='SECRET'), 'COMMAND_EXIT'),
                  (json.JSONDecodeError('SECRET', 'SECRET', 0), 'INVALID_JSON'),
                  (PermissionError('SECRET'), 'PERMISSION_DENIED'),
                  (FileNotFoundError('SECRET'), 'FILE_NOT_FOUND'),
                  (KeyError('SECRET'), 'MISSING_FIELD'), (ValueError('SECRET'), 'INVALID_VALUE'),
                  (OSError('SECRET'), 'OS_ERROR'), (RuntimeError('SECRET'), 'UNEXPECTED_FAILURE')]
        for error, kind in errors:
            with self.subTest(kind=kind):
                result = collector.failure_details('APPLICATION_READ', error, 5)
                self.assertEqual(kind, result['kind'])
                self.assertEqual(5, result['lastSuccessfulSequence'])
                self.assertNotIn('SECRET', json.dumps(result))
        self.assertEqual(28, collector.failure_details('APPLICATION_READ', errors[1][0], 5)['exitCode'])

    def test_unknown_stage_is_not_printed(self):
        result = collector.failure_details('SECRET', ValueError('SECRET'), 0)
        self.assertEqual('UNKNOWN', result['stage'])
        self.assertNotIn('SECRET', json.dumps(result))

    def run_application_failure(self, initial):
        containers = [{'name': '/spring-api', 'pid': 1, 'running': True},
                      {'name': '/mariadb', 'pid': 2, 'running': True}]
        fail = subprocess.CalledProcessError(28, ['SECRET'], stderr='SECRET')
        with mock.patch.object(collector, 'cpu_ticks', side_effect=[(100, 80, 0, 0), (200, 160, 0, 0)]), \
                mock.patch.object(collector, 'counters', return_value={}), \
                mock.patch.object(collector.os, 'sysconf', return_value=4096, create=True), \
                mock.patch.object(collector, 'inspect_containers', return_value=containers), \
                mock.patch.object(collector, 'process_snapshot', return_value={}), \
                mock.patch.object(collector, 'read_application', side_effect=[fail] if initial else [{}, fail]), \
                mock.patch.object(collector.time, 'sleep'), \
                mock.patch.object(collector.time, 'monotonic', side_effect=[0, 0, 5]), \
                mock.patch.object(collector, 'emit') as emit:
            self.assertEqual(1, collector.main())
            result = emit.call_args[0][0]
        self.assertEqual('RESOURCE_COLLECTION_FAILED', result['error'])
        self.assertEqual('INITIAL_APPLICATION' if initial else 'APPLICATION_READ', result['failure']['stage'])
        self.assertEqual('COMMAND_EXIT', result['failure']['kind'])
        self.assertEqual(28, result['failure']['exitCode'])
        self.assertNotIn('SECRET', json.dumps(result))

    def test_initial_management_timeout_records_stage(self):
        self.run_application_failure(True)

    def test_management_timeout_during_collection_records_stage(self):
        self.run_application_failure(False)


if __name__ == '__main__':
    unittest.main()
