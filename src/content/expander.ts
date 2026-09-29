// Shortcut auto-expansion logic. Supports plain <input>/<textarea> AND
// generic contentEditable regions (Phase 1 - see docs/design/phase1-design.md
// §1 and §5.2 for the design and its known limitations, e.g. word-matching
// does not cross text-node boundaries inside a contentEditable field).
//
// Templates are only ever inserted by typing (a full shortcut + boundary char
// here, or via the "/" dropdown in slash-trigger.ts) - there is no separate
// "insert at cursor" API, since the popup has no insert button.

import type { Template, TextStore } from '@/lib/types';

export type PlainTextField = HTMLInputElement | HTMLTextAreaElement;
/** A plain field, or the root element of a contentEditable region. */
export type EditableField = PlainTextField | HTMLElement;

export function isPlainTextField(el: Element | null): el is PlainTextField {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    // Only expand/insert into fields where selectionStart/End make sense and
    // that aren't password fields (see risk table §7 in the design doc).
    const textLikeTypes = ['text', 'search', 'url', 'tel', 'email', ''];
    return textLikeTypes.includes(el.type);
  }
  return false;
}

/**
 * Finds the topmost contentEditable ancestor of `start` (its "root" - the
 * element that actually owns the editable region), or null if `start` isn't
 * inside a contentEditable region at all.
 */
export function findContentEditableRoot(start: Element | null): HTMLElement | null {
  if (!(start instanceof HTMLElement) || !start.isContentEditable) return null;
  let el = start;
  while (el.parentElement && el.parentElement.isContentEditable) {
    el = el.parentElement;
  }
  return el;
}

/**
 * Inserts text at the current Selection inside a contentEditable region.
 * Prefers `execCommand('insertText', ...)` since most rich-text editors
 * (including custom ones) listen for the resulting native `input` event and
 * it integrates with the page's own undo stack; falls back to manual Range
 * manipulation + a synthetic InputEvent if execCommand is unavailable.
 */
export function insertTextIntoContentEditable(text: string): void {
  const usedExecCommand =
    document.queryCommandSupported?.('insertText') &&
    document.execCommand('insertText', false, text);
  if (usedExecCommand) return;

  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  sel.removeAllRanges();
  sel.addRange(range);

  const host = findContentEditableRoot(node.parentElement);
  host?.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
  );
}

/** In-memory index of shortcut -> Template, rebuilt whenever the store changes. */
export class ShortcutIndex {
  private index = new Map<string, Template>();

  update(store: TextStore): void {
    this.index = new Map(
      Object.values(store.templates).map((t) => [t.shortcut, t])
    );
  }

  lookup(shortcut: string): Template | undefined {
    return this.index.get(shortcut);
  }
}

/**
 * Given the field's current value/caret and a set of boundary characters,
 * extract the "current word" immediately before the caret (see design doc §5.2).
 */
export function extractCurrentWord(
  value: string,
  caret: number,
  boundaryChars: string
): { word: string; start: number } {
  let start = caret;
  while (start > 0 && !boundaryChars.includes(value[start - 1])) {
    start -= 1;
  }
  return { word: value.slice(start, caret), start };
}

/**
 * Attaches the boundary-triggered shortcut-expansion listener to a plain
 * <input>/<textarea> field. Expansion fires when the user types a boundary
 * character (space, punctuation, etc.) immediately after a recognized
 * shortcut - not mid-word.
 */
export function attachExpansionListener(
  field: PlainTextField,
  shortcutIndex: ShortcutIndex,
  getBoundaryChars: () => string,
  isEnabled: () => boolean
): () => void {
  let isExpanding = false;

  const onInput = () => {
    if (isExpanding) return; // avoid reacting to our own synthetic dispatch below
    if (!isEnabled()) return;
    const boundaryChars = getBoundaryChars();
    const caret = field.selectionStart;
    if (caret === null || caret === 0) return;

    const justTyped = field.value[caret - 1];
    if (!boundaryChars.includes(justTyped)) return; // only trigger right after a boundary char

    const { word, start } = extractCurrentWord(
      field.value.slice(0, caret - 1),
      caret - 1,
      boundaryChars
    );
    if (!word) return;

    const template = shortcutIndex.lookup(word.toLowerCase());
    if (!template) return;

    const before = field.value.slice(0, start);
    const after = field.value.slice(caret); // keeps the boundary char (e.g. the space) after the expansion
    const insertion = template.body;

    field.value = before + insertion + after;
    const newCaret = start + insertion.length + 1; // +1 to land after the retained boundary char
    field.setSelectionRange(newCaret, newCaret);

    isExpanding = true;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    isExpanding = false;
  };

  field.addEventListener('input', onInput);
  return () => field.removeEventListener('input', onInput);
}

/**
 * Attaches a single, document-delegated boundary-triggered shortcut-expansion
 * listener covering every contentEditable region on the page (works for
 * regions added dynamically, unlike per-field attachment).
 *
 * Limitation: only matches a shortcut against text within the same DOM text
 * node as the caret - it does not scan backward across node boundaries. Most
 * editors keep a just-typed word in one text node, but some (e.g. ones that
 * wrap every word in its own <span>) may not match reliably. Documented as a
 * known Phase 1 gap.
 */
export function attachContentEditableExpansionListener(
  shortcutIndex: ShortcutIndex,
  getBoundaryChars: () => string,
  isEnabled: () => boolean
): () => void {
  let isExpanding = false;

  const onInput = (e: Event) => {
    if (isExpanding) return; // avoid reacting to our own synthetic dispatch below
    if (!isEnabled()) return;

    const root = findContentEditableRoot(e.target as Element | null);
    if (!root) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return;
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return;

    const textNode = range.startContainer as Text;
    const caret = range.startOffset;
    if (caret === 0) return;

    const boundaryChars = getBoundaryChars();
    const justTyped = textNode.data[caret - 1];
    if (!boundaryChars.includes(justTyped)) return; // only trigger right after a boundary char

    const { word, start } = extractCurrentWord(
      textNode.data.slice(0, caret - 1),
      caret - 1,
      boundaryChars
    );
    if (!word) return;

    const template = shortcutIndex.lookup(word.toLowerCase());
    if (!template) return;

    const wordRange = document.createRange();
    wordRange.setStart(textNode, start);
    wordRange.setEnd(textNode, caret - 1); // excludes the retained boundary char

    sel.removeAllRanges();
    sel.addRange(wordRange);

    isExpanding = true;
    insertTextIntoContentEditable(template.body);
    isExpanding = false;
  };

  document.addEventListener('input', onInput, true);
  return () => document.removeEventListener('input', onInput, true);
}
