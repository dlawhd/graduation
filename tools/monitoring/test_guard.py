"""실제 서비스에 요청하지 않고 안전 정책과 소유한 부하 프로세스 종료를 검증한다."""

import copy
import datetime
import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


guard = module("guard_load", "guard-load.py")
collector = module("collector", "collect-resources.py")


def sample(sequence=1):
    timestamp = datetime.datetime(2026, 10, 17, tzinfo=datetime.timezone.utc)
    return {
        "schema": 1, "sequence": sequence,
        "observedAt": (timestamp + datetime.timedelta(seconds=sequence * 5)).isoformat(),
        "intervalSeconds": 5, "cpuPercent": 10, "ioWaitPercent": 0, "stealPercent": 0,
        "memTotalBytes": 914 * 1024 ** 2, "memAvailableBytes": 179 * 1024 ** 2,
        "swapUsedBytes": 462 * 1024 ** 2,
        "swapInBytesPerSecond": 0, "swapOutBytesPerSecond": 0,
        "oomKillCount": 0,
        "containers": [{"name": name, "id": name, "image": "image-1", "pid": 123,
                        "running": True, "startedAt": "start-1", "restarts": 0, "oomKilled": False}
                       for name in ("/spring-api", "/mariadb")],
        "application": {"measurable": True, "heap": {"usedBytes": 42, "maxBytes": 100},
                        "pools": [{"name": "dataSource", "initialized": True, "maxConnections": 10,
                                   "activeConnections": 0, "idleConnections": 10,
                                   "totalConnections": 10, "pendingRequests": 0}]},
    }


class PolicyTest(unittest.TestCase):
    """경계값·지속 시간·수집 누락을 실제 30초 대기 없이 검증한다."""

    def rejected(self, value, expected):
        with self.assertRaisesRegex(guard.UnsafeSample, expected):
            guard.Policy().check(value, 0)

    def test_actual_snapshot_ratios_are_recomputed(self):
        value = sample()
        value["application"]["heap"]["usedPercent"] = 0
        self.assertEqual(42, guard.Policy().check(value, 0)["heapPercent"])

    def test_limits_are_inclusive(self):
        value = sample()
        value["cpuPercent"] = 70
        value["application"]["heap"]["usedBytes"] = 75
        value["application"]["pools"][0]["activeConnections"] = 8
        policy = guard.Policy()
        policy.check(value, 0)
        value = copy.deepcopy(value)
        value.update(sequence=2, observedAt=sample(2)["observedAt"])
        policy.check(value, 31)
        self.assertFalse(policy.over_since)

    def test_each_sustained_limit(self):
        for key in ("CPU", "HEAP", "POOL"):
            with self.subTest(key=key):
                policy = guard.Policy()
                value = sample()
                if key == "CPU":
                    value["cpuPercent"] = 71
                elif key == "HEAP":
                    value["application"]["heap"]["usedBytes"] = 76
                else:
                    value["application"]["pools"][0]["activeConnections"] = 9
                policy.check(value, 0)
                value.update(sequence=2, observedAt=sample(2)["observedAt"])
                policy.check(value, 29.9)
                value.update(sequence=3, observedAt=sample(3)["observedAt"])
                with self.assertRaisesRegex(guard.UnsafeSample, key + "_SUSTAINED_LIMIT"):
                    policy.check(value, 30)

    def test_recovery_resets_continuous_limit(self):
        policy = guard.Policy()
        for sequence, now, cpu in ((1, 0, 90), (2, 20, 10), (3, 31, 90), (4, 60, 90)):
            value = sample(sequence)
            value["cpuPercent"] = cpu
            policy.check(value, now)

    def test_unmeasurable_and_pool_missing(self):
        value = sample()
        value["application"]["measurable"] = False
        self.rejected(value, "UNMEASURABLE")
        value = sample()
        value["application"]["pools"] = []
        self.rejected(value, "UNMEASURABLE")

    def test_low_available_memory_and_critical_heap(self):
        value = sample()
        value["memAvailableBytes"] = 63 * 1024 ** 2
        self.rejected(value, "MEMORY_AVAILABLE")
        value = sample()
        value["application"]["heap"]["usedBytes"] = 90
        self.rejected(value, "HEAP_AT_LEAST_90")

    def test_container_restart_replacement_and_oom(self):
        for field, changed in (("id", "replacement"), ("image", "image-2"),
                               ("startedAt", "start-2"), ("restarts", 1)):
            with self.subTest(field=field):
                policy = guard.Policy()
                policy.check(sample(), 0)
                value = sample(2)
                value["containers"][0][field] = changed
                with self.assertRaisesRegex(guard.UnsafeSample, "RESTARTED_OR_REPLACED"):
                    policy.check(value, 5)
        value = sample()
        value["containers"][0]["oomKilled"] = True
        self.rejected(value, "STOPPED_OR_OOM")

    def test_invalid_numbers_and_missing_containers(self):
        for invalid in (None, -1, True, float("nan"), float("inf")):
            value = sample()
            value["cpuPercent"] = invalid
            self.rejected(value, "INVALID_COUNTER")
        value = sample()
        value["containers"] = []
        self.rejected(value, "MISSING_CONTAINER")

    def test_host_oom_counter_change(self):
        policy = guard.Policy()
        policy.check(sample(), 0)
        value = sample(2)
        value["oomKillCount"] = 1
        with self.assertRaisesRegex(guard.UnsafeSample, "HOST_OOM_COUNTER_CHANGED"):
            policy.check(value, 5)

    def test_sequence_stale_timestamp_and_gap(self):
        policy = guard.Policy()
        policy.check(sample(), 0)
        with self.assertRaisesRegex(guard.UnsafeSample, "INVALID_SEQUENCE"):
            policy.check(sample(), 5)
        value = sample(2)
        value["observedAt"] = sample()["observedAt"]
        with self.assertRaisesRegex(guard.UnsafeSample, "STALE_SAMPLE"):
            policy.check(value, 5)
        value = sample()
        value["intervalSeconds"] = 16
        self.rejected(value, "COLLECTION_GAP")


class ProcessTest(unittest.TestCase):
    """실제 로컬 자식 프로세스를 이용하되 HTTP·AWS·EC2 요청은 보내지 않는다."""

    def run_case(self, suffix, expected, load=True, **kwargs):
        first = "import json,time\n"
        for sequence in (1, 2):
            first += "print(" + repr(json.dumps(sample(sequence))) + ",flush=True)\ntime.sleep(.1)\n"
        dummy = [sys.executable, "-c", "import time; time.sleep(30)"] if load else []
        with tempfile.TemporaryDirectory(prefix="memoryjar-guard-test-") as temporary:
            output = pathlib.Path(temporary) / "run"
            unrelated = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
            real_start = guard.start_process
            processes = []

            def track(*args, **options):
                child = real_start(*args, **options)
                processes.append(child)
                return child

            try:
                with mock.patch.object(guard, "start_process", side_effect=track):
                    result = guard.run_session([sys.executable, "-u", "-c", first + suffix], "",
                                               dummy, output, max_seconds=5, **kwargs)
                self.assertEqual(expected, result["reason"], result)
                self.assertEqual(load, result["loadStarted"])
                self.assertTrue(all(p.poll() is not None for p in processes))
                self.assertIsNone(unrelated.poll(), "무관한 프로세스는 종료되면 안 됨")
                self.assertEqual(result, json.loads((output / "summary.json").read_text()))
                self.assertTrue((output / "samples.jsonl").is_file())
                return result
            finally:
                unrelated.terminate()
                unrelated.wait(timeout=5)

    def test_collector_disconnect_stops_only_owned_load(self):
        self.run_case("", "COLLECTOR_DISCONNECTED")

    def test_silent_collector_stops_owned_load(self):
        self.run_case("time.sleep(30)\n", "COLLECTION_TIMEOUT", stale_seconds=.4)

    def test_invalid_json_stops_owned_load(self):
        self.run_case("print('not-json',flush=True)\ntime.sleep(30)\n", "LOCAL_IO_OR_INVALID_SAMPLE")

    def test_critical_sample_stops_owned_load(self):
        value = sample(3)
        value["memAvailableBytes"] = 0
        self.run_case("print(" + repr(json.dumps(value)) + ",flush=True)\ntime.sleep(30)\n",
                      "MEMORY_AVAILABLE_BELOW_64_MIB")

    def test_sustained_limit_stops_owned_load(self):
        suffix = ""
        for sequence in range(3, 9):
            value = sample(sequence)
            value["cpuPercent"] = 71
            suffix += "print(" + repr(json.dumps(value)) + ",flush=True)\ntime.sleep(.1)\n"
        self.run_case(suffix + "time.sleep(30)\n", "CPU_SUSTAINED_LIMIT", sustained=.2)

    def test_collection_error_stops_owned_load(self):
        self.run_case("print('{\"error\":\"RESOURCE_COLLECTION_FAILED\"}',flush=True)\ntime.sleep(30)\n",
                      "COLLECTION_ERROR")

    def test_observation_never_starts_load(self):
        result = self.run_case("time.sleep(30)\n", "OBSERVATION_FINISHED",
                               load=False, observe_seconds=.3)
        self.assertEqual("OBSERVED", result["status"])

    @unittest.skipUnless(shutil.which("k6"), "k6 미설치: 별도 k6 중단 검증 필요")
    def test_real_k6_without_http_is_stopped(self):
        original = guard.start_process
        k6_processes = []

        def replace_dummy(command, **kwargs):
            if command[:2] == [sys.executable, "-c"]:
                command = [shutil.which("k6"), "run", str(ROOT / "idle-load.js")]
                process = original(command, **kwargs)
                k6_processes.append(process)
                return process
            return original(command, **kwargs)

        with mock.patch.object(guard, "start_process", side_effect=replace_dummy):
            # run_case의 추적기는 이 대역을 감싸므로 실제 k6의 종료까지 검사한다.
            self.run_case("time.sleep(30)\n", "COLLECTION_TIMEOUT", stale_seconds=2)
        self.assertEqual(1, len(k6_processes))
        self.assertIsNotNone(k6_processes[0].returncode)

    def test_no_initial_sample_never_starts_load(self):
        with tempfile.TemporaryDirectory() as temporary:
            result = guard.run_session([sys.executable, "-c", "import time; time.sleep(30)"], "",
                                       [sys.executable, "-c", "raise SystemExit(99)"],
                                       pathlib.Path(temporary) / "run", startup_seconds=.2)
            self.assertEqual("NO_INITIAL_SAMPLE", result["reason"])
            self.assertFalse(result["loadStarted"])


class CollectorTest(unittest.TestCase):
    """OS 의존 조회를 대역으로 교체해 오류 원문이 유출되지 않는지 확인한다."""

    def test_failure_is_structured_and_redacted(self):
        with mock.patch.object(collector, "cpu_ticks", side_effect=RuntimeError("secret-value")), \
                mock.patch.object(collector, "emit") as emit:
            self.assertEqual(1, collector.main())
            emit.assert_called_once()
            result = emit.call_args[0][0]
            self.assertEqual('RESOURCE_COLLECTION_FAILED', result['error'])
            self.assertEqual('INITIAL_CPU', result['failure']['stage'])
            self.assertNotIn('secret-value', json.dumps(result))

    def test_linux_cpu_parser_excludes_duplicate_guest_ticks(self):
        with mock.patch.object(pathlib.Path, "read_text", return_value="cpu 10 2 3 80 1 2 1 1 5 2\n"):
            self.assertEqual((100, 81, 1, 1), collector.cpu_ticks())

    def test_memory_and_swap_parser(self):
        with mock.patch.object(pathlib.Path, "read_text", return_value="MemTotal: 914 kB\nMemAvailable: 179 kB\n"):
            self.assertEqual({"MemTotal": 914, "MemAvailable": 179}, collector.counters("unused"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
