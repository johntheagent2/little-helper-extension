// Content script bootstrap (runs in every frame, all_urls - see manifest.config.ts).
// Wires together boundary-triggered shortcut expansion and the "/" suggestion
// dropdown for both plain fields and contentEditable regions. Templates are
// only ever inserted by typing - there is no popup insert button/message flow
// (see docs/design/phase1-design.md).

import { getStore, subscribeToStore } from '@/lib/storage';
import type { Category, Template, TextStore } from '@/lib/types';
import {
  attachContentEditableExpansionListener,
  attachExpansionListener,
  isPlainTextField,
  ShortcutIndex,
  type PlainTextField,
} from './expander';
import { SlashTriggerController } from './slash-trigger';

const shortcutIndex = new ShortcutIndex();

let expansionEnabled = true;
let boundaryChars = ' \t\n.,;:!?';
let templates: Template[] = [];
let categories: Record<string, Category> = {};
const attachedFields = new Set<PlainTextField>();

async function init() {
  const store = await getStore();
  applyStore(store);
  subscribeToStore(applyStore);
}

function applyStore(store: TextStore) {
  shortcutIndex.update(store);
  templates = Object.values(store.templates);
  categories = store.categories;
  expansionEnabled = store.settings.expansionEnabled;
  boundaryChars = store.settings.triggerDelimiters;
}

// Attach the expansion listener lazily, the first time each plain text field
// is focused, rather than eagerly scanning the whole document (works for
// fields added dynamically after page load too).
document.addEventListener(
  'focusin',
  (e) => {
    const target = e.target as Element | null;
    if (!isPlainTextField(target)) return;
    if (attachedFields.has(target)) return;
    attachedFields.add(target);
    attachExpansionListener(target, shortcutIndex, () => boundaryChars, () => expansionEnabled);
  },
  true
);

// contentEditable regions get a single document-delegated listener instead
// (see attachContentEditableExpansionListener for why: 'input' bubbles, so
// there's no need to attach/track per-element).
attachContentEditableExpansionListener(shortcutIndex, () => boundaryChars, () => expansionEnabled);

// "/" suggestion dropdown - also document-delegated, covers both field types.
new SlashTriggerController({
  getTemplates: () => templates,
  getCategories: () => categories,
  getBoundaryChars: () => boundaryChars,
  isEnabled: () => expansionEnabled,
});

void init();
