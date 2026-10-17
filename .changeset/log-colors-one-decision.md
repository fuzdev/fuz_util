---
'@fuzdev/fuz_util': minor
---

**breaking** fix: `Logger` styles output exactly when its `colors` is true, so `colors: true` forces color on a non-terminal; the default is on only when the global `console` writes to terminal stdout and stderr, `FORCE_COLOR` forces it on or off as in Node, and an empty `NO_COLOR` or `CLAUDECODE` no longer disables it
