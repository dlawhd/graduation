# Docker/DB를 실행하지 않고 실제 정리 함수의 경로 제한과 세션 제거를 검사한다.
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$source = Join-Path $PSScriptRoot 'run-e2e.ps1'
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$null, [ref]$errors)
if ($errors.Count) { throw 'Invalid runner syntax.' }
$function = $ast.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Protect-DatasetResultArtifacts'
}, $true)
if (-not $function) { throw 'Artifact protection function missing.' }
. ([scriptblock]::Create($function.Extent.Text))
$controlErrors = $null
$controlAst = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'invoke-concurrent-1000.ps1'), [ref]$null, [ref]$controlErrors)
if ($controlErrors.Count) { throw 'Invalid controller syntax.' }
$controlFunction = $controlAst.Find({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Set-ProbePhase'
}, $true)
. ([scriptblock]::Create($controlFunction.Extent.Text))
$folder = Join-Path $taskRoot ('build/isolated-e2e-results/memoryjar-e2e-' + [guid]::NewGuid().ToString('N').Substring(0,12))
New-Item -ItemType Directory -Path $folder -Force | Out-Null
try {
    $target = $folder
    $script:probeCommandSequence = 0
    [IO.File]::WriteAllText((Join-Path $folder 'probe-ack-00001.json'), '{"phase":"json-a1","active":true}')
    [IO.File]::WriteAllText((Join-Path $folder 'probe-ack-00002.json'), '{"phase":"json-a1","active":false}')
    Set-ProbePhase -Phase 'json-a1' -Active $true
    $firstCommand = Get-Content (Join-Path $folder 'probe-command-00001.json') -Raw
    Set-ProbePhase -Phase 'json-a1' -Active $false
    if ((Get-Content (Join-Path $folder 'probe-command-00001.json') -Raw) -ne $firstCommand -or
        (Get-Content (Join-Path $folder 'probe-command-00002.json') -Raw | ConvertFrom-Json).active -ne $false) {
        throw 'Probe commands must remain immutable across phase transitions.'
    }
    [IO.File]::WriteAllText((Join-Path $folder 'read-fixture.json'), '{"password":"fake-unit-only"}')
    [IO.File]::WriteAllText((Join-Path $folder 'read-summary.json'), '{"setup_data":{"token":"fake-unit-only"},"metrics":{"read_requests":{"count":3}}}')
    [IO.File]::WriteAllText((Join-Path $folder 'keep.txt'), 'untouched')
    if (-not (Protect-DatasetResultArtifacts $folder)) { throw 'Expected numeric summary.' }
    $result = Get-Content (Join-Path $folder 'read-summary.json') -Raw | ConvertFrom-Json
    if ($result.PSObject.Properties.Name.Count -ne 1 -or $result.metrics.read_requests.count -ne 3 -or
        (Test-Path (Join-Path $folder 'read-fixture.json'))) { throw 'Private artifacts retained.' }
    Remove-Item -LiteralPath (Join-Path $folder 'read-summary.json')
    if (Protect-DatasetResultArtifacts $folder) { throw 'Missing summary must return false.' }
    [IO.File]::WriteAllText((Join-Path $folder 'read-sessions.json'), '[{"token":"fake-unit-only"}]')
    [IO.File]::WriteAllText((Join-Path $folder 'auth-summary.json'), '{"setup_data":[{"token":"fake-unit-only"}],"metrics":{"prepared_accounts":{"count":1000}}}')
    [IO.File]::WriteAllText((Join-Path $folder 'read-1000-summary.json'), '{"setup_data":{"token":"fake-unit-only"},"metrics":{"read_requests":{"count":30000}}}')
    [IO.File]::WriteAllText((Join-Path $folder 'read-500-summary.json'), '{"setup_data":{"token":"fake-unit-only"},"metrics":{"read_requests":{"count":15000}}}')
    [IO.File]::WriteAllText((Join-Path $folder 'read-500-r1-summary.json'), '{"setup_data":{"token":"fake-unit-only"},"metrics":{"read_requests":{"count":15000}}}')
    if (-not (Protect-DatasetResultArtifacts $folder) -or (Test-Path (Join-Path $folder 'read-sessions.json'))) {
        throw 'Concurrent private sessions retained.'
    }
    foreach ($summaryName in @('auth-summary.json','read-500-summary.json','read-1000-summary.json','read-500-r1-summary.json')) {
        $numeric = Get-Content (Join-Path $folder $summaryName) -Raw | ConvertFrom-Json
        if (@($numeric.PSObject.Properties.Name).Count -ne 1 -or $numeric.PSObject.Properties.Name -ne 'metrics') {
            throw 'Concurrent summary retained setup sessions.'
        }
    }
    $rejected = $false
    try { Protect-DatasetResultArtifacts $taskRoot | Out-Null } catch { $rejected = $true }
    if (-not $rejected -or (Get-Content (Join-Path $folder 'keep.txt') -Raw) -ne 'untouched') {
        throw 'Path boundary or unrelated file preservation failed.'
    }
    Write-Output 'PASS: immutable probe commands, numeric-only summaries, session removal and path boundaries; unrelated file preserved.'
} finally {
    # 검증한 전용 폴더의 정해진 파일만 지우고 비어 있는 폴더를 정리한다.
    foreach ($name in @('read-fixture.json','read-summary.json','read-sessions.json','auth-summary.json','read-500-summary.json','read-1000-summary.json','read-500-r1-summary.json','keep.txt',
        'probe-command-00001.json','probe-command-00002.json','probe-ack-00001.json','probe-ack-00002.json')) {
        $file = Join-Path $folder $name
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
    }
    Remove-Item -LiteralPath $folder
}
