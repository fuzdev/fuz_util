# @fuzdev/fuz_util

[<img src="static/logo.svg" alt="a green sauropod wearing a brown utility belt" align="right" width="256" height="256">](https://util.fuz.dev/)

> utility belt for JS 🦕 ancient not extinct

**[util.fuz.dev](https://util.fuz.dev)**

design:

- kitchen-sink utilities library - sorry, I wish it weren't so, JS made me do it
- two optional runtime dependencies on [`zod`](https://github.com/colinhacks/zod)
  and [`esm-env`](https://github.com/benmccann/esm-env),
  one optional type dependency on `@types/node`
- mix of JS module environments - browser-only, Node-only, universal
- mostly small pure functions
- all TypeScript, for styles and Svelte and SvelteKit
  see <a href="https://github.com/fuz-dev/fuz">@fuzdev/fuz_ui</a>
- complements the modern web platform, drops legacy quickly
- kinda minimal in many ways but also not, treeshakes well
- includes a **zero-dependency** benchmarking library with rich statistical analysis

## usage

Install from [npm](https://www.npmjs.com/package/@fuzdev/fuz_util):

```bash
npm i -D @fuzdev/fuz_util
```

Import modules at their full paths:

```ts
import {type Result, unwrap} from '@fuzdev/fuz_util/result.js';
import {random_int} from '@fuzdev/fuz_util/random.js';
```

`.ts` imports also work:

```ts
import {deep_equal} from '@fuzdev/fuz_util/deep_equal.ts';
```

Docs at [util.fuz.dev/docs](https://util.fuz.dev/docs).

## features

### Benchmarking

See [`src/docs/benchmark.md`](src/docs/benchmark.md).

## build

```bash
npm run build
# or
gro build
```

## test

For more see [Vitest](https://github.com/vitest-dev/vitest)
and [Gro's test docs](https://github.com/feltjs/gro/blob/main/src/docs/test.md).

```bash
gro test
gro test filepattern1 filepatternB
gro test -- --forwarded-args 'to vitest'
```

## deploy

[Deploy](https://github.com/feltjs/gro/blob/main/src/docs/deploy.md)
(build, commit, and push) to the `deploy` branch, e.g. for GitHub Pages:

```bash
npm run deploy
# or
gro deploy
```

## credits 🐢<sub>🐢</sub><sub><sub>🐢</sub></sub>

My sister Lisa helped me with the logo -
[instagram.com/lisaeatkinson](https://www.instagram.com/lisaeatkinson/) -
she's a designer and currently looking for work

## license [🐦](https://wikipedia.org/wiki/Free_and_open-source_software)

[MIT](LICENSE)
