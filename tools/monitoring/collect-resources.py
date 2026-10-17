#!/usr/bin/env python3
"""EC2에서 5초마다 자원만 읽어 JSONL로 보낸다. 설정 변경·DB 쿼리는 하지 않는다."""

import datetime
import json
import math
import os
import pathlib
import subprocess
import sys
import time


def command(args, timeout=4):
    """오류 원문에는 운영 정보가 섞일 수 있어 고정된 오류 코드만 전달한다."""
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, check=True, encoding="utf-8")
    return result.stdout


def counters(path):
    return {parts[0].rstrip(":"): int(parts[1])
            for line in pathlib.Path(path).read_text().splitlines()
            for parts in [line.split()] if len(parts) >= 2}


def cpu_ticks():
    values = [int(v) for v in pathlib.Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
    # guest 시간은 user/nice에 이미 포함되므로 중복 합산하지 않는다.
    return sum(values[:8]), values[3] + values[4], values[4], values[7]


def inspect_containers():
    template = ('{"name":{{json .Name}},"id":{{json .Id}},"image":{{json .Image}},'
                '"running":{{.State.Running}},"pid":{{.State.Pid}},'
                '"startedAt":{{json .State.StartedAt}},"restarts":{{.RestartCount}},'
                '"oomKilled":{{.State.OOMKilled}}}')
    return [json.loads(line) for line in command(
        ["docker", "inspect", "--format", template, "spring-api", "mariadb"]).splitlines()]


def read_application(pid):
    return json.loads(command([
        "sudo", "-n", "nsenter", "--target", str(pid), "--net", "--",
        "curl", "--noproxy", "*", "--fail", "--silent", "--show-error",
        "--max-time", "3", "http://127.0.0.1:9091/actuator/resources"], timeout=4))


def emit(value):
    print(json.dumps(value, separators=(",", ":"), allow_nan=False), flush=True)


def main():
    """첫 CPU 표본은 준비에만 쓰고, 이후 구간 평균을 5초 주기로 전송한다."""
    try:
        previous_cpu = cpu_ticks()
        previous_vm = counters("/proc/vmstat")
        previous_at = time.monotonic()
        page_size = os.sysconf("SC_PAGE_SIZE")
        sequence = 0
        while True:
            time.sleep(max(0, previous_at + 5 - time.monotonic()))
            now = time.monotonic()
            cpu = cpu_ticks()
            vm = counters("/proc/vmstat")
            mem = counters("/proc/meminfo")
            delta = cpu[0] - previous_cpu[0]
            elapsed = now - previous_at
            if delta <= 0 or elapsed <= 0:
                raise ValueError("invalid counter interval")
            containers = inspect_containers()
            api = next(c for c in containers if c["name"] == "/spring-api")
            if not all(c["running"] and c["pid"] > 0 for c in containers):
                raise ValueError("container unavailable")
            application = read_application(api["pid"])
            # 조회 중 교체된 컨테이너에서 서로 다른 시점의 값을 섞지 않는다.
            if inspect_containers() != containers:
                raise ValueError("container changed during collection")
            sequence += 1
            sample = {
                "schema": 1, "sequence": sequence,
                "observedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "intervalSeconds": elapsed,
                "cpuPercent": 100 * (delta - (cpu[1] - previous_cpu[1])) / delta,
                "ioWaitPercent": 100 * (cpu[2] - previous_cpu[2]) / delta,
                "stealPercent": 100 * (cpu[3] - previous_cpu[3]) / delta,
                "memTotalBytes": mem["MemTotal"] * 1024,
                "memAvailableBytes": mem["MemAvailable"] * 1024,
                "swapUsedBytes": (mem["SwapTotal"] - mem["SwapFree"]) * 1024,
                "swapInBytesPerSecond": (vm["pswpin"] - previous_vm["pswpin"]) * page_size / elapsed,
                "swapOutBytesPerSecond": (vm["pswpout"] - previous_vm["pswpout"]) * page_size / elapsed,
                "oomKillCount": vm["oom_kill"],
                "containers": containers, "application": application,
            }
            if not all(math.isfinite(sample[key]) for key in (
                    "cpuPercent", "swapInBytesPerSecond", "swapOutBytesPerSecond")):
                raise ValueError("invalid sample")
            emit(sample)
            previous_cpu, previous_vm, previous_at = cpu, vm, now
    except BrokenPipeError:
        return 0
    except Exception:
        # SSH 끊김·sudo 거절·Docker/API 장애를 정상값으로 바꾸지 않는다.
        try:
            emit({"error": "RESOURCE_COLLECTION_FAILED"})
        except BrokenPipeError:
            pass
        return 1


if __name__ == "__main__":
    sys.exit(main())
