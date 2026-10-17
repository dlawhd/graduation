#!/usr/bin/env python3
"""PC에서 SSH 지표를 감시하고 자신이 시작한 부하 프로세스 트리만 중단한다."""

import argparse
import datetime
import hashlib
import json
import math
import os
import pathlib
import queue
import re
import signal
import subprocess
import sys
import threading
import time


class UnsafeSample(ValueError):
    """수집 실패·잘못된 지표·안전 기준 초과를 동일한 중단 경로로 전달한다."""


class Policy:
    """백분율을 원본 카운터로 다시 계산하고 연속 초과 시간을 추적한다."""

    def __init__(self, sustained=30):
        self.sustained = sustained
        self.over_since = {}
        self.baseline = None
        self.sequence = 0
        self.last_remote_time = None
        self.oom_kills = None

    @staticmethod
    def number(value, minimum=0):
        if type(value) not in (int, float) or not math.isfinite(value) or value < minimum:
            raise UnsafeSample("INVALID_COUNTER")
        return value

    def check(self, sample, now):
        """0% 대체나 재시작 기준선 갱신 없이 첫 정상 표본과 계속 비교한다."""
        if sample.get("schema") != 1 or "error" in sample:
            raise UnsafeSample("COLLECTION_ERROR")
        sequence = sample.get("sequence")
        if type(sequence) is not int or sequence != self.sequence + 1:
            raise UnsafeSample("INVALID_SEQUENCE")
        timestamp = datetime.datetime.fromisoformat(sample["observedAt"].replace("Z", "+00:00"))
        if timestamp.utcoffset() is None or (self.last_remote_time and timestamp <= self.last_remote_time):
            raise UnsafeSample("STALE_SAMPLE")
        self.number(sample["intervalSeconds"], 0.001)
        if sample["intervalSeconds"] > 15:
            raise UnsafeSample("COLLECTION_GAP")
        cpu = self.number(sample["cpuPercent"])
        if cpu > 100:
            raise UnsafeSample("INVALID_CPU")
        total = self.number(sample["memTotalBytes"], 1)
        available = self.number(sample["memAvailableBytes"])
        if available > total:
            raise UnsafeSample("INVALID_MEMORY")
        for key in ("swapUsedBytes", "swapInBytesPerSecond", "swapOutBytesPerSecond",
                    "ioWaitPercent", "stealPercent"):
            self.number(sample[key])
        oom_kills = self.number(sample["oomKillCount"])
        if self.oom_kills is not None and oom_kills != self.oom_kills:
            raise UnsafeSample("HOST_OOM_COUNTER_CHANGED")
        if available < 64 * 1024 * 1024:
            raise UnsafeSample("MEMORY_AVAILABLE_BELOW_64_MIB")
        containers = sample["containers"]
        if len(containers) != 2 or {c["name"] for c in containers} != {"/spring-api", "/mariadb"}:
            raise UnsafeSample("MISSING_CONTAINER")
        identity = {}
        for container in containers:
            if container["running"] is not True or container["oomKilled"] is not False:
                raise UnsafeSample("CONTAINER_STOPPED_OR_OOM")
            self.number(container["restarts"])
            if not all(container.get(key) for key in ("id", "image", "startedAt")):
                raise UnsafeSample("INVALID_CONTAINER")
            identity[container["name"]] = tuple(container[key] for key in (
                "id", "image", "startedAt", "restarts"))
        if self.baseline is not None and identity != self.baseline:
            raise UnsafeSample("CONTAINER_RESTARTED_OR_REPLACED")
        app = sample["application"]
        if app.get("measurable") is not True or not app.get("pools"):
            raise UnsafeSample("UNMEASURABLE")
        heap_max = self.number(app["heap"]["maxBytes"], 1)
        heap_used = self.number(app["heap"]["usedBytes"])
        if heap_used > heap_max:
            raise UnsafeSample("INVALID_HEAP")
        heap = heap_used / heap_max * 100
        pool_percent = []
        names = set()
        for pool in app["pools"]:
            if pool.get("initialized") is not True or not pool.get("name") or pool["name"] in names:
                raise UnsafeSample("INVALID_POOL")
            names.add(pool["name"])
            maximum = self.number(pool["maxConnections"], 1)
            for key in ("activeConnections", "idleConnections", "totalConnections", "pendingRequests"):
                self.number(pool[key])
            pool_percent.append(pool["activeConnections"] / maximum * 100)
        pool_usage = max(pool_percent)
        warnings = []
        for key, value, limit in (("CPU", cpu, 70), ("HEAP", heap, 75), ("POOL", pool_usage, 80)):
            if value > limit:
                self.over_since.setdefault(key, now)
                warnings.append(key + "_OVER_LIMIT")
                if now - self.over_since[key] >= self.sustained:
                    raise UnsafeSample(key + "_SUSTAINED_LIMIT")
            else:
                self.over_since.pop(key, None)
        if pool_usage >= 70:
            warnings.append("POOL_AT_LEAST_70_PERCENT")
        if heap >= 90:
            raise UnsafeSample("HEAP_AT_LEAST_90_PERCENT")
        self.baseline, self.sequence, self.last_remote_time = identity, sequence, timestamp
        self.oom_kills = oom_kills
        return {"cpuPercent": cpu, "heapPercent": heap, "poolPercent": pool_usage,
                "warnings": warnings}


def start_process(command, **kwargs):
    """새 프로세스 그룹을 만들어 다른 k6·SSH·서비스 프로세스와 분리한다."""
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(command, **kwargs)


def stop_owned(process):
    """저장한 Popen의 실행 중 PID만 종료한다. 이름 기반 종료·서버 종료는 금지한다."""
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=5, check=True)
    else:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
    process.wait(timeout=5)


def lines_to_queue(stream, messages):
    try:
        for line in stream:
            messages.put(line)
    finally:
        messages.put(None)
        stream.close()


def run_session(collector_command, source, load_command, output, observe_seconds=60,
                stale_seconds=15, startup_seconds=20, max_seconds=600, sustained=30):
    """정상 표본 2개를 확인한 뒤에만 부하를 시작하고 통신 장애 시에도 종료한다."""
    output.mkdir(parents=True, exist_ok=False)
    policy = Policy(sustained)
    collector = load = None
    result = {"status": "ABORTED", "reason": "INCOMPLETE", "loadStarted": False,
              "collectorSha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
              "policy": {"cpuLimitPercent": 70, "heapLimitPercent": 75,
                         "poolLimitPercent": 80, "sustainedSeconds": sustained,
                         "staleSeconds": stale_seconds, "startupSeconds": startup_seconds,
                         "criticalHeapPercent": 90, "minimumAvailableMiB": 64,
                         "maxSessionSeconds": max_seconds}}
    messages = queue.Queue()
    start = time.monotonic()
    last_received = None
    healthy = 0
    try:
        with (output / "samples.jsonl").open("x", encoding="utf-8") as samples, \
                (output / "collector-errors.log").open("xb") as errors, \
                (output / "load.log").open("xb") as load_log:
            collector = start_process(collector_command, stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=errors,
                                      encoding="utf-8")
            threading.Thread(target=lines_to_queue, args=(collector.stdout, messages), daemon=True).start()
            collector.stdin.write(source)
            collector.stdin.close()
            while True:
                now = time.monotonic()
                if now - start >= max_seconds:
                    raise UnsafeSample("MAX_SESSION_DURATION")
                if last_received is None and now - start >= startup_seconds:
                    raise UnsafeSample("NO_INITIAL_SAMPLE")
                if last_received is not None and now - last_received >= stale_seconds:
                    raise UnsafeSample("COLLECTION_TIMEOUT")
                try:
                    line = messages.get(timeout=0.1)
                except queue.Empty:
                    line = ""
                if line is None:
                    raise UnsafeSample("COLLECTOR_DISCONNECTED")
                if line:
                    now = time.monotonic()
                    sample = json.loads(line)
                    # 잘못된 표본도 버리지 않고 원인 분석에 남긴다. 비밀값은 수집 대상이 아니다.
                    samples.write(json.dumps({"receivedAt": datetime.datetime.now(
                        datetime.timezone.utc).isoformat(), "sample": sample}) + "\n")
                    samples.flush()
                    checked = policy.check(sample, now)
                    last_received = now
                    print(json.dumps(checked), flush=True)
                    healthy = healthy + 1 if not checked["warnings"] else 0
                    if load_command and load is None and healthy >= 2:
                        load = start_process(load_command, stdin=subprocess.DEVNULL,
                                             stdout=load_log, stderr=subprocess.STDOUT)
                        result["loadStarted"] = True
                if load is not None and load.poll() is not None:
                    code = load.returncode
                    result.update(status="LOAD_FINISHED" if code == 0 else "LOAD_FAILED",
                                  reason="LOAD_EXIT", loadExitCode=code)
                    break
                if not load_command and last_received is not None and now - start >= observe_seconds:
                    result.update(status="OBSERVED", reason="OBSERVATION_FINISHED")
                    break
    except KeyboardInterrupt:
        result["reason"] = "OPERATOR_INTERRUPTED"
    except UnsafeSample as exc:
        result["reason"] = str(exc)
    except Exception:
        # 명령 인자에 인증정보가 있을 수 있어 예외 원문은 저장하지 않는다.
        result["reason"] = "LOCAL_IO_OR_INVALID_SAMPLE"
    finally:
        cleanup_failed = False
        for process in (load, collector):
            try:
                stop_owned(process)
            except Exception:
                cleanup_failed = True
        if cleanup_failed:
            result.update(status="ABORTED", reason="PROCESS_STOP_FAILED_CHECK_LOCAL_PROCESS")
        result["elapsedSeconds"] = round(time.monotonic() - start, 3)
        (output / "summary.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ssh-target", required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--observe-seconds", type=int, default=60)
    parser.add_argument("--max-seconds", type=int, default=600)
    parser.add_argument("load", nargs=argparse.REMAINDER,
                        help="생략하면 감시만 실행. 승인된 k6 run ... 명령은 -- 뒤에 지정")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*", args.ssh_target):
        parser.error("SSH target must be user@host")
    if not pathlib.Path(args.identity).is_file():
        parser.error("SSH identity file does not exist")
    if not 15 <= args.observe_seconds <= 600 or not args.observe_seconds <= args.max_seconds <= 3600:
        parser.error("Invalid observation/session duration")
    load_command = args.load[1:] if args.load[:1] == ["--"] else args.load
    if load_command and (pathlib.Path(load_command[0]).stem.lower() != "k6" or
                         len(load_command) < 3 or load_command[1] != "run"):
        parser.error("Only an approved k6 run command may be launched")
    # Known hosts 검증을 우회하지 않는다. SSH 끊김·sudo 실패는 부하 중단 사유다.
    ssh = ["ssh", "-T", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes",
           "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=2",
           "-i", args.identity, args.ssh_target, "python3 -u -"]
    source = pathlib.Path(__file__).with_name("collect-resources.py").read_text(encoding="utf-8")
    result = run_session(ssh, source, load_command, args.output,
                         observe_seconds=args.observe_seconds, max_seconds=args.max_seconds)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] in ("OBSERVED", "LOAD_FINISHED") else 2


if __name__ == "__main__":
    sys.exit(main())
