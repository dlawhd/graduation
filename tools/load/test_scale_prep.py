"""운영 DB에 접속하지 않고 300명 확장 SQL의 쓰기 범위와 검증 경계를 검사한다."""
import copy
import importlib.util
import pathlib
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('scale', pathlib.Path(__file__).with_name('scale-read-prep.py'))
scale = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scale)


def plan():
    base = {'schema': 1, 'scope': 'ec2-prepared', 'runId': 'lt00000000',
            'accounts': [{'userId': i + 1, 'loginId': 'lt00000000%02d' % i} for i in range(10)],
            'jars': [{'jarId': j + 1, 'ownerId': j + 1, 'name': 'lt00000000-jar-%d' % j} for j in range(3)]}
    groups = []
    for i in range(1, 30):
        prefix = 'lt%08x' % i
        groups.append({'schema': 1, 'runId': prefix, 'accounts': [
            {'loginId': prefix + '%02d' % n, 'password': 'Lt!7' + 'a' * 32,
             'hash': '$argon2id$v=19$m=19456,t=2,p=1$' + 'A' * 22 + '$' + 'B' * 43} for n in range(10)]})
    return {'schema': 2, 'base': base, 'groups': groups}


class ScaleTest(unittest.TestCase):
    """대량 준비도 원본 보호·원자성·중복 거절을 유지해야 한다."""
    def test_exact_insert_count_and_one_transaction(self):
        sql = scale.seed_sql(plan())
        self.assertEqual(5104, sql.count('INSERT INTO '))
        self.assertEqual(1, sql.count('START TRANSACTION;'))
        self.assertEqual(1, sql.count('COMMIT;'))
        for keyword in ['UPDATE ', 'DELETE ', 'CREATE ', 'ALTER ', 'DROP ']:
            self.assertTrue(keyword not in sql, 'Production SQL must only insert')
        self.assertTrue('ROLLBACK;' in sql and 'RESIGNAL;' in sql)

    def test_scope_and_schema_guards(self):
        sql = scale.seed_sql(plan())
        for marker in ['BASE_ACCOUNTS_CHANGED', 'BASE_JARS_CHANGED', 'UNEXPECTED_TEST_FIXTURES',
                       'SCHEMA_MISMATCH', 'UNREVIEWED_TRIGGER', 'TRANSACTIONAL_TABLES_REQUIRED']:
            self.assertTrue(marker in sql, 'Missing safety guard')
        self.assertEqual(29, sql.count('FIXTURE_ALREADY_EXISTS'))

    def test_duplicate_and_missing_groups_rejected(self):
        for mutate in [lambda p: p['groups'].pop(),
                       lambda p: p['groups'].__setitem__(1, copy.deepcopy(p['groups'][0])),
                       lambda p: p['base']['accounts'][0].__setitem__('userId', '1 OR 1=1'),
                       lambda p: p['base']['jars'][0].__setitem__('ownerId', 999)]:
            value = plan()
            mutate(value)
            with self.assertRaises(ValueError):
                scale.seed_sql(value)

    def test_no_plaintext_password_in_sql(self):
        p = plan()
        self.assertTrue(p['groups'][0]['accounts'][0]['password'] not in scale.seed_sql(p))
        sql = scale.seed_sql(p, True)
        self.assertTrue(sql.index('LOCAL_ROLLBACK_PROBE') < sql.index('COMMIT;'))

    def test_real_container_refused_without_docker_call(self):
        with mock.patch.object(scale.prep, 'run') as run:
            with self.assertRaises(ValueError):
                scale.local_check(pathlib.Path('unused'), 'mariadb', 'a' * 64)
            run.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
