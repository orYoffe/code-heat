# Review and proposed improvements

Reviewed 2026-10-11. This review makes no implementation changes.

## Findings

1. **High: queue overflow can lose folder updates.** `ReadQueue.run` in `src/core.js` resolves `undefined` when its pending budget is full. `HeatmapProvider.updateIndex` in `src/extension.js` returns without scheduling another attempt when the file already exists in the index. Large change batches can therefore leave folder totals stale until Refresh. A controlled provider check changed a file from 20 to 40 lines with queue admission disabled; the index remained at 20. Keep bounded backpressure, but coalesce and retry rejected paths after queue capacity becomes available. Apply the same retry policy to decoration requests and shared scans.

2. **Medium: replacing a regular file with a symlink leaves its old totals.** `fileRecord` in `src/scanner.js` deliberately skips symlinks, returning `undefined`. `updateIndex` treats that result as no update when an old file record exists. A controlled check replaced a counted 40-line file with a symlink: its record and 40 lines remained in the folder index. Distinguish ignored filesystem entries from cancelled or rejected reads, and remove the old record and ancestor contributions when the entry becomes unsupported.

3. **Medium: unrelated changes invalidate all in-flight file results.** `invalidate` increments a workspace-root revision for every text or filesystem event. Reads and updates of unrelated files are rejected or retried when that revision changes. Continuous edits or generated file writes can delay settling across a busy monorepo. Use per-file revisions for content updates and a separate generation for structural scans and configuration changes.

4. **Release verification gap: native VS Code integration remains unverified.** Provider tests use an explicit API stub. The Explorer screenshot is labelled as an illustration, not a live VS Code capture. The previous real-host attempt was rejected by automatic approval review because it triggered telemetry to an untrusted Microsoft endpoint. Before publishing, run the supplied host tests in an approved environment, check Git decoration interaction and light/dark/high-contrast themes, and capture actual Explorer screenshots.

## Product and maintenance improvements

- Offer logarithmic or percentile folder scales. Defaults saturate at 1,000 lines or 50 files, so many large monorepo folders share the same darkest color. Keep absolute thresholds as an option.
- Add theme-specific accessible palettes; the same bright green is currently used for light, dark, and high-contrast themes.
- Make physical lines, nonblank lines, and language-aware code lines explicit selectable metrics. The current count includes comments and blank lines.
- Debounce report filtering and pre-index parent/child relationships to avoid repeatedly filtering and sorting the entire export on each keystroke.
- Add native host CI and targeted regression coverage for queue pressure, symlink replacement, and changes during scans.
- Exclude committed `examples/`, `screenshots/`, `releases/`, and this review from future VSIX packaging so verification artifacts do not inflate extension installs.

## Validation

- Re-ran all 22 unit and mocked-provider tests: passed.
- Compared the five source modules inside the saved 0.1.0 VSIX with the checkout: identical.
- Reproduced findings 1 and 2 with a temporary fixture using the existing mocked provider; no production files were changed.
- Previous repository and scale measurements are retained in `examples/validation.json` and `examples/scale-validation.json`. They were not rerun during this review.
- The source commit reviewed was `bce2fc10d69fe41e7603fdac02e16a5b49f486b3`. New commits add review and delivery artifacts only.
