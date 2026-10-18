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


def process_snapshot(container):
    """본문·실행 인자·환경변수 대신 고정한 API/DB 프로세스의 메모리·페이지 폴트만 읽는다."""
    root = pathlib.Path('/proc') / str(container['pid'])
    # comm에는 공백/괄호가 있을 수 있으므로 마지막 닫는 괄호 뒤의 stat 필드를 사용한다.
    fields = (root / 'stat').read_text().rsplit(')', 1)[1].split()
    values = {}
    process_name = None
    for line in (root / 'status').read_text().splitlines():
        key, _, value = line.partition(':')
        if key == 'Name':
            process_name = value.strip()
        if key in ('VmRSS', 'VmSwap'):
            parts = value.split()
            if len(parts) != 2 or parts[1] != 'kB':
                raise ValueError('unsupported process memory unit')
            values[key] = int(parts[0]) * 1024
    if set(values) != {'VmRSS', 'VmSwap'}:
        raise ValueError('process memory unavailable')
    expected = {'/spring-api': ('java',), '/mariadb': ('mariadbd', 'mysqld')}
    if process_name not in expected.get(container['name'], ()):
        # 나중에 init/shell 래퍼가 추가돼도 Java/DB 대신 래퍼를 계측한 것으로 오해하지 않는다.
        raise ValueError('container main process is not the expected service')
    return {'name': container['name'], 'pid': container['pid'], 'startTimeTicks': int(fields[19]),
            'minorFaults': int(fields[7]), 'majorFaults': int(fields[9]),
            'rssBytes': values['VmRSS'], 'swapBytes': values['VmSwap']}


def process_deltas(previous, current, elapsed):
    """프로세스 교체·카운터 초기화는 정상 0으로 숨기지 않는다. major fault는 swap 전용 카운터가 아니다."""
    before = {p['name']: p for p in previous}
    result = []
    if elapsed <= 0 or len(before) != len(current):
        raise ValueError('invalid process interval')
    for now in current:
        old = before[now['name']]
        if (old['pid'], old['startTimeTicks']) != (now['pid'], now['startTimeTicks']):
            raise ValueError('process replaced during collection')
        item = dict(now)
        for key in ('minorFaults', 'majorFaults'):
            delta = now[key] - old[key]
            if delta < 0:
                raise ValueError('process counter reset')
            item[key + 'Delta'] = delta
            item[key + 'PerSecond'] = delta / elapsed
        result.append(item)
    return result


def gc_delta(previous, current):
    """구버전 서버·미지원 GC는 미측정으로 남긴다. GC 시간은 JVM 전체의 누적 작업 시간이다."""
    unknown = {'available': False, 'count': None, 'timeMillis': None}
    a, b = previous.get('gc', {}), current.get('gc', {})
    if not isinstance(a, dict) or not isinstance(b, dict):
        return unknown
    keys = ('totalCollectionCount', 'totalCollectionTimeMillis')
    if any(type(value.get(key)) is not int or value[key] < 0 for value in (a, b) for key in keys):
        return unknown
    values = [b[key] - a[key] for key in keys]
    if any(value < 0 for value in values):
        raise ValueError('GC counter reset')
    return {'available': True, 'count': values[0], 'timeMillis': values[1]}


def emit(value):
    print(json.dumps(value, separators=(",", ":"), allow_nan=False), flush=True)


def main():
    """첫 CPU 표본은 준비에만 쓰고, 이후 구간 평균을 5초 주기로 전송한다."""
    try:
        previous_cpu = cpu_ticks()
        previous_vm = counters("/proc/vmstat")
        previous_at = time.monotonic()
        page_size = os.sysconf("SC_PAGE_SIZE")
        baseline_containers = inspect_containers()
        previous_processes = [process_snapshot(c) for c in baseline_containers]
        previous_application = read_application(next(c['pid'] for c in baseline_containers if c['name'] == '/spring-api'))
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
            processes = [process_snapshot(c) for c in containers]
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
                "processes": process_deltas(previous_processes, processes, elapsed),
                "gcDelta": gc_delta(previous_application, application),
            }
            if not all(math.isfinite(sample[key]) for key in (
                    "cpuPercent", "swapInBytesPerSecond", "swapOutBytesPerSecond")):
                raise ValueError("invalid sample")
            emit(sample)
            previous_cpu, previous_vm, previous_at = cpu, vm, now
            previous_processes, previous_application = processes, application
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
