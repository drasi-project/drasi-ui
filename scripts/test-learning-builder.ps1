# Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repository = Split-Path -Parent $PSScriptRoot
$original = Get-Location
$temporary = Join-Path ([IO.Path]::GetTempPath()) ("drasi clean builder " + [guid]::NewGuid().ToString('N'))
$checkout = Join-Path $temporary 'fresh clone with spaces'
$initialFile = Join-Path $temporary 'initial-state.json'
$proof = $env:DRASI_BUILDER_PROOF
if (-not $proof) { throw 'DRASI_BUILDER_PROOF must name an explicit evidence file' }
New-Item -ItemType Directory -Path $temporary | Out-Null
$stage = 'clone'
try {
    $source = & git -C $repository rev-parse HEAD
    if ($LASTEXITCODE) { throw 'Cannot read the source commit' }
    # Exercise a common Windows checkout setting; repository attributes must keep canonical text stable.
    & git -c core.autocrlf=true clone --no-local --no-hardlinks -- $repository $checkout
    if ($LASTEXITCODE) { throw 'Fresh clone failed' }
    Set-Location $checkout
    $head = & git rev-parse HEAD
    if ($LASTEXITCODE -or $head.Trim() -ne $source.Trim()) { throw 'Fresh clone selected a different source' }
    $paths = @('.artifacts', 'node_modules', 'packages/core/dist', 'packages/react/dist', 'packages/styles/dist')
    $initial = @{}
    foreach ($path in $paths) {
        $initial[$path] = Test-Path -LiteralPath $path
        if ($initial[$path]) { throw "Fresh clone already contains $path" }
    }
    $shellNode = & node --version
    if ($LASTEXITCODE) { throw 'Cannot read the documented Node toolchain' }
    $shellNpm = npm --version
    if ($LASTEXITCODE) { throw 'Cannot read the documented npm toolchain' }
    @{
        source = $source.Trim()
        initialPaths = $initial
        checkoutContainsSpaces = $checkout.Contains(' ')
        shell = 'PowerShell'
        shellVersion = $PSVersionTable.PSVersion.ToString()
        shellNodeVersion = $shellNode.Trim()
        shellNpmVersion = $shellNpm.Trim()
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $initialFile -Encoding utf8NoBOM
    $stage = 'builder'
    & node scripts/build-learning-kit.mjs
    if ($LASTEXITCODE) { throw 'Documented source-builder command failed' }
    & node --test scripts/test/build-learning-kit.test.mjs scripts/test/node-cli.test.mjs scripts/test/build-outputs.test.mjs
    if ($LASTEXITCODE) { throw 'Builder regression tests failed' }
    $stage = 'starter'
    Set-Location '.artifacts/learning-build/kit'
    & node verify-preview.mjs --kit .
    if ($LASTEXITCODE) { throw 'Generated kit failed verification' }
    Set-Location starter
    npm ci
    if ($LASTEXITCODE) { throw 'Documented starter install failed' }
    npm run build
    if ($LASTEXITCODE) { throw 'Documented starter build failed' }
    & node --test identity.test.mjs
    if ($LASTEXITCODE) { throw 'Installed identity test failed' }
    $stage = 'installed-verification'
    & node (Join-Path $checkout 'scripts/verify-learning-builder.mjs') $initialFile $proof
    if ($LASTEXITCODE) { throw 'Source-free starter verification failed' }
} catch {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $proof)) | Out-Null
    @{ success = $false; failedStage = $stage } |
        ConvertTo-Json | Set-Content -LiteralPath $proof -Encoding utf8NoBOM
    throw
} finally {
    Set-Location $original
    Remove-Item -LiteralPath $temporary -Recurse -Force
}
