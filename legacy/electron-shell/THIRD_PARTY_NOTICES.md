# Third-Party Notices

DSH Desktop bundles, wraps, or depends on the following third-party
open-source projects. Each keeps its own license and copyright. This file
summarizes the main components; the exact license texts live in each
dependency's published package (`node_modules/.../LICENSE`) and in the
bundled runtime under `runtime/` at build time.

## Core runtime

- **DeepSeek Harness (@deepseek-ai/dsh)**
  License: MIT
  Copyright (c) 2026 DeepSeek
  Bundled as the embedded backend runtime (`runtime/`, packaged as
  `resources/dsh-runtime.tar.gz`).

## Desktop shell

- **Electron**
  License: MIT (plus bundled Chromium and Node.js under their own licenses)
  Copyright (c) Electron contributors. See
  https://github.com/electron/electron/blob/main/LICENSE
- **electron-builder**
  License: MIT
- **Node.js standalone runtime (`resources/node`)**
  License: Node.js is licensed under the MIT license; V8 under the BSD-3-Clause
  license. See https://github.com/nodejs/node/blob/main/LICENSE

## dsh-web-ui plugins (installed into the web profile)

The `@linxin666/*` plugin suite (skin center, skins, aionui panel, task board,
SSH, etc.) is licensed under Apache-2.0, with the following exception:

- **`maid-atelier` skin** is licensed under **CC BY-NC-SA 4.0** and is
  restricted to **non-commercial** use. If it is bundled or redistributed, that
  non-commercial restriction extends to the distribution and its license and
  attribution must be preserved.
  See `packages/dsh-skins/skins/maid-atelier/LICENSE` and `.../NOTICE` in the
  dsh-web-ui source.

## Build-time tooling

- **sharp** — Apache-2.0
- **@resvg/resvg-js** — MPL-2.0

---

This product is an independent wrapper around DeepSeek Harness. "DeepSeek" and
associated marks are trademarks of their respective owners; this project is not
an official DeepSeek product and implies no endorsement.
