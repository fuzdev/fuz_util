---
'@fuzdev/fuz_util': minor
---

feat: rebuild line diffs from another differ's change regions and parse unified-diff patches in `diff.ts` — `DiffEdit` (a `@@` region tuple), `diff_lines_from_edits` (validated, returns a `Result`), its inverse `diff_edits_from_lines`, and `diff_hunks_parse` (one file's `git diff` text to `DiffHunk`s, `\ No newline` aware, binary patches a distinct failure); both expect exact-text git output (no `-w` and friends, no `--word-diff`, no textconv)
