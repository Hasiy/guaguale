param([switch]$Offline)

$ErrorActionPreference = 'Stop'
$buildTemp = Join-Path $PSScriptRoot '.tmp'
New-Item -ItemType Directory -Force -Path $buildTemp | Out-Null
$previousJavaOptions = $env:JAVA_TOOL_OPTIONS
try {
    # A short local path avoids Windows JDK named-socket errors with redirected TEMP paths.
    $env:JAVA_TOOL_OPTIONS = "$previousJavaOptions `"-Djdk.net.unixdomain.tmpdir=$buildTemp`" `"-Djava.io.tmpdir=$buildTemp`"".Trim()
    $buildArguments = @('-p', $PSScriptRoot, ':app:assembleDebug', ':app:lintDebug', '--console=plain')
    if ($Offline) { $buildArguments += '--offline' }
    & (Join-Path $PSScriptRoot 'gradlew.bat') @buildArguments
    if ($LASTEXITCODE -ne 0) { throw "Android build failed: $LASTEXITCODE" }
    $artifactDirectory = Join-Path $PSScriptRoot '..\artifacts'
    New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk') -Destination (Join-Path $artifactDirectory 'haoyun-guagua-debug.apk')
    Write-Host 'APK: artifacts/haoyun-guagua-debug.apk'
} finally {
    $env:JAVA_TOOL_OPTIONS = $previousJavaOptions
}
