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
    $url = 'https://raw.githubusercontent.com/orYoffe/code-heat/d7434ac21d84f95f077c313218b21f93045c8f4d/releases/explorer-size-heatmap-0.1.1.vsix'
    $expected = '6218dfb3cd2a384218a0c17363e7bd2b8019503eb86c707cdac96c8c3e514ef9'
    Write-Host 'Downloading Code Heat 0.1.1...'
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
    Write-Host 'If needed, run Developer: Reload Window. Click Code Heat in the bottom status bar for help.'
} finally {
    Remove-Item -LiteralPath $tempDirectory -Recurse -Force
}
