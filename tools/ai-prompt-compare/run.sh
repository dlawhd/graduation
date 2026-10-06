#!/usr/bin/env bash
# 서비스 재시작 없이 기존 API 컨테이너에서 별도 Java 프로세스를 실행한다.
# 환경변수는 컨테이너 안에서 읽으며 docker inspect/env 출력은 하지 않는다.
set -euo pipefail
umask 077

tool_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
compose_file=/home/ubuntu/deploy/docker-compose.prod.yml
tool_jar="$tool_dir/memoryjar-ai-prompt-compare.jar"
state_dir="$tool_dir/private-results"
mode=${1:-}

if [[ "$mode" != prepare && "$mode" != run ]]; then
  printf '%s\n' '사용법: bash run.sh prepare 또는 bash run.sh run'
  exit 2
fi
if [[ ! -f "$tool_jar" || ! -f "$compose_file" ]]; then
  printf '%s\n' '비교 JAR 또는 운영 Compose 파일이 없습니다. 경로를 확인해 주세요.'
  exit 2
fi
api_id=$(docker compose -f "$compose_file" ps -q api)
if [[ -z "$api_id" || "$api_id" == *$'\n'* ]]; then
  printf '%s\n' '실행 중인 API 컨테이너가 정확히 한 개여야 합니다.'
  exit 2
fi

if [[ "$mode" == prepare ]]; then
  # 기존 결과/일회 실행 표시를 덮어쓰지 않는다. 재실행은 새 호출 승인을 받은 뒤 새 폴더에서 한다.
  mkdir -m 700 -- "$state_dir"
  docker exec "$api_id" test -r /app/app.jar
  container_dir=$(docker exec "$api_id" sh -c 'umask 077; mktemp -d /tmp/memoryjar-ai-compare.XXXXXXXX')
  if [[ ! "$container_dir" =~ ^/tmp/memoryjar-ai-compare\.[A-Za-z0-9]{8}$ ]]; then
    printf '%s\n' '컨테이너 임시 경로 검증에 실패했습니다.'
    exit 2
  fi
  printf '%s' "$api_id" > "$state_dir/container-id"
  printf '%s' "$container_dir" > "$state_dir/container-dir"
  docker exec "$api_id" sha256sum /app/app.jar > "$state_dir/app-jar.sha256"
  sha256sum "$tool_jar" > "$state_dir/tool-jar.sha256"
  docker cp "$tool_jar" "$api_id:$container_dir/tool.jar"
  docker exec "$api_id" chmod 600 "$container_dir/tool.jar"
else
  if [[ ! -d "$state_dir" || -L "$state_dir" || $(stat -c '%a' "$state_dir") != 700 ]]; then
    printf '%s\n' '사전 점검 결과 폴더가 없거나 권한이 올바르지 않습니다.'
    exit 2
  fi
  recorded_api=$(< "$state_dir/container-id")
  container_dir=$(< "$state_dir/container-dir")
  if [[ "$recorded_api" != "$api_id" || ! "$container_dir" =~ ^/tmp/memoryjar-ai-compare\.[A-Za-z0-9]{8}$ ]]; then
    printf '%s\n' '사전 점검 이후 컨테이너가 변경됐습니다. AI를 호출하지 않았습니다.'
    exit 2
  fi
  current_app=$(docker exec "$api_id" sha256sum /app/app.jar)
  if [[ "$current_app" != "$(< "$state_dir/app-jar.sha256")" ]]; then
    printf '%s\n' '배포 JAR가 변경됐습니다. AI를 호출하지 않았습니다.'
    exit 2
  fi
  sha256sum --status -c "$state_dir/tool-jar.sha256"
  # 두 터미널에서 실행해도 한 번만 접수한다. 실패 후에도 지우지 않는다.
  mkdir -m 700 -- "$state_dir/run-once"
fi

# Boot Loader로 기존 라이브러리와 클래스만 읽는다. SpringApplication은 호출하지 않는다.
# 일반 SDK/드라이버 로거는 도구의 main에서 끄므로 비밀값/오류 원문이 터미널에 나오지 않는다.
exit_status=0
docker exec "$api_id" java -Xmx256m -Djava.awt.headless=true -Duser.timezone=Asia/Seoul \
  "-Dloader.path=$container_dir/tool.jar" \
  -Dloader.main=shop.esjh.memoryjar.service.ai.AiPromptComparisonTool \
  -cp /app/app.jar org.springframework.boot.loader.launch.PropertiesLauncher \
  "$mode" "$container_dir/results" || exit_status=$?

if docker exec "$api_id" test -d "$container_dir/results"; then
  # 성공/실패 파일 모두 private 폴더 안으로만 회수한다. 원문 폴더를 통째로 공유하면 안 된다.
  copy_dir=$(mktemp -d "$state_dir/copy.XXXXXXXX")
  docker cp "$api_id:$container_dir/results/." "$copy_dir/"
  chmod -R go-rwx -- "$copy_dir"
  printf '결과 보관: %s\n' "$copy_dir"
fi
if [[ "$mode" == prepare && "$exit_status" == 0 ]]; then
  printf '%s\n' '사전 점검 완료: AI 호출 0회. 다음 명령은 총 최대 4회 생성 사용량이 발생합니다.'
fi
exit "$exit_status"
