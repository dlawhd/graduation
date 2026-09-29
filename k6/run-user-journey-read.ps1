<#
운영 환경의 읽기 전용 사용자 여정 부하 테스트를 안전하게 실행한다.
인증 쿠키는 화면에 표시하거나 파일에 저장하지 않고 현재 프로세스의 환경변수로만 전달한다.
#>
param(
    [string]$BaseUrl = "https://api.esjh.shop",
    [string]$JarIds = "100,92,91",
    [switch]$Diagnostic
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
    throw "k6 was not found. Check the k6 installation and PATH configuration."
}

if ($JarIds -notmatch '^\d+(,\d+)*$') {
    throw "JarIds must contain comma-separated numbers, for example: 100,92,91."
}

$secureCookie = Read-Host `
    "Paste only the new accessToken=... value and press Enter (input is hidden)" `
    -AsSecureString
$cookiePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureCookie)

try {
    $cookieValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($cookiePointer)

    if ([string]::IsNullOrWhiteSpace($cookieValue) -or
        -not $cookieValue.StartsWith("accessToken=")) {
        throw "The value must use the accessToken=... format."
    }

    # k6 자식 프로세스에만 값을 전달하고 테스트가 끝나면 즉시 제거한다.
    $env:COOKIE = $cookieValue
    $env:JAR_IDS = $JarIds
    $env:BASE_URL = $BaseUrl
    $env:DIAGNOSTIC = $Diagnostic.IsPresent.ToString().ToLowerInvariant()

    & k6 run (Join-Path $PSScriptRoot "user-journey-read.js")
    if ($LASTEXITCODE -ne 0) {
        throw "k6 failed with exit code $LASTEXITCODE."
    }
}
finally {
    $cookieValue = $null
    Remove-Item Env:COOKIE -ErrorAction SilentlyContinue
    Remove-Item Env:JAR_IDS -ErrorAction SilentlyContinue
    Remove-Item Env:BASE_URL -ErrorAction SilentlyContinue
    Remove-Item Env:DIAGNOSTIC -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($cookiePointer)
}
