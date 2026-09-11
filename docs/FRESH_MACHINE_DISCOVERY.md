# Fresh-machine discovery — 1.2.1

This release fixes two behaviors exposed by installing AIOS on another Mac.

## Scan budgets

Previously the 15-second deadline started once for the entire scan. A macOS folder-access prompt could consume that deadline, causing every later provider and selected folder to report a scan limit even when those locations were small. Entry counts reset per folder, but elapsed time did not.

Each discovery pass now receives its own processing budget. Time spent inside filesystem operations, including permission waits, is excluded from that processing budget. Entry limits, depth limits, symbolic-link boundaries and cancellation remain active. Cancellation is checked when a blocked filesystem operation returns; AIOS cannot dismiss a macOS permission prompt itself.

An actual processing timeout reports `SCAN_TIMEOUT` for the affected folder. Entry and depth exhaustion still report `SCAN_LIMIT`. Later folders continue independently. Very large folder trees can legitimately reach these bounds; choose specific project folders or exclusions in Settings.

## Invalid resource headers

A Markdown resource whose YAML header cannot be parsed is still discovered and can be inspected in full. AIOS uses the skill folder or filename as its fallback name, labels it **Needs repair**, and groups its warning under **Resource metadata needs review** in Overview. These warnings do not make a completed filesystem scan incomplete or block profiles for unrelated valid MCP definitions. Invalid JSON/TOML provider configurations and unreadable sources still report errors.

This does not make invalid YAML valid for Claude, Codex or Cursor. The native provider may reject the resource too. Transfer and export remain blocked for a resource with invalid metadata until it is repaired. AIOS does not silently modify native files or invent parsed metadata.

### Reviewed header repair

1. In Overview, expand the affected path under Resource metadata needs review and choose **Review file**, or use **Inspect / edit** from the resource page.
2. Select **Preview header repair**. AIOS can propose quoting an unquoted, single-line `name` or `description` containing an ambiguous colon followed by whitespace.
3. Compare the original with the proposed draft. The full body, line endings, byte-order mark and unrelated header text are retained.
4. Check the review checkbox and select **Save changes**. Saving validates syntax, checks the original revision and creates a history backup.

If another process edits the source, save refuses to overwrite it. Headers with ambiguous comments, duplicate fields, multiline values, broken quoting or unrelated syntax are left for manual editing; the app explains when no unambiguous suggestion is available.

## Verification

Regression tests simulate a two-minute filesystem wait without sleeping, a real processing timeout followed by another root, cancellation after a blocked call, invalid metadata alongside valid MCP profiles, exact repair preservation and stale-write rejection. Packaged UI acceptance opens the warning, previews the repair, checks that the source is unchanged before save, verifies the review gate, then saves and confirms the warning clears.

The reported screenshot establishes the parser messages and affected resource types. Its full source headers were not supplied, so this release does not claim that every header on the other machine can be repaired automatically.
