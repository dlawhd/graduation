# 고정된 옛/현재 앱과 빈 DB 두 개만 로컬에서 실행한다. 운영 접속·배포·실제 자격 증명을 사용하지 않는다.
[CmdletBinding()]
param([switch]$Stop,[switch]$VerifyOnly,[string]$RunRoot,[switch]$WorkingFrontend,
    [ValidateSet('c5f58c4','dd6e50b','8a5f7cc')][string]$BaselineRef='dd6e50b')
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$baseRoot=Join-Path $taskRoot 'build/local-comparison'
$context='desktop-linux'
$savedJavaHome=$env:JAVA_HOME

function Invoke-LocalDocker {
    param([string[]]$Arguments)
    & docker --context $context @Arguments
    if ($LASTEXITCODE -ne 0) { throw 'Local comparison Docker command failed.' }
}

# 경로·이번 실행 label이 모두 맞는 임시 자원만 정리한다. 원본 파일이나 다른 컨테이너는 삭제하지 않는다.
function Stop-LocalComparison {
    param([string]$Directory)
    $absolute=[IO.Path]::GetFullPath($Directory)
    $prefix=[IO.Path]::GetFullPath($baseRoot)+[IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'Run root outside comparison workspace.' }
    $manifest=Get-Content -LiteralPath (Join-Path $absolute 'run-public.json') -Raw | ConvertFrom-Json
    if ($manifest.runId -notmatch '^local-compare-[a-f0-9]{12}$' -or (Split-Path $absolute -Leaf) -ne $manifest.runId) { throw 'Invalid run identity.' }
    [IO.File]::WriteAllText((Join-Path $absolute 'STOP'),'stop')
    # 세션 시험이 결과를 기록하고 정상 종료할 시간을 먼저 준다. 오래 걸리면 아래에서 해당 임시 자원만 강제 정리한다.
    foreach($variant in @('before','after')) {
        $name="$($manifest.runId)-$variant-app";$until=[DateTime]::UtcNow.AddSeconds(8)
        do {
            $state=(& docker --context $context inspect --format '{{.State.Running}}' $name 2>$null)
            if($LASTEXITCODE -ne 0 -or "$state".Trim() -ne 'true'){break}
            Start-Sleep -Milliseconds 250
        } while([DateTime]::UtcNow -lt $until)
    }
    foreach($name in $manifest.containers) {
        if ($name -notmatch ('^'+[regex]::Escape($manifest.runId)+'-(asset|ingress|before-db|after-db|before-app|after-app)$')) { throw 'Unexpected container name.' }
        $label=(& docker --context $context inspect --format '{{index .Config.Labels "memoryjar.local-comparison"}}' $name 2>$null)
        if ($LASTEXITCODE -eq 0 -and "$label".Trim() -eq $manifest.runId) { Invoke-LocalDocker -Arguments @('rm','-f',$name) }
    }
    foreach($name in $manifest.networks) {
        if($name -notmatch ('^'+[regex]::Escape($manifest.runId)+'-(before|after|ingress)-net$')) { throw 'Unexpected network name.' }
        $label=(& docker --context $context network inspect --format '{{index .Labels "memoryjar.local-comparison"}}' $name 2>$null)
        if ($LASTEXITCODE -eq 0 -and "$label".Trim() -eq $manifest.runId) { Invoke-LocalDocker -Arguments @('network','rm',$name) }
    }
    Write-Output '이번 로컬 비교의 임시 컨테이너·네트워크 정리 완료. 결과 파일은 유지합니다.'
}

try {
    $endpoint=(& docker context inspect $context --format '{{.Endpoints.docker.Host}}').Trim()
    if($LASTEXITCODE -ne 0 -or $endpoint -notlike 'npipe:*') { throw 'Local Windows Docker Desktop required.' }
    if($Stop) { if(-not $RunRoot){throw 'RunRoot required for stop.'};Stop-LocalComparison -Directory $RunRoot;exit }
    if($RunRoot) { throw 'RunRoot is generated automatically for new sessions.' }
    if($WorkingFrontend -and $BaselineRef -notin @('dd6e50b','8a5f7cc')){throw 'Working frontend comparison requires an allowed curved-photo baseline.'}
    $runId='local-compare-'+[guid]::NewGuid().ToString('N').Substring(0,12)
    $RunRoot=Join-Path $baseRoot $runId
    New-Item -ItemType Directory -Path $RunRoot | Out-Null
    $baselines=@{c5f58c4='c5f58c4f7440122acba040aa5ab2042284e53987';dd6e50b='dd6e50b31ee9405f41a255152510367aa9d27cca';'8a5f7cc'='8a5f7cc6e689e23a1d495c31b2f3c3f4a388aade'}
    $refs=@{before=$baselines[$BaselineRef];after='8a5f7cc6e689e23a1d495c31b2f3c3f4a388aade'}
    $manifest=@{runId=$runId;scope='LOCAL_HISTORICAL_RELEASE_COMPARISON';
        baseline=$BaselineRef;commits=$refs;workingFrontend=[bool]$WorkingFrontend;
        containers=@("$runId-ingress","$runId-before-app","$runId-after-app","$runId-asset","$runId-before-db","$runId-after-db");
        networks=@("$runId-before-net","$runId-after-net","$runId-ingress-net");
        before='http://127.0.0.1:18900/__comparison/start';after='http://localhost:18901/__comparison/start'}
    [IO.File]::WriteAllText((Join-Path $RunRoot 'run-public.json'),($manifest|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    try {
        # 다른 로컬 서버를 덮어쓰지 않도록 필요한 loopback 포트가 모두 비어 있는지 먼저 확인한다.
        foreach($port in @(18900,18901,18903,18910,18911)) {
            $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,$port)
            try {$listener.Start()} finally {$listener.Stop()}
        }
        $env:JAVA_HOME=Join-Path $env:USERPROFILE '.jdks/corretto-17.0.10'
        if(-not(Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {throw 'JDK 17 not found.'}
        $bundles=@{}
        foreach($variant in @('before','after')) {
            $source=Join-Path $RunRoot $variant;New-Item -ItemType Directory -Path $source | Out-Null
            & git -C $taskRoot archive --format=tar "--output=$(Join-Path $RunRoot "$variant.tar")" $refs[$variant]
            if($LASTEXITCODE -ne 0){throw 'Pinned source archive failed.'}
            & tar -xf (Join-Path $RunRoot "$variant.tar") -C $source
            if($LASTEXITCODE -ne 0){throw 'Pinned source extraction failed.'}
            # 두 커밋의 package/lock 파일이 같을 때만 기존 설치 의존성을 재사용한다.
            foreach($file in @('package.json','package-lock.json')) {
                $snapshotText=(Get-Content -LiteralPath (Join-Path $source "frontend/$file") -Raw).Replace("`r`n","`n")
                $workingText=(Get-Content -LiteralPath (Join-Path $taskRoot "frontend/$file") -Raw).Replace("`r`n","`n")
                if($snapshotText -cne $workingText) {throw 'Frontend dependencies differ; do not reuse installation.'}
            }
            New-Item -ItemType Junction -Path (Join-Path $source 'frontend/node_modules') -Target (Join-Path $taskRoot 'frontend/node_modules') | Out-Null
            Push-Location $source
            try {
                & ./gradlew.bat legacyCompatibilityBundle --offline --no-daemon --max-workers=2 --console=plain `
                    --init-script (Join-Path $PSScriptRoot 'legacy-bundle.init.gradle') "-Dmemoryjar.compat.sources=$(Join-Path $PSScriptRoot 'java')"
                if($LASTEXITCODE -ne 0){throw 'Pinned backend comparison build failed.'}
            } finally {Pop-Location}
            $bundles[$variant]=Join-Path $source 'build/legacy-compat-runtime'
            foreach($private in @('application-local.yml','application-prod.yml')) {
                if(Test-Path -LiteralPath (Join-Path $bundles[$variant] "resources/main/$private")){throw 'Private profile in bundle.'}
            }
        }
        if($WorkingFrontend) {
            & node (Join-Path $PSScriptRoot 'local-comparison.mjs') overlay $RunRoot
            if($LASTEXITCODE -ne 0){throw 'Working frontend snapshot validation failed.'}
        }
        & node (Join-Path $PSScriptRoot 'local-comparison.mjs') prepare $RunRoot
        if($LASTEXITCODE -ne 0){throw 'Pinned frontend comparison build failed.'}
        foreach($image in @('mariadb:10.11','eclipse-temurin:17-jdk')) {
            & docker --context $context image inspect $image *> $null
            if($LASTEXITCODE -ne 0){throw 'Required cached local image missing.'}
        }
        foreach($variant in @('before','after')) {
            Invoke-LocalDocker -Arguments @('network','create','--internal','--label',"memoryjar.local-comparison=$runId","$runId-$variant-net")
        }
        Invoke-LocalDocker -Arguments @('network','create','--label',"memoryjar.local-comparison=$runId","$runId-ingress-net")
        $common=@('--label',"memoryjar.local-comparison=$runId",'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
            '--user','1000:1000','--tmpfs','/tmp:rw,size=256m,mode=1777','--mount',"type=bind,source=$RunRoot,target=/session",'-e','ISOLATED_LOCAL_COMPARISON=1')
        Invoke-LocalDocker -Arguments (@('create','--name',"$runId-asset",'--network',"$runId-before-net",'--network-alias','asset',
            '--memory','160m','--memory-swap','160m','--cpus','1')+$common+@(
            '--mount',"type=bind,source=$($bundles.before),target=/suite,readonly",'eclipse-temurin:17-jdk',
            'sh','-c','java -Djava.awt.headless=true -Xmx48m -cp "/suite/classes/main:/suite/classes/compat:/suite/resources/main:/suite/resources/compat:/suite/lib/*" shop.esjh.memoryjar.compat.LocalFixtureServerCheck && exec java -Djava.awt.headless=true -Xmx48m -cp "/suite/classes/main:/suite/classes/compat:/suite/resources/main:/suite/resources/compat:/suite/lib/*" shop.esjh.memoryjar.compat.LocalFixtureServer'))
        Invoke-LocalDocker -Arguments @('network','connect','--alias','asset',"$runId-after-net","$runId-asset")
        Invoke-LocalDocker -Arguments @('start',"$runId-asset")
        $schema=Join-Path $RunRoot 'after/src/main/resources/db/migration'
        foreach($variant in @('before','after')) {
            $dbPassword=[guid]::NewGuid().ToString('N');$rootPassword=[guid]::NewGuid().ToString('N')
            Invoke-LocalDocker -Arguments @('create','--name',"$runId-$variant-db",'--network',"$runId-$variant-net",'--network-alias','db',
                '--label',"memoryjar.local-comparison=$runId",'--memory','512m','--tmpfs','/var/lib/mysql:rw,size=384m',
                '-e',"MARIADB_ROOT_PASSWORD=$rootPassword",'-e','MARIADB_DATABASE=legacy_compat','-e','MARIADB_USER=compat','-e',"MARIADB_PASSWORD=$dbPassword",
                '--health-cmd','healthcheck.sh --connect --innodb_initialized','--health-interval','2s','--health-timeout','3s','--health-retries','40','mariadb:10.11')
            Invoke-LocalDocker -Arguments @('start',"$runId-$variant-db")
            $deadline=[DateTime]::UtcNow.AddSeconds(100)
            do {
                $health=(& docker --context $context inspect --format '{{.State.Health.Status}}' "$runId-$variant-db").Trim()
                if($health -eq 'healthy'){break}
                if([DateTime]::UtcNow -gt $deadline -or $health -eq 'unhealthy'){throw 'Disposable database readiness failed.'}
                Start-Sleep -Milliseconds 500
            } while($true)
            Invoke-LocalDocker -Arguments (@('create','--name',"$runId-$variant-app",'--network',"$runId-$variant-net",'--memory','1152m','--cpus','2')+$common+@(
                '--mount',"type=bind,source=$($bundles[$variant]),target=/suite,readonly",'--mount',"type=bind,source=$schema,target=/schema,readonly",
                '-e',"COMPARISON_VARIANT=$variant",'-e',"COMPARISON_BACKEND_COMMIT=$($refs[$variant])",'-e','SPRING_PROFILES_ACTIVE=test',
                '-e','AWS_EC2_METADATA_DISABLED=true','-e','SPRING_DATASOURCE_URL=jdbc:mariadb://db:3306/legacy_compat','-e','SPRING_DATASOURCE_USERNAME=compat',
                '-e',"SPRING_DATASOURCE_PASSWORD=$dbPassword",'eclipse-temurin:17-jdk','sh','-c',
                'cp -R /suite /tmp/runtime && exec java -Xmx512m -cp "/tmp/runtime/classes/main:/tmp/runtime/classes/compat:/tmp/runtime/resources/main:/tmp/runtime/resources/compat:/tmp/runtime/lib/*" shop.esjh.memoryjar.compat.LocalComparisonLauncher'))
            Invoke-LocalDocker -Arguments @('start',"$runId-$variant-app")
        }
        $deadline=[DateTime]::UtcNow.AddSeconds(150)
        do {
            if((Test-Path (Join-Path $RunRoot 'ready-before.json')) -and (Test-Path (Join-Path $RunRoot 'ready-after.json'))){break}
            foreach($variant in @('before','after')) {
                $running=(& docker --context $context inspect --format '{{.State.Running}}' "$runId-$variant-app").Trim()
                if($running -ne 'true'){throw "Local $variant app stopped; inspect private local logs."}
            }
            if([DateTime]::UtcNow -gt $deadline){throw 'Local app readiness timed out.'}
            Start-Sleep -Milliseconds 500
        } while($true)
        $ingress=Join-Path $RunRoot 'ingress';New-Item -ItemType Directory -Path (Join-Path $ingress 'classes'),(Join-Path $ingress 'results') | Out-Null
        & (Join-Path $env:JAVA_HOME 'bin/javac.exe') -encoding UTF-8 -d (Join-Path $ingress 'classes') (Join-Path $PSScriptRoot 'ingress/LocalIngressProxy.java')
        if($LASTEXITCODE -ne 0){throw 'Local ingress build failed.'}
        Invoke-LocalDocker -Arguments @('create','--name',"$runId-ingress",'--network',"$runId-ingress-net",
            '--label',"memoryjar.local-comparison=$runId",'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1000:1000',
            '--memory','192m','--cpus','1','--tmpfs','/tmp:rw,size=64m,mode=1777',
            '--mount',"type=bind,source=$(Join-Path $ingress 'classes'),target=/classes,readonly",'--mount',"type=bind,source=$(Join-Path $ingress 'results'),target=/results",
            '-p','127.0.0.1:18910:9010','-p','127.0.0.1:18911:9011','-p','127.0.0.1:18903:9003',
            '-e','ISOLATED_LOCAL_COMPARISON=1','-e',"LOCAL_COMPARISON_RUN_ID=$runId",'eclipse-temurin:17-jdk',
            'java','-Xmx32m','-Xss256k','-cp','/classes','shop.esjh.memoryjar.compat.LocalIngressProxy')
        foreach($variant in @('before','after')){Invoke-LocalDocker -Arguments @('network','connect',"$runId-$variant-net","$runId-ingress")}
        Invoke-LocalDocker -Arguments @('start',"$runId-ingress")
        # 내부 전용 앱의 포트 매핑은 Docker에서 생략되므로, 별도 진입 프록시를 통한 실제 읽기가 성공해야 준비 완료다.
        $deadline=[DateTime]::UtcNow.AddSeconds(15)
        do {
            $ingressReady=$true
            foreach($url in @('http://127.0.0.1:18910/api/v1/csrf','http://127.0.0.1:18911/api/v1/csrf','http://127.0.0.1:18903/__fixture/stats')) {
                try {$probe=Invoke-WebRequest -Uri $url -TimeoutSec 2;if($probe.StatusCode -ne 200){$ingressReady=$false}} catch {$ingressReady=$false}
            }
            if($ingressReady){break}
            if([DateTime]::UtcNow -gt $deadline){throw 'Local ingress read probe failed.'}
            Start-Sleep -Milliseconds 250
        } while($true)
        $helper=Start-Process -FilePath (Get-Command node).Source -ArgumentList @((Join-Path $PSScriptRoot 'local-comparison.mjs'),'serve',$RunRoot) `
            -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RunRoot 'gateway-private.log') -RedirectStandardError (Join-Path $RunRoot 'gateway-private-error.log')
        $deadline=[DateTime]::UtcNow.AddSeconds(10)
        while(-not(Test-Path (Join-Path $RunRoot 'gateway-ready.json'))) {
            if($helper.HasExited -or [DateTime]::UtcNow -gt $deadline){throw 'Local gateway startup failed.'};Start-Sleep -Milliseconds 200
        }
        Write-Output "로컬 비교 준비 완료: $RunRoot"
        Write-Output "비교 기준 ($BaselineRef): $($manifest.before)"
        $afterLabel=if($WorkingFrontend){'8a5f7cc 기준 계산 파일 작업 수정본'}else{'8a5f7cc'}
        Write-Output "현재 구현 ($afterLabel): $($manifest.after)"
        Write-Output '측정 전 두 화면의 사진과 380×380 그리기 영역을 확인하세요. 자동 측정은 활성 탭에서만 실행합니다.'
        if($VerifyOnly) {
            & node (Join-Path $PSScriptRoot 'local-comparison-check.mjs') $RunRoot
            if($LASTEXITCODE -ne 0){throw 'Local HTTP/cache verification failed.'}
            Stop-LocalComparison -Directory $RunRoot
            Write-Output '새 실행 폴더에서 빌드·시작·실제 HTTP/캐시 검증·정리까지 통과했습니다. 성능 측정은 수행하지 않았습니다.'
        }
    } catch {
        Stop-LocalComparison -Directory $RunRoot
        throw
    }
} finally {$env:JAVA_HOME=$savedJavaHome}
