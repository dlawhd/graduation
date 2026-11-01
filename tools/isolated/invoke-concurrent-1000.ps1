# run-e2e.ps1이 만든 임시 internal 네트워크에서만 인증 준비와 100→300→선택한 최종 인원 조회를 실행한다.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$TaskId, [Parameter(Mandatory)][string]$ResultsPath,
    [ValidateSet(500, 1000)][int]$TargetVus = 1000, [switch]$DiagnoseRead, [switch]$ProfileRead)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$allowed = [IO.Path]::GetFullPath((Join-Path $taskRoot 'build/isolated-e2e-results'))
$target = [IO.Path]::GetFullPath($ResultsPath)
if ($TaskId -notmatch '^memoryjar-e2e-[a-f0-9]{12}$' -or [IO.Path]::GetDirectoryName($target) -ne $allowed -or
    [IO.Path]::GetFileName($target) -ne $TaskId) { throw 'Dedicated concurrent result folder required.' }
$network = "$TaskId-net"
if ((& docker context show).Trim() -ne 'desktop-linux') { throw 'Local Docker context required.' }
$guard = & docker network inspect --format '{{.Internal}} {{index .Labels "memoryjar.isolated"}}' $network
if ($LASTEXITCODE -ne 0 -or $guard.Trim() -ne "true $TaskId") { throw 'Existing isolated trial network required.' }
$loadPath = (Resolve-Path (Join-Path $taskRoot 'tools/load')).Path
$samples = [Collections.Generic.List[object]]::new()
$phases = [Collections.Generic.List[object]]::new()
$sessionPath = Join-Path $target 'read-sessions.json'
$created = [Collections.Generic.List[string]]::new()
$overall = 1
$hadThresholdFailure = $false
$probeCommandSequence = 0
$experiments = @(
    @{ phase = 'json-a1'; detailedMetrics = $true; generatorCpu = 2 },
    @{ phase = 'summary-b1'; detailedMetrics = $false; generatorCpu = 2 },
    @{ phase = 'summary-b2'; detailedMetrics = $false; generatorCpu = 2 },
    @{ phase = 'json-a2'; detailedMetrics = $true; generatorCpu = 2 },
    @{ phase = 'generator-c4'; detailedMetrics = $false; generatorCpu = 4 },
    @{ phase = 'generator-c2'; detailedMetrics = $false; generatorCpu = 2 },
    @{ phase = 'server-c4'; detailedMetrics = $false; generatorCpu = 4; serverCpu = 4 },
    @{ phase = 'server-c2'; detailedMetrics = $false; generatorCpu = 4; serverCpu = 2 },
    @{ phase = 'pool-c20'; detailedMetrics = $false; generatorCpu = 4; serverCpu = 2; poolSize = 20 },
    @{ phase = 'pool-c10'; detailedMetrics = $false; generatorCpu = 4; serverCpu = 2; poolSize = 10 })
if ($DiagnoseRead -and $TargetVus -ne 500) { throw 'Diagnosis is scoped to 500 users.' }
if ($ProfileRead -and ($TargetVus -ne 500 -or $DiagnoseRead)) { throw 'Profiling is scoped to 500 users without resource experiments.' }
$probeRead = $DiagnoseRead -or $ProfileRead
if ($ProfileRead) {
    # 코드 전후 비교는 자원 조건을 바꾸지 않고 같은 500명 단계를 세 번 관측한다.
    $experiments = @(1..3 | ForEach-Object { @{ phase = "read-500-r$_"; detailedMetrics = $false; generatorCpu = 4 } })
}

# 앱 내부 관찰기가 JFR를 시작·종료했다는 응답을 받은 뒤 부하 단계를 진행한다.
function Set-ProbePhase {
    param([string]$Phase, [bool]$Active, [int]$PoolSize = 10)
    $script:probeCommandSequence++
    $file = Join-Path $target ('probe-command-{0:D5}.json' -f $probeCommandSequence)
    [IO.File]::WriteAllText("$file.partial", (@{ phase = $Phase; active = $Active; poolSize = $PoolSize } | ConvertTo-Json))
    Move-Item -LiteralPath "$file.partial" -Destination $file
    $until = [DateTime]::UtcNow.AddSeconds(40)
    do {
        if (Test-Path -LiteralPath (Join-Path $target 'probe-error.json')) { throw 'Read probe reported a collection failure.' }
        $statePath = Join-Path $target ('probe-ack-{0:D5}.json' -f $probeCommandSequence)
        if (Test-Path -LiteralPath $statePath) {
            $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if ($state.phase -eq $Phase -and $state.active -eq $Active) { return }
        }
        if ([DateTime]::UtcNow -gt $until) { throw 'Read probe did not acknowledge phase.' }
        Start-Sleep -Milliseconds 250
    } while ($true)
}

# 운영 쿼리나 원문 파라미터 대신 이 임시 DB의 정규화된 SQL 집계와 숫자 상태만 보관한다.
function Save-DatabaseSnapshot {
    param([string]$Phase, [string]$Point)
    $sql = @"
SELECT JSON_OBJECT('digest',DIGEST,'sql',DIGEST_TEXT,'count',COUNT_STAR,'timerPs',SUM_TIMER_WAIT,
 'lockPs',SUM_LOCK_TIME,'rowsExamined',SUM_ROWS_EXAMINED,'rowsSent',SUM_ROWS_SENT,
 'noIndex',SUM_NO_INDEX_USED,'tmpDisk',SUM_CREATED_TMP_DISK_TABLES)
 FROM performance_schema.events_statements_summary_by_digest WHERE SCHEMA_NAME='isolated_e2e'
 AND DIGEST_TEXT NOT LIKE '%performance_schema%' AND DIGEST_TEXT NOT LIKE '%GLOBAL_STATUS%' ORDER BY COUNT_STAR DESC LIMIT 100;
"@
    $lines = & docker exec "$TaskId-db" mariadb -uroot -pisolated-root-only --batch --raw --skip-column-names isolated_e2e -e $sql
    if ($LASTEXITCODE -ne 0) { throw 'Database digest snapshot failed.' }
    $digests = @($lines | ForEach-Object { $_ | ConvertFrom-Json })
    if ($digests.Count -eq 0) { throw 'Database statement collection is not measurable.' }
    $statusSql = "SELECT JSON_OBJECT('name',VARIABLE_NAME,'value',VARIABLE_VALUE) FROM information_schema.GLOBAL_STATUS WHERE VARIABLE_NAME IN ('THREADS_RUNNING','THREADS_CONNECTED','SLOW_QUERIES','INNODB_ROW_LOCK_TIME','INNODB_ROW_LOCK_WAITS','INNODB_BUFFER_POOL_READS','INNODB_BUFFER_POOL_READ_REQUESTS','CREATED_TMP_DISK_TABLES','TABLE_LOCKS_WAITED','COM_SELECT','QUESTIONS','MAX_USED_CONNECTIONS');"
    $statusLines = & docker exec "$TaskId-db" mariadb -uroot -pisolated-root-only --batch --raw --skip-column-names isolated_e2e -e $statusSql
    if ($LASTEXITCODE -ne 0) { throw 'Database status snapshot failed.' }
    [IO.File]::WriteAllText((Join-Path $target "db-$Phase-$Point.json"),
        (@{ observedAt = [DateTime]::UtcNow.ToString('o'); digests = $digests;
            status = @($statusLines | ForEach-Object { $_ | ConvertFrom-Json }) } | ConvertTo-Json -Depth 8))
}

# 직접 만든 컨테이너만 시작하고, 준비·부하 중에도 시간과 메모리 상한을 검사한다.
function Invoke-ConcurrentPhase {
    # 일반 비교는 요약 출력·발생기 4 CPU로 고정한다. 진단의 과거 조건은 아래 명시 인수로 재현한다.
    param([string]$Phase, [int]$Vus, [int]$DeadlineSeconds, [bool]$DetailedMetrics = $false,
        [ValidateSet(2,4)][int]$GeneratorCpu = 4, [switch]$AllowThresholdFailure,
        [ValidateSet(2,4)][int]$ServerCpu = 2, [ValidateSet(10,20)][int]$PoolSize = 10)
    $name = "$TaskId-$Phase"
    $summary = "$Phase-summary.json"
    $script = if ($Vus -eq 0) { '/load/prepare-concurrent-1000.js' } else { '/load/read-concurrent-1000.js' }
    $arguments = @('create', '--name', $name, '--network', $network, '--label', "memoryjar.isolated=$TaskId",
        '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '1000:1000',
        '--memory', '2048m', '--cpus', "$GeneratorCpu", '--pids-limit', '2048', '--tmpfs', '/tmp:rw,size=32m,mode=1777',
        '--mount', "type=bind,source=$loadPath,target=/load,readonly", '--mount', "type=bind,source=$target,target=/results",
        '--workdir', '/load', 'grafana/k6:0.34.1', 'run', '--no-usage-report')
    if ($DetailedMetrics) { $arguments += @('--out', "json=/results/$Phase-metrics.jsonl") }
    $arguments += @('--summary-export', "/results/$summary",
        '--env', 'BASE_URL=http://app:8080', '--env', 'ISOLATED_K6=1',
        '--env', 'FIXTURE_PATH=/results/read-fixture.json', '--env', 'SESSIONS_PATH=/results/read-sessions.json',
        '--env', "CONCURRENT_VUS=$Vus", $script)
    & docker @arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent load container creation failed.' }
    $created.Add($name)
    if ($probeRead -and $Vus -gt 0) {
        & docker update --cpus "$ServerCpu" "$TaskId-runner" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Isolated server CPU control failed.' }
        Set-ProbePhase -Phase $Phase -Active $true -PoolSize $PoolSize
        Save-DatabaseSnapshot -Phase $Phase -Point 'before'
    }
    $start = [DateTime]::UtcNow
    & docker start $name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent load start failed.' }
    $reason = $null
    while ((& docker inspect --format '{{.State.Running}}' $name).Trim() -eq 'true') {
        if ($LASTEXITCODE -ne 0) { throw 'Concurrent load state unavailable.' }
        $lines = & docker stats --no-stream --format '{{json .}}' "$TaskId-runner" "$TaskId-db" $name
        if ($LASTEXITCODE -ne 0) { throw 'Concurrent resource sampling failed.' }
        foreach ($line in $lines) {
            $row = $line | ConvertFrom-Json
            $samples.Add([pscustomobject]@{ phase = $Phase; timestampUtc = [DateTime]::UtcNow.ToString('o');
                container = $row.Name; cpuPercent = $row.CPUPerc; memoryUsage = $row.MemUsage; memoryPercent = $row.MemPerc })
            if ([double]::Parse($row.MemPerc.TrimEnd('%'), [Globalization.CultureInfo]::InvariantCulture) -ge 92) {
                $reason = 'container_memory_92_percent'
            }
        }
        $freeKiB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
        if ($freeKiB -lt 786432) { $reason = 'host_free_memory_below_768_mib' }
        if (([DateTime]::UtcNow - $start).TotalSeconds -gt $DeadlineSeconds) { $reason = 'phase_deadline' }
        if ($reason) { & docker stop --time 2 $name | Out-Null; break }
        Start-Sleep -Seconds 3
    }
    & docker logs $name
    if ($probeRead -and $Vus -gt 0) {
        # 중단 시 남은 서버 요청도 정리할 시간을 주고 관측을 종료한다.
        Start-Sleep -Seconds 3
        Save-DatabaseSnapshot -Phase $Phase -Point 'after'
        Set-ProbePhase -Phase $Phase -Active $false
    }
    $state = (& docker inspect --format '{{json .State}}' $name) | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Concurrent exit status unavailable.' }
    $passed = $state.ExitCode -eq 0 -and -not $state.OOMKilled -and -not $reason
    $phases.Add([pscustomobject]@{ phase = $Phase; targetVus = $Vus; startedAtUtc = $start.ToString('o');
        finishedAtUtc = [DateTime]::UtcNow.ToString('o'); exitCode = $state.ExitCode;
        oomKilled = $state.OOMKilled; stopReason = $reason; passed = $passed;
        detailedMetrics = $DetailedMetrics; generatorCpu = $GeneratorCpu; serverCpu = $ServerCpu; poolSize = $PoolSize })
    # 다음 단계가 이전 VU 메모리를 함께 소비하지 않도록 프로세스를 제거한 뒤 진행한다.
    & docker rm $name | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Completed concurrent container cleanup failed.' }
    if (-not $passed) {
        if ($AllowThresholdFailure -and $state.ExitCode -eq 99 -and -not $state.OOMKilled -and -not $reason) {
            $numbers = (Get-Content (Join-Path $target $summary) -Raw | ConvertFrom-Json).metrics
            if ($numbers.read_errors.value -lt 0.01) {
                $script:hadThresholdFailure = $true
                Write-Warning "Latency threshold failure recorded for $Phase; bounded diagnostic comparisons continue."
                return
            }
        }
        throw "Concurrent phase $Phase did not pass; later stages were not run."
    }
}

try {
    Invoke-ConcurrentPhase -Phase 'auth' -Vus 0 -DeadlineSeconds 540
    $authPath = Join-Path $target 'auth-summary.json'
    $auth = Get-Content -LiteralPath $authPath -Raw | ConvertFrom-Json
    if (@($auth.setup_data).Count -ne 1000) { throw 'Exactly 1000 authenticated sessions required.' }
    # k6의 setup 반환값을 SharedArray 입력으로 옮겨 1000 VU마다 전체 세션 복사본이 생기지 않게 한다.
    [IO.File]::WriteAllText($sessionPath, (ConvertTo-Json -InputObject @($auth.setup_data) -Depth 10),
        (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText($authPath, (@{ metrics = $auth.metrics } | ConvertTo-Json -Depth 30),
        (New-Object Text.UTF8Encoding($false)))
    $auth = $null
    $warmupStages = if ($probeRead) { @(100, 300) } else { @(100, 300, $TargetVus) }
    foreach ($vus in $warmupStages) {
        Invoke-ConcurrentPhase -Phase "read-$vus" -Vus $vus -DeadlineSeconds 180 -AllowThresholdFailure:$DiagnoseRead
        Start-Sleep -Seconds 5
    }
    if ($probeRead) {
        foreach ($experiment in $experiments) {
            $serverCpu = if ($experiment.ContainsKey('serverCpu')) { $experiment.serverCpu } else { 2 }
            $poolSize = if ($experiment.ContainsKey('poolSize')) { $experiment.poolSize } else { 10 }
            Invoke-ConcurrentPhase -Phase $experiment.phase -Vus 500 -DeadlineSeconds 180 `
                -DetailedMetrics $experiment.detailedMetrics -GeneratorCpu $experiment.generatorCpu `
                -ServerCpu $serverCpu -PoolSize $poolSize -AllowThresholdFailure
            Start-Sleep -Seconds 5
        }
    }
    $overall = if ($hadThresholdFailure) { 1 } else { 0 }
} catch {
    # 실패한 단계도 JSON·JUnit에 남기고, SQL 정리 검증은 부모 실행기가 계속 수행하게 한다.
    Write-Warning $_.Exception.Message
} finally {
    if ($probeRead) {
        & docker update --cpus 2 "$TaskId-runner" | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Isolated CPU reset could not be confirmed; parent cleanup still removes the runner.' }
    }
    foreach ($name in $created) {
        & docker container inspect $name *> $null
        if ($LASTEXITCODE -eq 0) { & docker rm -f $name | Out-Null }
    }
    if (Test-Path -LiteralPath $sessionPath) { Remove-Item -LiteralPath $sessionPath -Force }
    $authPath = Join-Path $target 'auth-summary.json'
    if (Test-Path -LiteralPath $authPath) {
        $auth = Get-Content -LiteralPath $authPath -Raw | ConvertFrom-Json
        [IO.File]::WriteAllText($authPath, (@{ metrics = $auth.metrics } | ConvertTo-Json -Depth 30),
            (New-Object Text.UTF8Encoding($false)))
    }
    [IO.File]::WriteAllText((Join-Path $target 'concurrent-resources.json'), (ConvertTo-Json -InputObject @($samples.ToArray()) -Depth 5))
    [IO.File]::WriteAllText((Join-Path $target 'concurrent-load.json'),
        (@{ exitCode = $overall; targetVus = $TargetVus; plannedStages = @(100, 300, $TargetVus);
            diagnostic = $DiagnoseRead.IsPresent; profiling = $ProfileRead.IsPresent;
            experiments = $(if ($probeRead) { $experiments } else { @() });
            phases = @($phases.ToArray()); privateSessionsRemoved = -not (Test-Path -LiteralPath $sessionPath) } | ConvertTo-Json -Depth 8))
}
