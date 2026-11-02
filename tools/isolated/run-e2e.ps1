# 임시 DB와 시험 JVM만 연결한다. 호스트 인증정보·설정·Docker 소켓은 전달하지 않는다.
[CmdletBinding()]
param([switch]$ReadPreflight, [switch]$Dataset10k, [switch]$Concurrent1000, [switch]$Concurrent500, [switch]$DiagnoseRead,
    [switch]$ProfileRead, [switch]$Support300)
$ErrorActionPreference = 'Stop'
if (([int]$ReadPreflight.IsPresent + [int]$Dataset10k.IsPresent + [int]$Concurrent1000.IsPresent + [int]$Concurrent500.IsPresent) -gt 1) { throw 'Choose one isolated read mode.' }
$concurrentMode = $Concurrent1000 -or $Concurrent500
if ($DiagnoseRead -and -not $Concurrent500) { throw 'Read diagnosis requires the isolated 500-user mode.' }
if ($ProfileRead -and (-not $Concurrent500 -or $DiagnoseRead)) { throw 'Read profiling requires only the isolated 500-user mode.' }
$probeRead = $DiagnoseRead -or $ProfileRead
$datasetMode = $Dataset10k -or $concurrentMode
$readMode = $ReadPreflight -or $datasetMode
if ($Support300 -and ($readMode -or $DiagnoseRead -or $ProfileRead)) { throw 'Support300 cannot be combined with read modes.' }
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
$resultsPath = $null

# PowerShell은 native 명령 실패를 자동으로 예외로 바꾸지 않으므로 종료 코드를 검사한다.
function Invoke-CheckedDocker {
    param([string[]]$DockerArguments)
    & docker @DockerArguments
    if ($LASTEXITCODE -ne 0) { throw 'Docker command failed; isolated E2E stopped.' }
}

# 보관할 결과에서 임시 암호와 k6 setup 세션을 제거한다. 해당 실행의 정해진 파일만 처리한다.
function Protect-DatasetResultArtifacts {
    param([string]$Folder)
    $allowedRoot = [IO.Path]::GetFullPath((Join-Path $taskRoot 'build/isolated-e2e-results'))
    $target = [IO.Path]::GetFullPath($Folder)
    if ([IO.Path]::GetDirectoryName($target) -ne $allowedRoot -or
        [IO.Path]::GetFileName($target) -notmatch '^memoryjar-e2e-[a-f0-9]{12}$') {
        throw 'Dataset artifact cleanup must stay in its dedicated result folder.'
    }
    foreach ($privateName in @('read-fixture.json', 'read-sessions.json')) {
        $manifestPath = Join-Path $target $privateName
        if (Test-Path -LiteralPath $manifestPath) { Remove-Item -LiteralPath $manifestPath -Force }
    }
    $found = $false
    foreach ($summaryName in @('read-summary.json', 'auth-summary.json', 'read-100-summary.json', 'read-300-summary.json', 'read-500-summary.json', 'read-1000-summary.json',
        'json-a1-summary.json', 'summary-b1-summary.json', 'summary-b2-summary.json', 'json-a2-summary.json', 'generator-c4-summary.json', 'generator-c2-summary.json',
        'server-c4-summary.json', 'server-c2-summary.json', 'pool-c20-summary.json', 'pool-c10-summary.json',
        'read-500-r1-summary.json', 'read-500-r2-summary.json', 'read-500-r3-summary.json')) {
        $summaryPath = Join-Path $target $summaryName
        if (-not (Test-Path -LiteralPath $summaryPath)) { continue }
        $loadSummary = Get-Content -LiteralPath $summaryPath -Raw | ConvertFrom-Json
        [IO.File]::WriteAllText($summaryPath, (@{ metrics = $loadSummary.metrics } | ConvertTo-Json -Depth 30),
            (New-Object Text.UTF8Encoding($false)))
        $found = $true
    }
    return $found
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
    if ($readMode) { $taskImages += $k6Image }
    foreach ($taskImage in $taskImages) {
        & docker image inspect $taskImage *> $null
        if ($LASTEXITCODE -ne 0) { Invoke-CheckedDocker -DockerArguments @('pull', $taskImage) }
    }
    $bundlePath = (Resolve-Path 'build/isolated-e2e-runtime').Path
    if (Test-Path (Join-Path $bundlePath 'resources/main/application-local.yml')) {
        throw 'Private local configuration must not enter the E2E bundle.'
    }
    $resultsPath = (New-Item -ItemType Directory -Force -Path "build/isolated-e2e-results/$taskId").FullName
    if ($ProfileRead) {
        # 작업 폴더의 소스와 실행한 클래스가 다를 수 있으므로 실제 복사할 빌드의 해시를 남긴다.
        $classHashes = @{}
        foreach ($relative in @('jwt/JwtTokenProvider.class', 'jwt/JwtAuthenticationFilter.class',
            'service/note/NoteService.class', 'repository/note/NoteRepository.class', 'repository/note/NoteListRow.class')) {
            $classPath = Join-Path $bundlePath "classes/main/shop/esjh/memoryjar/$relative"
            if (Test-Path -LiteralPath $classPath) { $classHashes[$relative] = (Get-FileHash -LiteralPath $classPath -Algorithm SHA256).Hash }
        }
        [IO.File]::WriteAllText((Join-Path $resultsPath 'service-class-hashes.json'), ($classHashes | ConvertTo-Json))
    }
    Invoke-CheckedDocker -DockerArguments @('network', 'create', '--internal', '--label', "memoryjar.isolated=$taskId", $networkName)
    $networkCreated = $true
    $internal = (& docker network inspect --format '{{.Internal}}' $networkName).Trim()
    if ($LASTEXITCODE -ne 0 -or $internal -ne 'true') { throw 'Network is not internal.' }
    # 폐기할 DB 전용 값이다. 호스트 포트 공개나 영구 데이터 볼륨은 만들지 않는다.
    $dbMemory = if ($datasetMode) { '768m' } else { '512m' }
    $dbTmpfs = if ($datasetMode) { '/var/lib/mysql:rw,size=512m' } else { '/var/lib/mysql:rw,size=384m' }
    $databaseProbeArgs = if ($probeRead) { @('--performance-schema=ON', '--performance-schema-digests-size=300',
        '--performance-schema-consumer-events-statements-current=ON') } else { @() }
    Invoke-CheckedDocker -DockerArguments (@('create', '--name', $databaseName, '--network', $networkName,
        '--network-alias', 'db', '--label', "memoryjar.isolated=$taskId", '--memory', $dbMemory,
        '--tmpfs', $dbTmpfs, '-e', 'MARIADB_ROOT_PASSWORD=isolated-root-only',
        '-e', 'MARIADB_DATABASE=isolated_e2e', '-e', 'MARIADB_USER=isolated', '-e', 'MARIADB_PASSWORD=isolated-test-only',
        '--health-cmd', 'healthcheck.sh --connect --innodb_initialized', '--health-interval', '2s', '--health-timeout', '3s', '--health-retries', '30', $databaseImage) + $databaseProbeArgs)
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
    $readArguments = if ($readMode) { @('--network-alias', 'app', '-e', 'ISOLATED_READ_PREFLIGHT=1') } else { @() }
    if ($datasetMode) { $readArguments += @('-e', 'ISOLATED_DATASET_10K=1') }
    # 500명도 인증 계정 1000개·저장 계정 1만 개를 준비해 이전 시험과 DB 규모를 맞춘다.
    if ($concurrentMode) { $readArguments += @('-e', 'ISOLATED_CONCURRENT_1000=1') }
    if ($probeRead) { $readArguments += @('-e', 'ISOLATED_READ_PROBE=1') }
    if ($Support300) { $readArguments += @('-e', 'ISOLATED_SUPPORT300=1') }
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
    if ($readMode) {
        Invoke-CheckedDocker -DockerArguments @('start', $runnerName)
        $readyWait = if ($concurrentMode) { 420 } elseif ($Dataset10k) { 300 } else { 120 }
        $readyDeadline = [DateTime]::UtcNow.AddSeconds($readyWait)
        while (-not (Test-Path (Join-Path $resultsPath 'read-ready'))) {
            $running = (& docker inspect --format '{{.State.Running}}' $runnerName).Trim()
            if ($LASTEXITCODE -ne 0 -or $running -ne 'true' -or [DateTime]::UtcNow -gt $readyDeadline) {
                throw 'Local read fixture did not become ready; inspect runner logs without exposing credentials.'
            }
            Start-Sleep -Milliseconds 300
        }
        $loadPath = (Resolve-Path 'tools/load').Path
        if ($concurrentMode) {
            $targetVus = if ($Concurrent500) { 500 } else { 1000 }
            & (Join-Path $PSScriptRoot 'invoke-concurrent-1000.ps1') -TaskId $taskId -ResultsPath $resultsPath -TargetVus $targetVus -DiagnoseRead:$DiagnoseRead -ProfileRead:$ProfileRead
            $trial = Get-Content (Join-Path $resultsPath 'concurrent-load.json') -Raw | ConvertFrom-Json
            $readExit = [int]$trial.exitCode
        } else {
        $loadScript = if ($Dataset10k) { '/load/read-dataset-10k.js' } else { '/load/read-local.js' }
        Invoke-CheckedDocker -DockerArguments @('create', '--name', $k6Name, '--network', $networkName,
            '--label', "memoryjar.isolated=$taskId", '--read-only', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--memory', '256m', '--cpus', '1',
            '--tmpfs', '/tmp:rw,size=32m,mode=1777', '--mount', "type=bind,source=$loadPath,target=/load,readonly",
            '--mount', "type=bind,source=$resultsPath,target=/results", '--workdir', '/load', $k6Image,
            'run', '--no-usage-report', '--out', 'json=/results/read-metrics.jsonl', '--summary-export', '/results/read-summary.json',
            '--env', 'FIXTURE_PATH=/results/read-fixture.json', '--env', 'BASE_URL=http://app:8080',
            '--env', 'ISOLATED_K6=1', $loadScript)
        $k6Created = $true
        if ($Dataset10k) {
            # 1만 동시 접속이 아니라 1/5/10 VU를 최대 80초 측정한다. 메모리·시간 상한에서 시험을 중단한다.
            Invoke-CheckedDocker -DockerArguments @('start', $k6Name)
            $samples = @()
            $loadDeadline = [DateTime]::UtcNow.AddSeconds(200)
            while ((& docker inspect --format '{{.State.Running}}' $k6Name).Trim() -eq 'true') {
                $memoryStop = $false
                $lines = & docker stats --no-stream --format '{{json .}}' $runnerName $databaseName $k6Name
                if ($LASTEXITCODE -ne 0) { throw 'Local resource sampling failed.' }
                foreach ($line in $lines) {
                    $sample = $line | ConvertFrom-Json
                    $samples += [pscustomobject]@{ timestampUtc = [DateTime]::UtcNow.ToString('o');
                        container = $sample.Name; cpuPercent = $sample.CPUPerc;
                        memoryUsage = $sample.MemUsage; memoryPercent = $sample.MemPerc }
                    $percent = [double]::Parse($sample.MemPerc.TrimEnd('%'), [Globalization.CultureInfo]::InvariantCulture)
                    if ($percent -ge 92) { $memoryStop = $true }
                }
                if ($memoryStop -or [DateTime]::UtcNow -gt $loadDeadline) {
                    & docker stop --time 2 $k6Name | Out-Null
                    break
                }
                Start-Sleep -Seconds 3
            }
            [IO.File]::WriteAllText((Join-Path $resultsPath 'dataset-resources.json'), ($samples | ConvertTo-Json -Depth 4))
            & docker logs $k6Name
        } else { & docker start -a $k6Name }
        $readExit = (& docker inspect --format '{{.State.ExitCode}}' $k6Name).Trim()
        if ($LASTEXITCODE -ne 0 -or $readExit -notmatch '^\d+$') { throw 'Cannot read k6 exit code.' }
        }
        # 완성된 JSON만 Java 검사기에 보이도록 임시 파일에서 이동한다.
        $completed = Join-Path $resultsPath 'read-completed.json'
        [IO.File]::WriteAllText("$completed.partial", "{`"exitCode`":$readExit}")
        Move-Item -LiteralPath "$completed.partial" -Destination $completed
        $finishWait = if ($datasetMode) { 90 } else { 30 }
        $finishDeadline = [DateTime]::UtcNow.AddSeconds($finishWait)
        while ((& docker inspect --format '{{.State.Running}}' $runnerName).Trim() -eq 'true') {
            if ([DateTime]::UtcNow -gt $finishDeadline) { throw 'Read verification did not finish.' }
            Start-Sleep -Milliseconds 300
        }
    } elseif ($Support300) {
        Invoke-CheckedDocker -DockerArguments @('start', $runnerName)
        $samples = @()
        $deadline = [DateTime]::UtcNow.AddMinutes(8)
        while ((& docker inspect --format '{{.State.Running}}' $runnerName).Trim() -eq 'true') {
            $lines = & docker stats --no-stream --format '{{json .}}' $runnerName $databaseName
            if ($LASTEXITCODE -ne 0) { throw 'Support resource sampling failed.' }
            foreach ($line in $lines) {
                $sample = $line | ConvertFrom-Json
                $samples += [pscustomobject]@{ timestampUtc = [DateTime]::UtcNow.ToString('o'); container = $sample.Name;
                    cpuPercent = $sample.CPUPerc; memoryUsage = $sample.MemUsage; memoryPercent = $sample.MemPerc }
            }
            if ([DateTime]::UtcNow -gt $deadline) { throw 'Support300 deadline exceeded.' }
            Start-Sleep -Seconds 2
        }
        [IO.File]::WriteAllText((Join-Path $resultsPath 'support-resources.json'), ($samples | ConvertTo-Json -Depth 4))
        & docker logs $runnerName
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
    if ($Support300 -and $resultsPath) {
        $remainingContainers = @(& docker ps -aq --filter "label=memoryjar.isolated=$taskId")
        $remainingNetworks = @(& docker network ls -q --filter "label=memoryjar.isolated=$taskId")
        [IO.File]::WriteAllText((Join-Path $resultsPath 'support-cleanup.json'),
            (@{ remainingContainers=$remainingContainers.Count; remainingNetworks=$remainingNetworks.Count } | ConvertTo-Json))
        if ($remainingContainers.Count -ne 0 -or $remainingNetworks.Count -ne 0) { throw 'Support test resources remain.' }
    }
    if ($datasetMode -and $resultsPath) {
        # 임시 암호 파일도 해당 실행 폴더의 한 파일만 제거한다. 원본 trace·기존 DB 파일은 건드리지 않는다.
        $manifestPath = Join-Path $resultsPath 'read-fixture.json'
        # 이 k6 버전의 summary-export에는 setup 세션이 포함된다. 최종 보관 파일은 숫자 metrics만 남긴다.
        $summarySanitized = Protect-DatasetResultArtifacts -Folder $resultsPath
        $containersLeft = @(& docker ps -aq --filter "label=memoryjar.isolated=$taskId")
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify local container cleanup.' }
        $networksLeft = @(& docker network ls -q --filter "label=memoryjar.isolated=$taskId")
        if ($LASTEXITCODE -ne 0) { throw 'Cannot verify local network cleanup.' }
        [IO.File]::WriteAllText((Join-Path $resultsPath 'dataset-cleanup.json'),
            (@{ remainingContainers = $containersLeft.Count; remainingNetworks = $networksLeft.Count;
                privateFixtureRemoved = -not (Test-Path -LiteralPath $manifestPath);
                privateSessionsRemoved = -not (Test-Path -LiteralPath (Join-Path $resultsPath 'read-sessions.json'));
                summaryMetricsOnly = $summarySanitized } | ConvertTo-Json))
        if ($containersLeft.Count -ne 0 -or $networksLeft.Count -ne 0) { throw 'Local dataset resources remain.' }
    }
    Pop-Location
}
