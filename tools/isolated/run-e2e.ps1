# 임시 DB와 시험 JVM만 연결한다. 호스트 인증정보·설정·Docker 소켓은 전달하지 않는다.
[CmdletBinding()]
param([switch]$ReadPreflight)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskId = 'memoryjar-e2e-' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$networkName = $taskId + '-net'
$databaseName = $taskId + '-db'
$runnerName = $taskId + '-runner'
$k6Name = $taskId + '-k6'
$k6Created = $false
$k6Image = 'grafana/k6:0.34.1'
$runtimeImage = 'eclipse-temurin:17-jdk'
$databaseImage = 'mariadb:10.11'
$networkCreated = $false
$databaseCreated = $false
$runnerCreated = $false

# PowerShell은 native 명령 실패를 자동으로 예외로 바꾸지 않으므로 종료 코드를 검사한다.
function Invoke-CheckedDocker {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker command failed; isolated E2E stopped.' }
}

Push-Location $taskRoot
try {
    $dockerContext = (& docker context show).Trim()
    if ($LASTEXITCODE -ne 0 -or $dockerContext -ne 'desktop-linux') {
        throw 'Only the local desktop-linux Docker context is allowed.'
    }
    & ./gradlew.bat isolatedE2eBundle --offline --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'E2E bundle build failed.' }
    # 이미지 다운로드만 격리 실행 전에 허용한다. 유료 API 요청이 아니다.
    $taskImages = @($runtimeImage, $databaseImage)
    if ($ReadPreflight) { $taskImages += $k6Image }
    foreach ($taskImage in $taskImages) {
        & docker image inspect $taskImage *> $null
        if ($LASTEXITCODE -ne 0) { Invoke-CheckedDocker -DockerArguments @('pull', $taskImage) }
    }
    $bundlePath = (Resolve-Path 'build/isolated-e2e-runtime').Path
    if (Test-Path (Join-Path $bundlePath 'resources/main/application-local.yml')) {
        throw 'Private local configuration must not enter the E2E bundle.'
    }
    $resultsPath = (New-Item -ItemType Directory -Force -Path "build/isolated-e2e-results/$taskId").FullName
    Invoke-CheckedDocker -DockerArguments @('network', 'create', '--internal', '--label', "memoryjar.isolated=$taskId", $networkName)
    $networkCreated = $true
    $internal = (& docker network inspect --format '{{.Internal}}' $networkName).Trim()
    if ($LASTEXITCODE -ne 0 -or $internal -ne 'true') { throw 'Network is not internal.' }
    # 폐기할 DB 전용 값이다. 호스트 포트 공개나 영구 데이터 볼륨은 만들지 않는다.
    Invoke-CheckedDocker -DockerArguments @('create', '--name', $databaseName, '--network', $networkName,
        '--network-alias', 'db', '--label', "memoryjar.isolated=$taskId", '--memory', '512m',
        '--tmpfs', '/var/lib/mysql:rw,size=384m', '-e', 'MARIADB_ROOT_PASSWORD=isolated-root-only',
        '-e', 'MARIADB_DATABASE=isolated_e2e', '-e', 'MARIADB_USER=isolated', '-e', 'MARIADB_PASSWORD=isolated-test-only',
        '--health-cmd', 'healthcheck.sh --connect --innodb_initialized', '--health-interval', '2s', '--health-timeout', '3s', '--health-retries', '30', $databaseImage)
    $databaseCreated = $true
    Invoke-CheckedDocker -DockerArguments @('start', $databaseName)
    $deadline = [DateTime]::UtcNow.AddSeconds(90)
    do {
        $health = (& docker inspect --format '{{.State.Health.Status}}' $databaseName).Trim()
        if ($LASTEXITCODE -ne 0 -or $health -eq 'unhealthy') { throw 'Disposable DB did not become healthy.' }
        if ($health -eq 'healthy') { break }
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Disposable DB readiness deadline exceeded.' }
        Start-Sleep -Milliseconds 500
    } while ($true)
    # 조회 시험도 호스트 포트를 열지 않는다. 같은 internal 네트워크의 k6만 접근한다.
    $readArguments = if ($ReadPreflight) { @('--network-alias', 'app', '-e', 'ISOLATED_READ_PREFLIGHT=1') } else { @() }
    Invoke-CheckedDocker -DockerArguments (@('create', '--name', $runnerName, '--network', $networkName,
        '--label', "memoryjar.isolated=$taskId", '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--user', '1000:1000', '--memory', '1536m', '--cpus', '2', '--tmpfs', '/tmp:rw,size=512m,mode=1777',
        '--mount', "type=bind,source=$bundlePath,target=/suite,readonly", '--mount', "type=bind,source=$resultsPath,target=/results",
        '-e', 'ISOLATED_E2E=1', '-e', 'SPRING_PROFILES_ACTIVE=test', '-e', 'AWS_EC2_METADATA_DISABLED=true',
        '-e', 'SPRING_DATASOURCE_URL=jdbc:mariadb://db:3306/isolated_e2e',
        '-e', 'SPRING_DATASOURCE_USERNAME=isolated', '-e', 'SPRING_DATASOURCE_PASSWORD=isolated-test-only') + $readArguments + @(
        # Windows bind mount의 반복 JAR 조회 지연을 줄인다. 복사본도 종료 시 사라지는 tmpfs에만 둔다.
        $runtimeImage, 'sh', '-c', 'cp -R /suite /tmp/runtime && exec java -Xmx768m -cp "/tmp/runtime/classes/main:/tmp/runtime/classes/test:/tmp/runtime/resources/main:/tmp/runtime/resources/test:/tmp/runtime/lib/*" shop.esjh.memoryjar.isolated.IsolatedE2eLauncher'))
    $runnerCreated = $true
    $networkCount = (& docker inspect --format '{{len .NetworkSettings.Networks}}' $runnerName).Trim()
    if ($LASTEXITCODE -ne 0 -or $networkCount -ne '1') { throw 'Runner must have exactly one isolated network.' }
    if ($ReadPreflight) {
        Invoke-CheckedDocker -DockerArguments @('start', $runnerName)
        $readyDeadline = [DateTime]::UtcNow.AddSeconds(120)
        while (-not (Test-Path (Join-Path $resultsPath 'read-ready'))) {
            $running = (& docker inspect --format '{{.State.Running}}' $runnerName).Trim()
            if ($LASTEXITCODE -ne 0 -or $running -ne 'true' -or [DateTime]::UtcNow -gt $readyDeadline) {
                throw 'Local read fixture did not become ready; inspect runner logs without exposing credentials.'
            }
            Start-Sleep -Milliseconds 300
        }
        $loadPath = (Resolve-Path 'tools/load').Path
        Invoke-CheckedDocker -DockerArguments @('create', '--name', $k6Name, '--network', $networkName,
            '--label', "memoryjar.isolated=$taskId", '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--memory', '256m', '--cpus', '1',
            '--tmpfs', '/tmp:rw,size=32m,mode=1777', '--mount', "type=bind,source=$loadPath,target=/load,readonly",
            '--mount', "type=bind,source=$resultsPath,target=/results", '--workdir', '/load', $k6Image,
            'run', '--no-usage-report', '--out', 'json=/results/read-metrics.jsonl', '--summary-export', '/results/read-summary.json',
            '--env', 'FIXTURE_PATH=/results/read-fixture.json', '--env', 'BASE_URL=http://app:8080',
            '--env', 'ISOLATED_K6=1', '/load/read-local.js')
        $k6Created = $true
        & docker start -a $k6Name
        $readExit = (& docker inspect --format '{{.State.ExitCode}}' $k6Name).Trim()
        if ($LASTEXITCODE -ne 0 -or $readExit -notmatch '^\d+$') { throw 'Cannot read k6 exit code.' }
        # 완성된 JSON만 Java 검사기에 보이도록 임시 파일에서 이동한다.
        $completed = Join-Path $resultsPath 'read-completed.json'
        [IO.File]::WriteAllText("$completed.partial", "{`"exitCode`":$readExit}")
        Move-Item -LiteralPath "$completed.partial" -Destination $completed
        $finishDeadline = [DateTime]::UtcNow.AddSeconds(30)
        while ((& docker inspect --format '{{.State.Running}}' $runnerName).Trim() -eq 'true') {
            if ([DateTime]::UtcNow -gt $finishDeadline) { throw 'Read verification did not finish.' }
            Start-Sleep -Milliseconds 300
        }
    } else {
        & docker start -a $runnerName
    }
    $runExit = (& docker inspect --format '{{.State.ExitCode}}' $runnerName).Trim()
    if ($LASTEXITCODE -ne 0 -or $runExit -ne '0') { throw "Isolated E2E failed; inspect $resultsPath/summary.txt" }
    Write-Output "Isolated E2E passed. Results: $resultsPath/summary.txt"
} finally {
    # 이 실행에서 만든 GUID 이름만 정리하며 기존 컨테이너·네트워크는 보존한다.
    if ($k6Created) { & docker rm -f $k6Name | Out-Null }
    if ($runnerCreated) { & docker rm -f $runnerName | Out-Null }
    if ($databaseCreated) { & docker rm -f $databaseName | Out-Null }
    if ($networkCreated) { & docker network rm $networkName | Out-Null }
    Pop-Location
}
