"""실제 서버 요청 없이 수집 장애 후 최소 대기와 예외 분리를 검사한다."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('recovery', pathlib.Path(__file__).with_name('auth-recovery.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoveryTest(unittest.TestCase):
    """가짜 시계로 30초를 빠르게 검증하고 실제 대기나 인증을 하지 않는다."""
    def run_case(self, fail):
        now = [0.0]
        calls = []
        def pause(seconds):
            now[0] += seconds
        def pump(seconds):
            calls.append(seconds)
            if fail:
                raise RuntimeError('COLLECTOR_DISCONNECTED')
            pause(seconds)
        result = recovery.settle_after_failure(pump, clock=lambda: now[0], pause=pause)
        self.assertGreaterEqual(now[0], 30)
        self.assertLess(now[0], 30.11)
        self.assertTrue(calls)
        return result

    def test_successful_collection_observes_full_window(self):
        self.assertEqual(self.run_case(False)['collectionFailures'], 0)

    def test_collection_failure_does_not_skip_wait(self):
        self.assertGreater(self.run_case(True)['collectionFailures'], 0)


if __name__ == '__main__':
    unittest.main()
