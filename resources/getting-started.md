# Code Heat: Getting started

Code Heat colors the existing VS Code Explorer by file and folder size.
Use the **Code Heat** button in the bottom status bar to reopen this guide.

## Confirm installation

1. Open the Extensions panel with **Cmd+Shift+X** on macOS or **Ctrl+Shift+X** on Windows/Linux.
2. Search for `@installed Code Heat`.
3. Confirm that **Code Heat**, version **0.1.1**, is installed and enabled in this workspace.
4. Open a project with **File → Open Folder**.
5. Run **Developer: Reload Window** if the extension was just installed.

The status bar should show **Code Heat: Indexing**, then **Code Heat: Ready**.
Indexing time depends on the repository and disk.
**Code Heat: Open folder** means a project folder is required.
**Code Heat: Off** means the configuration disables the extension.
**Unsupported workspace** means this window has no supported filesystem root or its settings are invalid.

## See the colors

Expand a source folder in the existing Explorer. Hover over a file or folder to see counts.
File names and optional badges carry the colors. Entire rows do not receive colored backgrounds.

| Item | Green | Dark red |
| --- | --- | --- |
| File | 80 lines or fewer | 1,000 lines or more |
| Folder | Low line and file counts | 1,000 descendant lines or 50 counted files |

Intermediate sizes use yellow and orange. Counts include blank lines and comments.
Unsaved edits update file colors. Saved changes update folder totals.
Git decorations can take priority on changed files. Test an unchanged file if necessary.

## Commands

Open the Command Palette with **Cmd+Shift+P** or **Ctrl+Shift+P**. Type `Code Heat`.

| Command | What it does |
| --- | --- |
| Code Heat: Getting Started | Opens this guide. |
| Code Heat: Show Diagnostics | Opens logs and prints workspace, settings, and scan details. |
| Code Heat: Refresh | Rebuilds counts and clears cached results. |
| Code Heat: Open Configuration | Creates or opens `.explorer-size.json` in a workspace root. |

## Change thresholds

Run **Code Heat: Open Configuration**. Change values and save the JSON file:

```json
{
  "minLines": 80,
  "maxLines": 1000,
  "colorFolders": true,
  "maxFolderLines": 10000,
  "maxFolderFiles": 200,
  "showBadge": true
}
```

This example keeps the file scale and raises folder thresholds for larger repositories.
Defaults work without a configuration file. Each workspace root has its own configuration.
Avoid restricting `include` until default colors work.

## Nothing appears

1. Confirm installation in the Extensions panel. Version 0.1.0 appears as **Explorer Size Heatmap** and has no status button.
2. Confirm the extension is enabled for this workspace and profile.
3. Open a local folder. Virtual repositories such as `github.dev` are not supported.
4. Enable **Explorer: Decorations Colors** in Settings.
5. Check that `.explorer-size.json` does not contain `"enabled": false`.
6. Run **Code Heat: Show Diagnostics** and read the **Code Heat** Output channel.
7. Run **Code Heat: Refresh** if counts look stale.

Dependencies, build outputs, binaries, symlinks, and files above 8 MiB are skipped by default.
Include/exclude patterns and entry limits can also remove files from the index.
If commands are missing, run **Developer: Show Running Extensions** and look for `oryoffe.explorer-size-heatmap`.
Check **Output → Log (Extension Host)** for activation errors if the extension does not run.
For SSH, WSL, or dev containers, install and enable the extension in the remote extension host.

## CLI and HTML reports

The CLI requires a separate installation and Node.js 20 or newer:

```sh
git clone https://github.com/orYoffe/code-heat.git
cd code-heat
npm ci --omit=dev
npm link
```

Run these commands from the folder you want to measure:

```sh
code-size . --format html --out sizes.html --open
code-size . --format csv --out sizes.csv
code-size . --format json --out sizes.json
```

The HTML report opens locally and supports folder navigation, filtering, sorting, and file details.
It requires no server. Run `code-size --help` for all options.

## More documentation

- [README and installation](https://github.com/orYoffe/code-heat#readme)
- [Examples and exports](https://github.com/orYoffe/code-heat/tree/main/examples)
- [Known issues and planned improvements](https://github.com/orYoffe/code-heat/blob/main/REVIEW.md)
