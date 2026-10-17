#!/usr/bin/env bash
# SSH로 접속한 EC2 호스트에서 실행한다. 지표 수집 실패는 0%가 아니라 실패 종료로 알린다.
set -euo pipefail
for tool in docker nsenter curl python3; do
  command -v "$tool" >/dev/null || { printf '%s is required\n' "$tool" >&2; exit 1; }
done
container_pid=$(docker inspect --format '{{.State.Pid}}' spring-api)
[[ "$container_pid" =~ ^[1-9][0-9]*$ ]] || { echo 'spring-api is not running' >&2; exit 1; }

# 호스트 curl을 컨테이너 네트워크 안에서만 실행한다. 포트 공개·설치·재시작은 없다.
# -n으로 sudo 암호 입력 대기를 막고 proxy를 무시해 내부 지표를 외부로 보내지 않는다.
sudo -n nsenter --target "$container_pid" --net -- \
  curl --noproxy '*' --fail --silent --show-error --max-time 3 \
  http://127.0.0.1:9091/actuator/resources |
python3 -c '
import json, math, sys
data = json.load(sys.stdin)
def number(value):
    return type(value) in (int, float) and math.isfinite(value)
heap = data.get("heap", {})
pools = data.get("pools", [])
if data.get("measurable") is not True or not pools:
    raise SystemExit("Resource snapshot is not measurable; do not treat it as zero usage")
if not number(heap.get("maxBytes")) or heap["maxBytes"] <= 0 or not number(heap.get("usedBytes")) or heap["usedBytes"] < 0:
    raise SystemExit("Invalid heap counters")
for pool in pools:
    if pool.get("initialized") is not True or not number(pool.get("maxConnections")) or pool["maxConnections"] <= 0:
        raise SystemExit("Invalid pool capacity")
    for key in ("activeConnections", "idleConnections", "totalConnections", "pendingRequests"):
        if not number(pool.get(key)) or pool[key] < 0:
            raise SystemExit("Invalid pool counters")
print(json.dumps(data, separators=(",", ":")))
'
