"""실제 서버 접속 없이 프로세스·GC 카운터 파싱과 미측정/교체 처리를 검사한다."""
import importlib.util
import pathlib
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location('collector', pathlib.Path(__file__).with_name('collect-resources.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class DiagnosticsTest(unittest.TestCase):
    """0으로 숨기지 않는 원본 파싱과 동일 프로세스 구간 비교를 검증한다."""
    def test_stat_with_parentheses_in_name_and_memory_bytes(self):
        fields = ['0'] * 30
        fields[7], fields[9], fields[19] = '100', '7', '12345'
        def read(path):
            return '99 (java (worker)) ' + ' '.join(fields) if path.name == 'stat' else 'Name:\tjava\nVmRSS:\t10 kB\nVmSwap:\t20 kB\n'
        with mock.patch.object(pathlib.Path, 'read_text', autospec=True, side_effect=read):
            result = collector.process_snapshot({'name': '/spring-api', 'pid': 99})
        self.assertEqual((100, 7, 12345, 10240, 20480), tuple(result[k] for k in
            ['minorFaults', 'majorFaults', 'startTimeTicks', 'rssBytes', 'swapBytes']))

    def test_missing_process_memory_fails_instead_of_zero(self):
        with mock.patch.object(pathlib.Path, 'read_text', return_value='99 (java) ' + '0 ' * 30):
            with self.assertRaises(ValueError):
                collector.process_snapshot({'name': '/spring-api', 'pid': 99})

    def test_init_wrapper_is_not_mistaken_for_java_process(self):
        def read(path):
            return '99 (tini) ' + '0 ' * 30 if path.name == 'stat' else 'Name:\ttini\nVmRSS:\t10 kB\nVmSwap:\t20 kB\n'
        with mock.patch.object(pathlib.Path, 'read_text', autospec=True, side_effect=read):
            with self.assertRaises(ValueError):
                collector.process_snapshot({'name': '/spring-api', 'pid': 99})

    def test_process_rates_and_replacement_detection(self):
        a = {'name': '/spring-api', 'pid': 99, 'startTimeTicks': 100, 'minorFaults': 10, 'majorFaults': 5}
        b = dict(a, minorFaults=20, majorFaults=7)
        result = collector.process_deltas([a], [b], 5)[0]
        self.assertEqual(2, result['minorFaultsPerSecond'])
        self.assertEqual(.4, result['majorFaultsPerSecond'])
        for changed in [dict(b, pid=100), dict(b, startTimeTicks=101), dict(b, majorFaults=0)]:
            with self.assertRaises(ValueError):
                collector.process_deltas([a], [changed], 5)

    def test_gc_delta_and_older_endpoint_compatibility(self):
        a = {'gc': {'totalCollectionCount': 2, 'totalCollectionTimeMillis': 10}}
        b = {'gc': {'totalCollectionCount': 4, 'totalCollectionTimeMillis': 17}}
        self.assertEqual({'available': True, 'count': 2, 'timeMillis': 7}, collector.gc_delta(a, b))
        self.assertEqual({'available': False, 'count': None, 'timeMillis': None}, collector.gc_delta({}, b))
        self.assertFalse(collector.gc_delta({'gc': {'totalCollectionCount': -1}}, b)['available'])
        self.assertFalse(collector.gc_delta({'gc': None}, b)['available'])
        self.assertEqual({'available': True, 'count': 0, 'timeMillis': 0}, collector.gc_delta(a, a))
        with self.assertRaises(ValueError):
            collector.gc_delta(b, a)


if __name__ == '__main__':
    unittest.main(verbosity=2)
