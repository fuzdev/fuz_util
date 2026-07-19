---
'@fuzdev/fuz_util': minor
---

Rebuild `diff.ts` around greedy Myers (breaking):

- `diff_lines` replaces the LCS table with greedy Myers over interned lines — linear memory, common prefix/suffix trimming, and a `max_cost` cap that degrades gracefully to a replace block on unrelated inputs. Changed regions are normalized to removes-before-adds.
- `DiffLine` gains 1-based `a_line`/`b_line` and `no_newline` (git's "no newline at end of file" semantics, no phantom empty final line); `line` is renamed to `text`.
- New `diff_hunks`/`DiffHunk` group changes with context, replacing `filter_diff_context` and its `'...'` sentinel line.
- New `diff_segments` computes intra-line changed-character ranges for paired remove/add lines, with a similarity gate.
- `format_diff` takes hunks and emits unified-diff `@@` headers; colors now go through `print.ts`'s `st` seam (`use_color` removed).
