#!/bin/sh
# Install the packaged extension without cloning or building the repository.
set -eu

if ! command -v code >/dev/null 2>&1; then
  printf '%s\n' "VS Code's 'code' command was not found." "On macOS: run Shell Command: Install 'code' command in PATH from VS Code's Command Palette." "On Windows or Linux: add VS Code to PATH, then open a new terminal." >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  printf '%s\n' 'curl is required to download the extension.' >&2
  exit 1
fi
if command -v sha256sum >/dev/null 2>&1; then
  hash_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then
  hash_tool=shasum
else
  printf '%s\n' 'sha256sum or shasum is required to verify the download.' >&2
  exit 1
fi

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
vsix="$tmp_dir/code-heat.vsix"
url='https://raw.githubusercontent.com/orYoffe/code-heat/ce40e7d78ce636a73fda88c51abbc1cb7a241598/releases/explorer-size-heatmap-0.1.0.vsix'
expected='7e26504f7778f9feef00bcabf3c73a88ada01a56f3e16f6fe41c98c41da8f7e7'

printf '%s\n' 'Downloading Code Heat 0.1.0...'
curl -fSL --retry 2 "$url" -o "$vsix"
if [ "$hash_tool" = sha256sum ]; then
  digest=$(sha256sum "$vsix")
else
  digest=$(shasum -a 256 "$vsix")
fi
actual=${digest%% *}
if [ "$actual" != "$expected" ]; then
  printf '%s\n' 'Download checksum does not match. Installation stopped.' >&2
  exit 1
fi
code --install-extension "$vsix"
printf '%s\n' 'Code Heat installed. Open a project folder in VS Code.' 'If needed, run Developer: Reload Window. Find the extension as Explorer Size Heatmap.'
