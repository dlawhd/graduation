"""부하 기록에 실제 자원 조건을 남기고 과거 결과의 조건을 바꿔 쓰지 않는지 검사한다."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('concurrent_report', Path(__file__).with_name('summarize-concurrent-1000.py'))
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)


class ReadReportTests(unittest.TestCase):
    """이전 실행·현재 실행·혼합 조건을 구분해 잘못된 성능 비교를 방지한다."""

    def test_keeps_legacy_two_cpu_results(self):
        self.assertEqual(report.generator_cpu_limit([{'targetVus': 500}]), 2)

    def test_records_actual_current_limit_and_excludes_auth(self):
        self.assertEqual(report.generator_cpu_limit([
            {'targetVus': 0, 'generatorCpu': 2}, {'targetVus': 100, 'generatorCpu': 4},
            {'targetVus': 500, 'generatorCpu': 4}]), 4)

    def test_does_not_collapse_mixed_limits_into_one_condition(self):
        self.assertEqual(report.generator_cpu_limit([
            {'targetVus': 100, 'generatorCpu': 2}, {'targetVus': 500, 'generatorCpu': 4}]), [2, 4])
        with self.assertRaises(ValueError):
            report.generator_cpu_limit([{'targetVus': 500, 'generatorCpu': 8}])


if __name__ == '__main__':
    unittest.main()
