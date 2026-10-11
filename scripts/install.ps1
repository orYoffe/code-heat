# Install the packaged extension without cloning or building the repository.
$ErrorActionPreference = 'Stop'
$codeCommand = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCommand) {
    throw "VS Code's 'code' command was not found. Add VS Code to PATH, then open a new terminal."
}

$tempDirectory = Join-Path ([IO.Path]::GetTempPath()) ('code-heat-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($tempDirectory) | Out-Null
try {
    $vsix = Join-Path $tempDirectory 'code-heat.vsix'
    $url = 'https://raw.githubusercontent.com/orYoffe/code-heat/ce40e7d78ce636a73fda88c51abbc1cb7a241598/releases/explorer-size-heatmap-0.1.0.vsix'
    $expected = '7e26504f7778f9feef00bcabf3c73a88ada01a56f3e16f6fe41c98c41da8f7e7'
    Write-Host 'Downloading Code Heat 0.1.0...'
    Invoke-WebRequest -Uri $url -OutFile $vsix -UseBasicParsing
    $actual = (Get-FileHash -LiteralPath $vsix -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) {
        throw 'Download checksum does not match. Installation stopped.'
    }
    & $codeCommand.Source --install-extension $vsix
    if ($LASTEXITCODE -ne 0) {
        throw "VS Code installation failed with exit code $LASTEXITCODE."
    }
    Write-Host 'Code Heat installed. Open a project folder in VS Code.'
    Write-Host 'If needed, run Developer: Reload Window. Find the extension as Explorer Size Heatmap.'
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force
}
