# Code Heat

See where your code is largest. Color files and folders in VS Code, or explore a local HTML size report.

[Quick start](#quick-start) · [Simple guide](#simple-guide) · [CLI](#export-your-own-report) · [Troubleshooting](#nothing-appears-in-vs-code)

## Examples

**Browse the biggest folders and files.** This is the local HTML report for Next.js:

![Next.js folder size report](https://raw.githubusercontent.com/orYoffe/code-heat/main/screenshots/report-server.png)

[Download and open the example HTML](https://github.com/orYoffe/code-heat/raw/main/examples/nextjs-size-report.html) · [JSON](examples/nextjs-sizes.json) · [CSV](examples/nextjs-sizes.csv)

**Explorer colors:** small files are green; large files and folders are red.
This image is an **illustration using real counts, not a live VS Code screenshot**.
Native Explorer decorations color names and badges. The illustration also shows counts inline.

![Explorer color illustration](https://raw.githubusercontent.com/orYoffe/code-heat/main/screenshots/explorer-color-preview.png)

| Next.js example | Physical lines | Default color |
| --- | ---: | --- |
| `crypto-utils.ts` | 77 | Bright green |
| `next-server.ts` | 1,588 | Dark red |
| Server folder | 4,504 | Dark red |

The retained Next.js scan counted **5,374 files and 191,387 lines**.
See [validation details](examples/validation.json) for measurement and testing limits.

## Quick start

Install **VS Code 1.90 or newer**. Make sure its `code` command is available in your terminal.

**Windows — PowerShell:**

```powershell
irm https://raw.githubusercontent.com/orYoffe/code-heat/main/scripts/install.ps1 | iex
```

**macOS / Linux — terminal:**

```sh
curl -fsSL https://raw.githubusercontent.com/orYoffe/code-heat/main/scripts/install.sh | sh
```

Then:

1. Open your project with **File → Open Folder**.
2. Run **Developer: Reload Window** from the Command Palette.
3. Look for **Code Heat: Indexing**, then **Code Heat: Ready** in the bottom status bar.
4. Expand a source folder and hover over a file to see its count.

No configuration file, Git clone, Node.js installation, or build step is needed for the extension.
[Manual installation and PATH setup](docs/reference.md#other-installation-options).

## Simple guide

| What you want | What to do |
| --- | --- |
| Find large files | Look for red file names in the Explorer. |
| Find large folders | Look for red folders. Counts include their descendants. |
| See exact counts | Hover over a file or folder. Capped file reads show “At least”. |
| Open the built-in guide | Click **Code Heat** in the bottom status bar. |
| Change thresholds | Run **Code Heat: Open Configuration** and save `.explorer-size.json`. |
| Rebuild counts | Run **Code Heat: Refresh**. |
| Check what is happening | Run **Code Heat: Show Diagnostics**. |

Open the Command Palette with **Ctrl+Shift+P** on Windows/Linux or **Cmd+Shift+P** on macOS.
Type `Code Heat` to find the commands.

**Default scale:** files are green at **80 lines or fewer** and dark red at **1,000 lines or more**.
Folders reach dark red at **1,000 descendant lines or 50 counted files**.
Intermediate sizes use yellow and orange. Lines include code, comments, and blank lines.
Unsaved edits update file colors. Saved changes update folder totals.

### Example: make folder colors useful in a larger repo

Run **Code Heat: Open Configuration**, then increase the folder thresholds:

```json
{
  "minLines": 80,
  "maxLines": 1000,
  "maxFolderLines": 10000,
  "maxFolderFiles": 200
}
```

This keeps the file scale and gives larger folders more room before they become red.
[All configuration options](docs/reference.md#configure).

## Export your own report

The CLI requires a separate installation and **Node.js 20 or newer**:

```sh
git clone https://github.com/orYoffe/code-heat.git
cd code-heat
npm ci --omit=dev
npm link
```

From the folder you want to measure, choose an output:

```sh
code-size . --format html --out sizes.html --open
code-size . --format csv --out sizes.csv
code-size . --format json --out sizes.json
```

The HTML report opens locally. Click folders, sort by lines, filter paths, and inspect file details.
No server is required. TSV, NDJSON, and Markdown exports are also available.
[CLI reference](docs/reference.md#cli-and-local-reports).

## Nothing appears in VS Code?

1. Open Extensions and search `@installed Code Heat`. Confirm version **0.1.1** is enabled for this workspace.
2. Open a project folder and run **Developer: Reload Window**.
3. Enable **Explorer: Decorations Colors** in Settings.
4. Run **Code Heat: Show Diagnostics** to inspect the **Code Heat** Output channel.

Git colors can take priority on changed files. Check an unchanged source file.
If commands are missing, check **Developer: Show Running Extensions** and **Output → Log (Extension Host)**.
For SSH, WSL, or containers, install the extension in the remote host.

[Full troubleshooting](docs/reference.md#troubleshooting) · [Built-in guide](resources/getting-started.md) · [Known issues](REVIEW.md)

## More

[Counting and monorepo behavior](docs/reference.md#counting-and-monorepo-behavior) · [Development](docs/reference.md#develop-or-build-from-source) · [Verification](docs/reference.md#verification) · [Uninstall](docs/reference.md#uninstall) · [MIT license](LICENSE)
