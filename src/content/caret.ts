// Measures the on-screen (viewport-relative) pixel position of the caret, for
// both plain <input>/<textarea> fields and contentEditable regions - used to
// position the "/" suggestion dropdown near the caret (see slash-trigger.ts).

import type { EditableField, PlainTextField } from './expander';

export interface CaretRect {
  top: number;
  left: number;
  bottom: number;
}

export function getCaretRect(field: EditableField): CaretRect | null {
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    return getCaretRectForPlainField(field);
  }
  return getCaretRectForContentEditable(field);
}

function getCaretRectForContentEditable(root: HTMLElement): CaretRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;

  const rects = range.getClientRects();
  const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
  return { top: rect.top, left: rect.left, bottom: rect.bottom };
}

// Mirror-div technique: builds an off-screen div that replicates the field's
// text-affecting CSS, fills it with the text up to the caret, and measures a
// marker span's offset within it. A well-known approach for measuring caret
// pixel position in plain fields (no native API exists for this).
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
] as const;

let mirrorDiv: HTMLDivElement | null = null;

function getMirrorDiv(): HTMLDivElement {
  if (mirrorDiv && mirrorDiv.isConnected) return mirrorDiv;
  mirrorDiv = document.createElement('div');
  mirrorDiv.style.position = 'absolute';
  mirrorDiv.style.visibility = 'hidden';
  mirrorDiv.style.top = '0';
  mirrorDiv.style.left = '-9999px';
  mirrorDiv.style.overflow = 'hidden';
  document.body.appendChild(mirrorDiv);
  return mirrorDiv;
}

function getCaretRectForPlainField(field: PlainTextField): CaretRect | null {
  const position = field.selectionStart ?? field.value.length;
  const div = getMirrorDiv();
  const style = window.getComputedStyle(field);
  const isInput = field instanceof HTMLInputElement;

  div.innerHTML = '';
  for (const prop of MIRRORED_PROPERTIES) {
    (div.style as unknown as Record<string, string>)[prop] = style[prop as keyof CSSStyleDeclaration] as string;
  }
  div.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.width = isInput ? 'auto' : `${field.clientWidth}px`;

  const before = document.createTextNode(field.value.slice(0, position));
  const marker = document.createElement('span');
  marker.textContent = '​'; // zero-width space, just needs to exist to measure a position
  div.appendChild(before);
  div.appendChild(marker);

  const fieldRect = field.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  const top = fieldRect.top + marker.offsetTop - field.scrollTop;
  const left = fieldRect.left + marker.offsetLeft - field.scrollLeft;

  return { top, left, bottom: top + lineHeight };
}
