# 과거 소스를 별도 폴더에서 빌드하고, 외부 연결 없는 임시 DB/앱 컨테이너만 실행한다.
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$FixturePath,
    [ValidateSet(51,53)][int[]]$SchemaVersions = @(51,53)
)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$legacySha='c5f58c4f7440122acba040aa5ab2042284e53987'
$schemaSha='8a5f7cc6e689e23a1d495c31b2f3c3f4a388aade'
$runId='legacy-compat-'+[guid]::NewGuid().ToString('N').Substring(0,12)
$runRoot=Join-Path $taskRoot "build/legacy-backend-compat/$runId"
$fixture=(Resolve-Path -LiteralPath $FixturePath).Path
$approvedFixture=Join-Path $taskRoot 'build/legacy-backend-compat/20261028-c5f58c4/fixture-private.json'
if ($fixture -ne $approvedFixture) { throw 'Use the explicitly approved private fixture path.' }
$value=Get-Content -LiteralPath $fixture -Raw | ConvertFrom-Json
$allowed=@('fixtureVersion','sourceJarId','designType','bodyStyle','customBody','photoFrame','slot','hasSelectedGeneration','selectedAiStyle','isOpen','theme','maxMembers','openMode','lockLevel')
if (@($value.PSObject.Properties.Name | Where-Object { $_ -notin $allowed }).Count -gt 0 -or $value.sourceJarId -ne 112) {
    throw 'Unexpected private fixture fields; stopped before building.'
}
$taskSavedJavaHome=$env:JAVA_HOME
$context='desktop-linux'

# Docker 실행 대상을 고정해 사용자가 다른 context로 전환해도 원격/운영 자원을 건드리지 않는다.
function Invoke-CompatDocker {
    param([string[]]$Arguments)
    & docker --context $context @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Local compatibility Docker command failed.' }
}

# 메모리에 기록한 이번 실행 이름과 label이 모두 일치하는 컨테이너만 정리한다.
function Remove-CompatContainer {
    param([string]$Name)
    $label=(& docker --context $context inspect --format '{{index .Config.Labels "memoryjar.legacy-compat"}}' $Name 2>$null)
    if ($LASTEXITCODE -eq 0 -and "$label".Trim() -eq $runId) {
        & docker --context $context rm -f $Name *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Temporary container cleanup failed.' }
    }
}

try {
    $endpoint=(& docker context inspect $context --format '{{.Endpoints.docker.Host}}').Trim()
    if ($LASTEXITCODE -ne 0 -or $endpoint -notlike 'npipe:*') { throw 'Only the local Windows Docker Desktop endpoint is allowed.' }
    Invoke-CompatDocker -Arguments @('version','--format','{{.Server.Version}}')
    New-Item -ItemType Directory -Path $runRoot | Out-Null
    $source=New-Item -ItemType Directory -Path (Join-Path $runRoot 'legacy-source')
    $schemaSource=New-Item -ItemType Directory -Path (Join-Path $runRoot 'current-schema')
    foreach ($entry in @(@($legacySha,$source.FullName,'legacy.tar'),@($schemaSha,$schemaSource.FullName,'schema.tar'))) {
        $archive=Join-Path $runRoot $entry[2]
        $gitArgs=@('archive','--format=tar',"--output=$archive",$entry[0])
        if ($entry[0] -eq $schemaSha) { $gitArgs+=@('src/main/resources/db/migration') }
        & git -C $taskRoot @gitArgs
        if ($LASTEXITCODE -ne 0) { throw 'Pinned Git source archive failed.' }
        & tar -xf $archive -C $entry[1]
        if ($LASTEXITCODE -ne 0) { throw 'Pinned Git source extraction failed.' }
    }
    $env:JAVA_HOME=Join-Path $env:USERPROFILE '.jdks/corretto-17.0.10'
    if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) { throw 'Configured local JDK 17 not found.' }
    Write-Output 'Building the pinned legacy app and isolated compatibility test bundle.'
    Push-Location $source.FullName
    try {
        & ./gradlew.bat legacyCompatibilityBundle --offline --no-daemon --max-workers=2 --console=plain `
            --init-script (Join-Path $PSScriptRoot 'legacy-bundle.init.gradle') `
            "-Dmemoryjar.compat.sources=$(Join-Path $PSScriptRoot 'java')"
        if ($LASTEXITCODE -ne 0) { throw 'Legacy compatibility bundle build failed.' }
    } finally { Pop-Location }
    $bundle=(Resolve-Path (Join-Path $source.FullName 'build/legacy-compat-runtime')).Path
    foreach ($privateConfig in @('application-local.yml','application-prod.yml')) {
        if (Test-Path (Join-Path $bundle "resources/main/$privateConfig")) { throw 'Private profile must not enter the bundle.' }
    }
    $schema=(Resolve-Path (Join-Path $schemaSource.FullName 'src/main/resources/db/migration')).Path
    $provenance=@{legacyCommit=$legacySha;schemaCommit=$schemaSha;fixtureSha256=(Get-FileHash -LiteralPath $fixture -Algorithm SHA256).Hash.ToLower();scope='LOCAL_FUNCTIONAL_COMPATIBILITY_NOT_PERFORMANCE'}
    [IO.File]::WriteAllText((Join-Path $runRoot 'provenance.json'),($provenance|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
    foreach ($image in @('mariadb:10.11','eclipse-temurin:17-jdk')) {
        & docker --context $context image inspect $image *> $null
        if ($LASTEXITCODE -ne 0) { Invoke-CompatDocker -Arguments @('pull',$image) }
    }
    foreach ($version in $SchemaVersions) {
        $network="$runId-v$version-net"; $database="$runId-v$version-db"; $runner="$runId-v$version-app"
        $networkCreated=$false; $databaseCreated=$false; $runnerCreated=$false
        $results=New-Item -ItemType Directory -Path (Join-Path $runRoot "v$version")
        $dbRootPassword=[guid]::NewGuid().ToString('N')
        $dbPassword=[guid]::NewGuid().ToString('N')
        try {
            Invoke-CompatDocker -Arguments @('network','create','--internal','--label',"memoryjar.legacy-compat=$runId",$network)
            $networkCreated=$true
            $internal=(& docker --context $context network inspect --format '{{.Internal}}' $network).Trim()
            if ($LASTEXITCODE -ne 0 -or $internal -ne 'true') { throw 'Internal network required.' }
            Invoke-CompatDocker -Arguments @('create','--name',$database,'--network',$network,'--network-alias','db',
                '--label',"memoryjar.legacy-compat=$runId",'--memory','512m','--tmpfs','/var/lib/mysql:rw,size=384m',
                '-e',"MARIADB_ROOT_PASSWORD=$dbRootPassword",'-e','MARIADB_DATABASE=legacy_compat',
                '-e','MARIADB_USER=compat','-e',"MARIADB_PASSWORD=$dbPassword",'--health-cmd','healthcheck.sh --connect --innodb_initialized',
                '--health-interval','2s','--health-timeout','3s','--health-retries','30','mariadb:10.11')
            $databaseCreated=$true
            Invoke-CompatDocker -Arguments @('start',$database)
            $deadline=[DateTime]::UtcNow.AddSeconds(90)
            do {
                $health=(& docker --context $context inspect --format '{{.State.Health.Status}}' $database).Trim()
                if ($LASTEXITCODE -ne 0 -or $health -eq 'unhealthy') { throw 'Disposable database failed readiness.' }
                if ($health -eq 'healthy') { break }
                if ([DateTime]::UtcNow -gt $deadline) { throw 'Disposable database readiness timed out.' }
                Start-Sleep -Milliseconds 500
            } while ($true)
            Invoke-CompatDocker -Arguments @('create','--name',$runner,'--network',$network,
                '--label',"memoryjar.legacy-compat=$runId",'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
                '--user','1000:1000','--memory','1536m','--cpus','2','--tmpfs','/tmp:rw,size=512m,mode=1777',
                '--mount',"type=bind,source=$bundle,target=/suite,readonly",'--mount',"type=bind,source=$schema,target=/schema,readonly",
                '--mount',"type=bind,source=$fixture,target=/fixture/fixture-private.json,readonly",'--mount',"type=bind,source=$($results.FullName),target=/results",
                '-e','ISOLATED_LEGACY_COMPAT=1','-e',"COMPAT_SCHEMA_VERSION=$version",'-e','SPRING_PROFILES_ACTIVE=test',
                '-e','AWS_EC2_METADATA_DISABLED=true','-e','SPRING_DATASOURCE_URL=jdbc:mariadb://db:3306/legacy_compat',
                '-e','SPRING_DATASOURCE_USERNAME=compat','-e',"SPRING_DATASOURCE_PASSWORD=$dbPassword",'eclipse-temurin:17-jdk',
                'sh','-c','cp -R /suite /tmp/runtime && exec java -Xmx768m -cp "/tmp/runtime/classes/main:/tmp/runtime/classes/compat:/tmp/runtime/resources/main:/tmp/runtime/resources/compat:/tmp/runtime/lib/*" shop.esjh.memoryjar.compat.LegacyCompatibilityLauncher')
            $runnerCreated=$true
            Write-Output "Running old backend startup, login and same-jar reads against schema V$version."
            # 전체 로그는 Git 제외 폴더에만 남기고 채팅에는 숫자 요약만 출력한다.
            & docker --context $context start -a $runner *> (Join-Path $results.FullName 'private-runtime.log')
            $exitCode=(& docker --context $context inspect --format '{{.State.ExitCode}}' $runner).Trim()
            $summary=Join-Path $results.FullName 'result.json'
            if (Test-Path -LiteralPath $summary) { Get-Content -LiteralPath $summary -Raw | Write-Output }
            if ($LASTEXITCODE -ne 0 -or $exitCode -ne '0') { throw "Compatibility V$version failed; private diagnostics: $($results.FullName)" }
        } finally {
            if ($runnerCreated) { Remove-CompatContainer -Name $runner }
            if ($databaseCreated) { Remove-CompatContainer -Name $database }
            if ($networkCreated) {
                $label=(& docker --context $context network inspect --format '{{index .Labels "memoryjar.legacy-compat"}}' $network).Trim()
                if ($LASTEXITCODE -eq 0 -and $label -eq $runId) { & docker --context $context network rm $network *> $null }
            }
        }
    }
    Write-Output "Legacy compatibility checks completed: $runRoot"
} finally { $env:JAVA_HOME=$taskSavedJavaHome }
