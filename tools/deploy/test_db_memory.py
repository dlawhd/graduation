"""실제 운영 연결 없이 DB 설정 보존 도구의 변경 범위·백업·실패 경로를 확인한다."""
import copy
import hashlib
import json
import os
import pathlib
import tempfile
import unittest
from unittest.mock import patch

from test_deploy import load

memory = load('db_memory', 'persist-db-memory.py')
SOURCE = 'services:\n  db:\n    image: mariadb:10.11\n  api:\n    image: unchanged\n'


class DbMemoryTest(unittest.TestCase):
    """명령 대역으로 파일 반영과 검사만 실행하고 운영 변경 명령이 없는지 확인한다."""
    def test_edit_only_inserts_db_command(self):
        result = memory.amended(SOURCE)
        self.assertIn('    command: ' + json.dumps(memory.COMMAND), result)
        self.assertTrue(result.endswith('  api:\n    image: unchanged\n'))

    def test_unknown_or_existing_section_is_rejected(self):
        for source in ['services:\n', SOURCE + '  db:\n', SOURCE.replace('    image: mariadb:10.11', '    command: custom')]:
            with self.subTest(source=source), self.assertRaises(ValueError):
                memory.amended(source)

    def test_unrelated_merged_change_is_rejected(self):
        before = {'services': {'db': {'image': 'old', 'command': None}}}
        after = copy.deepcopy(before)
        after['services']['db']['command'] = memory.COMMAND
        memory.same_except_command(before, after)
        after['services']['db']['image'] = 'new'
        with self.assertRaisesRegex(ValueError, 'UNRELATED'):
            memory.same_except_command(before, after)

    def case(self, apply=False, fail=None):
        with tempfile.TemporaryDirectory() as folder:
            base = pathlib.Path(folder) / 'docker-compose.prod.yml'
            base.write_text(SOURCE, encoding='utf-8')
            os.chmod(base, 0o600)
            def resolve(path):
                content = pathlib.Path(path).read_text(encoding='utf-8')
                command = memory.COMMAND if 'command:' in content else None
                if fail == 'postcheck' and pathlib.Path(path) == base and command:
                    raise ValueError('POSTCHECK_FAILED')
                return {'services': {'db': {'command': command}, 'api': {'image': 'old'}}}
            states = [['stable']] if fail != 'state' else [['stable'], ['changed']]
            with patch.object(memory, 'resolved', side_effect=resolve), \
                    patch.object(memory, 'snapshot', side_effect=states * 4):
                digest = 'bad' if fail == 'hash' else hashlib.sha256(base.read_bytes()).hexdigest()
                if fail:
                    with self.assertRaises(ValueError):
                        memory.persist(folder, apply, digest)
                    self.assertEqual(base.read_text(encoding='utf-8'), SOURCE)
                else:
                    result = memory.persist(folder, apply, digest)
                    self.assertEqual(result['status'], 'PERSISTED_WITHOUT_RESTART' if apply else 'PLAN_VALIDATED')
                    self.assertEqual('command:' in base.read_text(encoding='utf-8'), apply)
                backups = list(pathlib.Path(folder).glob('db-memory-base-backup-*'))
                if backups:
                    self.assertEqual(backups[0].read_text(encoding='utf-8'), SOURCE)
                    if os.name == 'posix':
                        self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
                self.assertFalse(list(pathlib.Path(folder).glob('.db-memory-*')))

    def test_plan_does_not_change_base(self):
        self.case()

    def test_apply_preserves_backup(self):
        self.case(apply=True)

    def test_wrong_hash_stops_before_write(self):
        self.case(apply=True, fail='hash')

    def test_state_change_stops_before_write(self):
        self.case(apply=True, fail='state')

    def test_postcheck_failure_restores_original(self):
        self.case(apply=True, fail='postcheck')

    def test_snapshot_reads_only_fixed_db_values(self):
        calls = []
        def fake(args, data=None):
            calls.append(args)
            if args[:2] == ['docker', 'inspect']:
                return json.dumps([{'Id': name, 'Image': 'image', 'State': {'Running': True,
                    'OOMKilled': False, 'StartedAt': 'same'}, 'RestartCount': 0,
                    'Config': {'Cmd': memory.COMMAND}} for name in ['api', 'db']]).encode()
            self.assertEqual(args[:3], ['docker', 'exec', '-i'])
            self.assertTrue(data.startswith(b'SELECT '))
            return json.dumps(memory.CACHE).encode()
        with patch.object(memory, 'run', side_effect=fake):
            self.assertEqual(len(memory.snapshot()), 2)
        self.assertEqual(len(calls), 2)


if __name__ == '__main__':
    unittest.main()
