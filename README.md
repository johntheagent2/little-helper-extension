# TextStore (Phase 1)

Local, no-account text-expansion browser extension. Save reusable templates and
expand them by typing a shortcut, or typing "/" to pick one from a suggestion
dropdown — in any plain field or contentEditable region on the web. Everything is
stored locally via `chrome.storage.local` — no sign-in, no network calls, no sync,
no background service worker (see
[`docs/design/phase1-design.md`](docs/design/phase1-design.md) for the full
analysis/design and what's deferred to Phase 2).

## Requirements

- Node.js 18+ and npm

## Develop

```sh
npm install
npm run dev
```

This starts Vite in watch mode. Load the extension in Chrome or Edge:

1. Go to `chrome://extensions` (or `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` folder (created by `npm run dev`
   or `npm run build`)

`npm run dev` keeps rebuilding into `dist/` with HMR for the popup/options UI
(via `@crxjs/vite-plugin`); you generally do **not** need to manually reload the
extension for popup/options changes, only after content-script edits or on the
first load.

## Build

```sh
npm run build
```

Outputs a production bundle to `dist/`, loadable the same way as above.

## Typecheck / Lint

```sh
npm run typecheck
npm run lint
```

## Project layout

See `docs/design/phase1-design.md` §8 for the intended structure; source lives
under `src/`:

- `src/content` — content script: shortcut expansion + the "/" suggestion dropdown,
  for both plain `<input>`/`<textarea>` fields and contentEditable regions. No
  background service worker — everything happens in-page (see design doc §4).
- `src/popup` — React popup UI (search/filter, read-only reference list)
- `src/options` — React options page (full template & category CRUD)
- `src/lib` — storage layer, types, validation, shared React hook
- `src/shared` — constants (storage key, category palette, length limits)
