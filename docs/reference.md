# Code Heat reference

[Back to quick start and examples](../README.md) · [Getting started inside VS Code](../resources/getting-started.md)

## Other installation options

VS Code 1.90 or newer is required. The `code` command must be on PATH.
On macOS, run **Shell Command: Install 'code' command in PATH** from the Command Palette.
Open a new terminal after changing PATH.
See [VS Code's command-line guide](https://code.visualstudio.com/docs/configure/command-line) for platform setup.

[Download the VSIX](https://github.com/orYoffe/code-heat/raw/main/releases/explorer-size-heatmap-0.1.1.vsix), then choose **Extensions → … → Install from VSIX**.
For an already downloaded package:

```sh
code --install-extension explorer-size-heatmap-0.1.1.vsix
```

The installers download 0.1.1, verify its SHA-256 checksum, and clean up temporary files.
Inspect the [shell installer](../scripts/install.sh) or [PowerShell installer](../scripts/install.ps1) before running it.

No Marketplace release exists yet. The extension ID is `oryoffe.explorer-size-heatmap`.
Version 0.1.0 was named **Explorer Size Heatmap**.

## Configure

Run **Code Heat: Open Configuration** from the Command Palette.
This creates `.explorer-size.json` in the selected workspace root.
No configuration file is required for the defaults.

```json
{
  "minLines": 80,
  "maxLines": 1000,
  "colorFolders": true,
  "maxFolderLines": 1000,
  "maxFolderFiles": 50,
  "showBadge": true,
  "include": ["**/*.{ts,tsx,js,jsx}"],
  "concurrency": 4,
  "maxEntries": 100000
}
```

See [the example configuration](../.explorer-size.example.json) for all defaults.
Changes to the root file apply automatically.
Malformed edits retain the last valid root configuration and show a warning.
The same options work under `explorerSizeHeatmap.config` in `.vscode/settings.json`.
The root configuration file overrides those settings.

`include` and `exclude` use workspace-relative glob patterns. Arrays replace defaults.
The CLI's repeated `--exclude` flags add to existing exclusions.
Dependencies, build outputs, coverage, minified assets, source maps, and common lock files are excluded by default.
Directory exclusions prune the entire subtree.

The palette has 21 native theme colors. Customize any entry in VS Code's JSON settings:

```json
{
  "workbench.colorCustomizations": {
    "explorerSizeHeatmap.level0": "#39FF14",
    "explorerSizeHeatmap.level20": "#B91C1C"
  }
}
```

The extension does not rewrite your theme or other settings.
VS Code's supported API colors labels and badges, not individual row backgrounds.
Keep `explorer.decorations.colors` enabled for the colors to appear.
Git and other decoration providers may take priority on changed files.
The extension cannot force decoration priority through the public API.

## CLI and local reports

The CLI works without VS Code. It requires Node.js 20 or newer and a separate installation.
Install it from this repository:

```sh
git clone https://github.com/orYoffe/code-heat.git
cd code-heat
npm ci --omit=dev
npm link
```

Scan any folder and export a report:

```sh
code-size . --format json --out sizes.json
code-size . --format csv --out sizes.csv
code-size . --format html --out sizes.html --open
code-size packages --include '**/*.{ts,tsx,js,jsx}' --format tsv
```

You can also run `node src/cli.js <folder>` directly.
Run `code-size --help` for all flags.

The HTML report opens from a local file without a server or internet access.
It includes folder breadcrumbs, path filtering, sortable tables, size bars, pagination, file details, and JSON download.
The tables follow the folder-navigation approach of Istanbul coverage reports.
The size percentages show position on the configured size scale; they are not test coverage.

JSON includes report metadata, thresholds, scan duration, exclusion count, truncation state, and flat file/folder records.
Each record includes its path, type, physical lines, blank lines, nonblank lines, text-file count, bytes, and skipped count.
File records also include extension, language, modification timestamp, and count status.
CSV, TSV, and NDJSON contain the same entry details. Markdown provides a compact table.
Spreadsheet exports neutralize names that resemble formulas.

## Counting and monorepo behavior

The metric is **physical lines**, including code, comments, and blank lines.
An empty file has zero lines. A terminal newline adds no extra line.
CRLF counts as one separator. LF and CR are supported.
Nonblank lines include comments; this tool does not claim language-aware executable-line counts.

Visible files use lazy, cached reads. Reads stop after crossing the red threshold.
Their tooltip says “At least” when the count is capped.
Folder indexing runs asynchronously with a shared bounded I/O queue.
The index counts complete text files so recursive totals and CLI reports are exact for included files.
The index stores metadata, not source content.
Normal file changes update ancestors incrementally. Directory changes trigger a structural rescan.
Cancellation, refresh, and workspace removal retire old reads.

Default budgets:

| Budget | Default |
| --- | ---: |
| Concurrent file reads per root | 4 |
| Lazy result cache | 5,000 entries |
| Metadata index | 100,000 entries |
| Maximum file size | 8 MiB |
| Read buffer | 32 KiB |
| Pending lazy/update reads | 512 |

Binary files containing NUL, UTF-16 files, oversized files, and symlinks are not counted.
Unreadable files and directories contribute to skipped counts.
Reaching the metadata budget produces a clearly marked partial index/report.
The CLI exits with code 2 for partial reports, 1 for errors, and 130 for interruption.
No telemetry, uploads, or executable workspace configuration are used.

## Verification

```sh
npm test
HEATMAP_MONOREPO=/path/to/next.js npm run test:integration
```

The host suite checks native decoration objects, recursive folder colors, multi-root isolation, caching, dirty edits, saved aggregates, configuration changes, and deletion.
It uses a temporary fixture and a read-only Next.js checkout.
On Linux, use a desktop session or `xvfb-run` for the host suite.
Set `VSCODE_EXECUTABLE` to reuse an existing VS Code executable.

See [the validation record](../examples/validation.json) for repository scans, scale measurements, and verification limits.
Native host verification remains incomplete. See [the review](../REVIEW.md) for known issues and proposed improvements.

## Troubleshooting

| Problem | Action |
| --- | --- |
| `code` command was not found | Add the VS Code command to PATH, then open a new terminal. |
| Download or checksum error | Retry the installer. It stops before installation when verification fails. |
| No status button or commands | Confirm version 0.1.1 in Extensions. Check **Developer: Show Running Extensions** and **Log (Extension Host)**. |
| Installed, but no colors | Run **Developer: Reload Window**. Enable `explorer.decorations.colors`. |
| Changed files use Git colors | Other decoration providers can take priority. Check an unchanged file. |
| Counts look stale after many changes | Run **Code Heat: Refresh**. See the queue-pressure finding in [REVIEW.md](../REVIEW.md). |
| Some files are missing | Check include/exclude patterns, file-size limits, skipped counts, and the entry budget. |
| Extension is missing in SSH, WSL, or a container | Install the VSIX in that remote extension host. |

## Develop or build from source

Node.js 20 or newer is required for development.

```sh
git clone https://github.com/orYoffe/code-heat.git
cd code-heat
npm ci
npm test
npm run package
code --install-extension explorer-size-heatmap-0.1.1.vsix
```

Press F5 from this repository to launch an Extension Development Host.
The installers use the committed release package; building from source does not update that package automatically.
When replacing a release, update both installers' version, pinned download URL, and checksum together.

## Uninstall

```sh
code --uninstall-extension oryoffe.explorer-size-heatmap
```

Or uninstall **Code Heat** from the Extensions panel.

## License

[MIT](../LICENSE).
