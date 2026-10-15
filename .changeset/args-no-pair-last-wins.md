---
'@fuzdev/fuz_util': patch
---

fix: `args_parse` resolves a `no-x` pair given both ways to the one given last, and keeps `__proto__` as an own key

- a boolean `x` and `no-x` given both ways, as by `-C --color` with `C` an alias of `no-color`, now resolve to the later key of the args, with the other set to its negation: over `argv_parse` output that is the one given last in argv, not counting an alias that gives way to its canonical key or to an earlier alias (`--color -C -c` with `c` an alias of `color` resolves to `no-color`); both came back `true` before; a key whose value is `undefined` counts as not given for which side wins, and a pair given only as `undefined` stays unset
- `argv_parse` orders keys by their last appearance in argv, so a repeated flag counts where it was last given: `--b --a --b` gives keys `a`, `b`, where it gave `b`, `a`; so of two aliases of one key the one whose last use came first wins: `-a x -b y -a z` gives `y`, where it gave `['x', 'z']`
- `args_serialize` keeps the later of a `no-x` and `x` that are both truthy, where it always dropped `no-x`, so its output parses to what `args_parse` gives its input
- an arg named `__proto__` is an own key of what the schema parses, so an `object` schema refuses it as an unknown key (a `loose_object` keeps it unless it applies a default, whose copy drops it); before it was dropped, or with a repeated flag set the prototype to an array
- an entry named like an `Object.prototype` member (`constructor`, `toString`) reads as absent when not given, takes its alias, and syncs as a `no-` pair; the output is still an ordinary object unless a transform returns otherwise

fix: the `glyph` issue of `PackageJson` reads `expected a single unicode character`
