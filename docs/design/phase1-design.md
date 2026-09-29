# DinoText — Phase 1 Analysis & Design

**Phase 1 goal:** a fully local, no-account text-expansion extension. Everything in this
doc excludes Google sign-in and Drive sync — those are Phase 2 (see "Out of scope").

- Stack: React + TypeScript, Manifest V3
- Targets: Chrome + Edge (one codebase/build, both Chromium/MV3)
- Storage: `chrome.storage.local`
- Expansion targets: plain `<input>` / `<textarea>` **and** generic `contentEditable`
  regions (e.g. Gmail-style compose boxes, LinkedIn's message box, Slack web). Scope
  was widened from "plain fields only" after testing showed most real-world
  chat/webmail tools use contentEditable, not plain fields - see §5.2a and the known
  limitations there. **Confirmed unsupported: Zalo Web.** Its chat box does not use
  native contentEditable typing at all (verified: no `input` event ever fires there,
  consistent with `contenteditable="false"` on its wrapper plus a custom
  `data-keybinding-context` attribute) - it's a fully custom text-rendering engine,
  exactly the "virtual text model" case called out as unsupported below. Decided not
  to pursue a workaround (e.g. simulating per-character `KeyboardEvent`s) for now -
  see §7.

---

## 1. Scope

### In scope (Phase 1)
- Create / edit / delete templates: title, body, shortcut keyword, category tag
- Single required body per template (no per-language variants — see "Non-goals")
- Type a shortcut in a plain input/textarea or contentEditable region on any page →
  auto-expand to the full body, or type "/" to open a filterable suggestion dropdown
  (see §5.2b) - typing is the only way to insert a template; there is no click-to-insert
  UI (see "Popup is read-only" below)
- Popup: search/filter templates by title, body, or shortcut, as a read-only reference
  list (no insert action - see §4 for why)
- Categories: user-defined, color-coded, used for filtering/grouping in the popup and
  options page
- All data local to the browser profile (`chrome.storage.local`), nothing leaves the
  device

### Out of scope (Phase 1) — deferred to Phase 2
- Google sign-in / OAuth
- Google Drive read/write, cross-device sync, conflict resolution
- Word-matching that crosses DOM text-node boundaries inside a contentEditable
  region (see §5.3a's limitation note), and editors that manage their own virtual
  text model instead of native contentEditable (e.g. some canvas-rendered editors) -
  these may not expand reliably even though contentEditable itself is now supported
- Any analytics or telemetry
- Import/export, backup/restore (nice-to-have candidate for a later phase, not required now)
- Multi-language template bodies (e.g. English/Vietnamese/Chinese variants on one
  template) — a template is one title + one body only for now. Multi-language support
  is a real future need, but bolting on a fixed EN/VI pair doesn't extend to arbitrary
  languages (Chinese, etc.); designing a proper N-language model is deferred to a later
  phase rather than done half-right now. In the meantime, nothing stops a user from
  just creating separate templates with separate shortcuts per language (e.g. `sig-en`,
  `sig-vi`) — the category tag can group them.

### Explicit non-goals
- No server component, no accounts, no network calls at all in Phase 1.

---

## 2. Requirements

### Functional
| ID | Requirement |
|----|-------------|
| F1 | User can create a template with: title (required), body (required), shortcut (required, unique), category (required, from user's list or new) |
| F2 | User can edit and delete existing templates |
| F3 | User can create/rename/delete categories, each with a color |
| F4 | Shortcuts are matched only when typed as a whole "word" (delimited by boundary chars — see §5.2) in an editable plain input/textarea or contentEditable region, then replaced with the template body |
| F5 | Popup lists all templates, supports live search across title/body/shortcut, filterable by category — a read-only reference list, no insert action |
| F5a | Typing "/" at the start of a word in a plain field or contentEditable region opens a floating, keyboard-navigable dropdown listing templates, live-filtered as more characters are typed after the "/"; Enter/Tab/click inserts the highlighted template's body in place of the typed "/query" text, Escape or clicking away cancels |
| F7 | Shortcut keys must be unique across all templates; UI blocks save on collision and shows which template owns it |

### Non-functional
- **Privacy:** no network permissions requested in Phase 1's manifest; nothing is sent anywhere.
- **Performance:** keystroke interception must not add perceptible input lag (target <5ms/keystroke overhead).
- **Resilience:** losing the popup/options page must never lose data mid-edit (debounced autosave or explicit Save with unsaved-changes guard).
- **Data ceiling:** `chrome.storage.local` default quota is ~10MB (raised via `unlimitedStorage` permission if needed) — plenty for text templates; design should still cap a single template body at a sane size (e.g. 20,000 chars) and warn the user near quota.

---

## 3. Data Model

```ts
interface Category {
  id: string;        // uuid
  name: string;
  color: string;      // hex, chosen from a fixed palette
  createdAt: number;
  updatedAt: number;
}

interface Template {
  id: string;          // uuid
  title: string;
  shortcut: string;    // normalized lowercase, no spaces, e.g. "sig1"
  categoryId: string;  // -> Category.id
  body: string;        // required, single body — no per-language variants (see §1)
  createdAt: number;
  updatedAt: number;
}

interface TextStore {
  schemaVersion: number;   // for future migrations (bumps in Phase 2 when Drive sync lands)
  templates: Record<string, Template>;
  categories: Record<string, Category>;
  settings: {
    expansionEnabled: boolean;   // global on/off toggle
    triggerDelimiters: string;   // e.g. default boundary chars, see §5.3
  };
}
```

Stored under a single `chrome.storage.local` key (`textstore.v1`) as one JSON blob.
Rationale: template count is small (tens to low hundreds), so one atomic read/write is
simpler than per-item keys, avoids partial-write races, and maps 1:1 onto the future
Drive-synced file format (a single JSON file in Phase 2 — this schema is designed to be
that file directly, `schemaVersion` included for forward compatibility).

---

## 4. Architecture

Popup, options, and the content script all talk to `chrome.storage.local` directly and
independently — there is **no background service worker** and **no cross-context
messaging** in Phase 1. This is a direct consequence of the popup having no insert
action: the only thing that ever needed a background relay (popup → active tab
"insert this template") no longer exists. Templates are only ever inserted by typing,
entirely inside the content script, in the same frame the user is typing in — nothing
needs to reach across tabs/frames, so there's nothing for a service worker to route.

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Popup (React)          │        │  Options page (React)    │
│  - search/filter        │        │  - full CRUD for         │
│  - read-only list       │        │    templates & categories│
└───────────┬─────────────┘        └────────────┬─────────────┘
            │  chrome.storage.local              │
            │  (shared via a small storage       │
            │   wrapper module, both read/write   │
            │   directly + listen for onChanged)  │
            └───────────────┬─────────────────────┘
                            │
                  ┌─────────▼──────────┐
                  │ chrome.storage.local│
                  │  (source of truth)  │
                  └─────────┬──────────┘
                            │ onChanged
                  ┌─────────▼──────────┐
                  │ Content script      │  injected into all frames
                  │ - keystroke watcher │  (matches("<all_urls>"), see §7)
                  │ - shortcut matcher  │
                  │ - "/" suggest menu  │
                  │ - expand-in-place   │  (all self-contained, no
                  └─────────────────────┘   messaging to other contexts)
```

### Components
1. **Storage module** (`src/lib/storage.ts`) — typed get/set/subscribe wrapper around
   `chrome.storage.local`, used by popup, options, and content script alike. Single
   source of truth; all three surfaces read live via `chrome.storage.onChanged`.
2. **Content script** (`src/content/index.ts` + `expander.ts` + `slash-trigger.ts` +
   `suggest-menu.ts` + `caret.ts`) — attaches lightweight `input`/`keydown` listeners to
   the document (delegated at `document` level, not per-field, so it works with
   dynamically added fields); does its own shortcut matching and template insertion
   in-place, entirely within the page it's running in.
3. **Popup** (`src/popup`) — React app, mounted in the standard MV3 popup page; a
   read-only searchable reference list.
4. **Options page** (`src/options`) — React app, full-page CRUD UI for templates/categories,
   opened via `chrome.runtime.openOptionsPage()` or a link from the popup.

---

## 5. Key Flows

### 5.1 Create/edit a template (Options page)
1. User opens Options (from popup footer link or the extensions menu).
2. Form: title, category (dropdown + "new category" inline), shortcut, body.
3. On save: validate (required fields, shortcut uniqueness, length caps) →
   write to storage module → list re-renders via `onChanged` subscription.

### 5.2 Shortcut auto-expansion flow
1. Content script listens for `input` events on plain input/textarea elements.
2. Maintains a small in-memory index built from storage (`shortcut -> Template`),
   refreshed on `onChanged`.
3. On each `input` event, look backward from the caret to the nearest boundary
   character (default set: space, tab, newline, start-of-field, and common punctuation
   `. , ; : ! ?`) to extract the "current word."
4. If that word matches a known shortcut exactly, replace it in place with the
   template's body, and move the caret to the end of the inserted text.
5. Debounce/guard: only trigger on the boundary-completing keystroke (e.g. typing a
   space/punctuation right after the shortcut, mirroring how most text-expanders like
   TextExpander/aText work) rather than expanding mid-word — avoids surprise expansions
   while still typing a longer word that happens to start with a shortcut.
6. Global on/off toggle (`settings.expansionEnabled`) checked before any of the above,
   for a quick kill-switch (also useful for password fields — see §6 risks).

### 5.2a contentEditable support

Plain fields cover simple web forms, but most chat/webmail-style compose boxes
(Gmail, LinkedIn, Slack web, etc.) are `contentEditable` regions instead, often with
their own toolbar/JS on top. Rather than defer this entirely, Phase 1 adds a
best-effort generic handler:

- **Detection:** `el.isContentEditable` (the platform-computed property, robust to
  editors that toggle the attribute dynamically) walking up to the topmost
  contentEditable ancestor as the field's "root."
- **Listening:** a single document-level, capture-phase `input` listener (delegated,
  since `input` bubbles for contentEditable same as for plain fields) rather than
  per-field attachment - works for regions that don't exist yet at page load.
- **Caret/word detection:** via `window.getSelection()` / `Range`, looking backward
  from the caret **within the same DOM text node only**. This is the main known
  limitation: if an editor splits text across multiple nodes mid-word (uncommon but
  possible with some rich editors), the shortcut may not be recognized.
- **Insertion:** `document.execCommand('insertText', …)` when supported (still
  functional in Chromium despite the API being nominally deprecated) so the page's
  own input/undo handling picks it up like real typing; falls back to manual
  `Range.insertNode` + a synthetic `InputEvent('input', { inputType: 'insertText' })`
  if `execCommand` isn't available.
- **Not guaranteed:** editors that render their own virtual text model instead of
  relying on native contentEditable mutation may not react to either insertion
  method. **Confirmed case: Zalo Web** - its chat box never dispatches a native
  `input` event on typing (verified directly), so neither the expansion listener nor
  the "/" dropdown (§5.2b) can even detect that the user is typing there, let alone
  insert into it. No specific handling for this in Phase 1 - see §7.

### 5.2b "/" suggestion dropdown

Independent of boundary-triggered auto-expansion (§5.2), typing `/` at the start of
a word opens a floating dropdown (implemented in `src/content/slash-trigger.ts`,
`suggest-menu.ts`, `caret.ts`):

- **Open condition:** the character just typed is `/` and the character before it is
  either absent (start of field) or a boundary char (§5.3's delimiter set) — so typing
  a URL like `https://example.com` does not open it.
- **Filtering:** every keystroke after the `/` narrows the list (matches against
  shortcut and title, substring, shortcut-prefix matches ranked first), capped at 8
  results. An empty query (just `/` typed) shows the top matches unfiltered.
- **Navigation:** `ArrowUp`/`ArrowDown` move the highlighted row, `Enter`/`Tab`/click
  inserts it, `Escape` or a click outside the field and menu cancels without inserting.
  These keys are intercepted at the document capture phase so the host page (e.g. a
  chat app that sends the message on Enter) doesn't also react to them while the menu
  is open.
- **Positioning:** a `CaretRect` is computed per keystroke — via `Range.getClientRects()`
  for contentEditable, or a mirror-`<div>` technique (replicating the field's
  font/box CSS to measure a marker span) for plain `<input>`/`<textarea>`, since there
  is no native caret-position API for those. The dropdown itself renders inside a
  shadow root appended to `<html>`, so host-page CSS can't bleed in or be affected.
- **Same word-tracking limitation as §5.2a**: for contentEditable, the session is
  tied to a specific DOM text node; if the editor re-splits that node while the user
  is still typing the query, the dropdown closes rather than misbehaving.
- **Relationship to auto-expansion:** the two mechanisms don't conflict — shortcuts
  stored in `TextStore` don't include a leading `/`, so a bare shortcut typed without
  `/` can still boundary-auto-expand on its own, while `/` always opens the dropdown
  instead of ever auto-expanding immediately.

---

## 6. UI / UX Notes (Phase 1)

- **Popup:** search box at top (autofocus on open), category filter chips, scrollable
  read-only list of templates (title + shortcut + category color dot), footer link
  "Manage templates" → opens Options. No insert action - it's a reference list only;
  templates are inserted by typing the shortcut or "/" directly in the field.
- **Options page:** left column: category list + "Add category"; right: template table/list
  with add/edit/delete, per-row shortcut and category shown; edit opens the template
  form (title/shortcut/category/body).
- **First-run empty state:** short inline explainer + "Add your first template" CTA —
  no onboarding wizard needed for Phase 1.
- Color palette for categories: a fixed small set (8–10 accessible colors) rather than
  a free color picker, to keep the UI simple and consistent.

---

## 7. Risks, Edge Cases & Decisions to revisit

| # | Concern | Phase 1 approach |
|---|---------|-------------------|
| 1 | Sensitive fields (password inputs) | Skip expansion (and the "/" dropdown) on `input[type=password]` entirely |
| 2 | Shortcut collides with a real word the user is typing | Boundary-triggered expansion (not mid-word) + a global toggle + (stretch) per-shortcut "confirm before expanding" is a Phase-2-or-later idea, not required now |
| 3 | Extension needs `<all_urls>` content-script injection to work everywhere | Acceptable for Phase 1 since there's no network activity to abuse; call this out plainly in the store listing's permission justification |
| 4 | iframes (e.g. a text field inside a cross-origin iframe) | Content scripts run per-frame with `all_frames: true`; same-origin iframes work, cross-origin iframes are a known gap — acceptable, document as a limitation |
| 5 | Very large template body vs quota | Soft cap per body (~20k chars) + warn near the `chrome.storage.local` quota; request `unlimitedStorage` permission only if real usage shows it's needed |
| 6 | Undo-ability of an expansion | Rely on the browser/page's native undo (Ctrl+Z) since we dispatch a normal `input` event — no custom undo stack needed in Phase 1 |
| 7 | Multiple templates with same title, different shortcuts | Allowed — only shortcut must be unique, title is just a label |
| 8 | Custom/virtual-DOM text editors that don't dispatch native `input` events (confirmed: Zalo Web) | Accepted as unsupported for Phase 1 - detection is fundamentally impossible via the `input`-event-based approach used here. A per-character synthetic-`KeyboardEvent` simulation was considered as a workaround but not pursued (untested, likely blocked by anti-bot handling on trusted vs. synthetic events, and would need per-site testing) |

---

## 8. Project Structure (proposed)

```
little-helper-extension/
├── docs/
│   └── design/phase1-design.md      (this file)
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── content/
│   │   ├── index.ts                 (bootstrap, mounts listeners)
│   │   ├── expander.ts              (shortcut matching + insert logic)
│   │   ├── slash-trigger.ts         ("/" suggestion dropdown controller)
│   │   ├── suggest-menu.ts          (dropdown UI, shadow-DOM isolated)
│   │   └── caret.ts                 (caret pixel-position measurement)
│   ├── popup/            (React app: main.tsx, App.tsx, components/)
│   ├── options/          (React app: main.tsx, App.tsx, components/)
│   ├── lib/
│   │   ├── storage.ts               (typed chrome.storage.local wrapper)
│   │   ├── types.ts                 (Template/Category/TextStore)
│   │   └── validation.ts
│   └── shared/                      (constants, palette, boundary-char set)
├── package.json
├── tsconfig.json
└── vite.config.ts                   (using @crxjs/vite-plugin or similar MV3 tooling)
```

Manifest permissions for Phase 1: `storage`, content script matches `<all_urls>`.
No `identity`, no `host_permissions` for Google APIs yet — those arrive in Phase 2.

---

## 9. Implementation Milestones

1. **Scaffold** — Vite + React + TS + MV3 build pipeline, empty popup/options/content wired up and loadable as an unpacked extension (no background service worker - nothing needs one).
2. **Storage layer** — types, `storage.ts` wrapper, seed/reset helpers, unit tests.
3. **Options CRUD** — categories + templates full CRUD UI on top of the storage layer.
4. **Popup** — search/filter/list UI, wired to storage, read-only (no insert action).
5. **Content script: shortcut expansion** — boundary-triggered matching + replace-in-place, for both plain fields and contentEditable regions.
6. **Content script: "/" suggestion dropdown** — caret-position measurement, floating menu, keyboard navigation, insert-on-pick.
7. **Polish pass** — empty states, validation errors, shortcut-collision UI, global on/off toggle, password-field exclusion.
8. **Manual test pass** — a matrix of sites (plain `<textarea>` forms, contentEditable chat/webmail compose boxes) + Chrome and Edge.

Phase 2 (not now): Google OAuth via `chrome.identity`, Drive file read/write, sync/merge
logic reconciling local edits with the Drive copy, `schemaVersion` migration.
