# Third-party notices

FreeChessCoach's own source code is licensed under the
[PolyForm Noncommercial License 1.0.0](./LICENSE). That license covers only
this repository's code. Third-party software keeps its own license.

## Stockfish (GPL-3.0)

FreeChessCoach uses the [Stockfish](https://stockfishchess.org) chess engine,
which is licensed under the **GNU General Public License v3.0**. Stockfish is
not part of this repository's PolyForm-licensed code; it runs as a separate
program that FreeChessCoach talks to over the UCI protocol.

- **Browser:** the `stockfish` npm package (v19.0.0, WebAssembly build) is
  staged into the web app at build time by `apps/web/scripts/copy-stockfish-assets.mjs`
  and runs in a Web Worker. Its license text is served at
  `/licenses/stockfish-COPYING.txt`.
- **Server:** the engine service image (`docker/Dockerfile.engine`) runs
  Debian's `stockfish` package as a separate process. Its license text is in
  the image at `/licenses/stockfish-copyright`.
- **Source:** <https://github.com/official-stockfish/Stockfish> (the npm build
  is from <https://github.com/nmrugg/stockfish.js>). Debian's package source is
  available from <https://packages.debian.org/source/stockfish>.
- **License text:** [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html), also
  in [`apps/web/public/licenses/stockfish-COPYING.txt`](./apps/web/public/licenses/stockfish-COPYING.txt).

## npm dependencies

All other runtime dependencies are under permissive licenses (MIT, ISC,
BSD-2/3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, Python-2.0), which require
keeping their copyright notices; those are retained in each package's
`node_modules` directory and bundled output. Build-time tools include
`lightningcss` (MPL-2.0), which is not shipped.
