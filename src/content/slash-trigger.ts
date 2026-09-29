// "/" suggestion trigger: typing "/" at the start of a word opens a floating,
// keyboard-navigable dropdown of matching templates (filtered as you keep
// typing), in both plain <input>/<textarea> fields and contentEditable
// regions. Enter/Tab/click inserts the selected template's body in place of
// the typed "/query" text; Escape or clicking away cancels.
//
// Independent of the boundary-triggered auto-expansion in expander.ts (typing
// a full shortcut + a boundary char still auto-expands on its own).

import type { Category, Template } from '@/lib/types';
import {
  findContentEditableRoot,
  insertTextIntoContentEditable,
  isPlainTextField,
  type EditableField,
  type PlainTextField,
} from './expander';
import { getCaretRect } from './caret';
import { SuggestMenu, type SuggestItem } from './suggest-menu';

const MAX_RESULTS = 8;

type Context =
  | { kind: 'plain'; field: PlainTextField; value: string; caret: number }
  | { kind: 'ce'; root: HTMLElement; node: Text; value: string; caret: number };

type Session =
  | { kind: 'plain'; field: PlainTextField; triggerIndex: number }
  | { kind: 'ce'; root: HTMLElement; node: Text; triggerOffset: number }
  | null;

export interface SlashTriggerDeps {
  getTemplates: () => Template[];
  getCategories: () => Record<string, Category>;
  getBoundaryChars: () => string;
  isEnabled: () => boolean;
}

export class SlashTriggerController {
  private menu = new SuggestMenu();
  private session: Session = null;
  private isProcessing = false; // guards against reacting to our own synthetic dispatches

  constructor(private deps: SlashTriggerDeps) {
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('focusout', this.onFocusOut, true);
    document.addEventListener('mousedown', this.onMouseDown, true);
    this.menu.setOnPick((id) => this.pick(id));
  }

  dispose(): void {
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('focusout', this.onFocusOut, true);
    document.removeEventListener('mousedown', this.onMouseDown, true);
    this.menu.hide();
  }

  private onInput = (e: Event) => {
    if (this.isProcessing) return;
    if (!this.deps.isEnabled()) {
      if (this.session) this.closeSession();
      return;
    }

    const ctx = this.getContext(e.target as Element | null);
    if (!ctx) return;

    if (!this.session) {
      this.maybeOpen(ctx);
      return;
    }

    if (!this.isSameField(ctx)) {
      this.closeSession();
      this.maybeOpen(ctx);
      return;
    }

    this.updateQuery(ctx);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.session || !this.menu.isVisible()) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        e.stopPropagation();
        this.menu.moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        e.stopPropagation();
        this.menu.moveSelection(-1);
        break;
      case 'Enter':
      case 'Tab': {
        e.preventDefault();
        e.stopPropagation();
        const selected = this.menu.getSelected();
        if (selected) this.pick(selected.id);
        else this.closeSession();
        break;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        this.closeSession();
        break;
      default:
        break; // let it fall through to onInput as normal typing
    }
  };

  private onFocusOut = (e: FocusEvent) => {
    if (!this.session) return;
    const target = e.target as Element | null;
    const sessionEl = this.session.kind === 'plain' ? this.session.field : this.session.root;
    if (target === sessionEl) this.closeSession();
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.session) return;
    if (this.menu.contains(e.target as Node | null)) return; // handled by the menu's own mousedown->pick
    this.closeSession();
  };

  private getContext(target: Element | null): Context | null {
    if (isPlainTextField(target)) {
      return {
        kind: 'plain',
        field: target,
        value: target.value,
        caret: target.selectionStart ?? target.value.length,
      };
    }

    const root = findContentEditableRoot(target);
    if (!root) return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) {
      return null;
    }
    const node = range.startContainer as Text;
    return { kind: 'ce', root, node, value: node.data, caret: range.startOffset };
  }

  private isSameField(ctx: Context): boolean {
    if (!this.session) return false;
    if (this.session.kind === 'plain' && ctx.kind === 'plain') return this.session.field === ctx.field;
    if (this.session.kind === 'ce' && ctx.kind === 'ce') {
      return this.session.root === ctx.root && this.session.node === ctx.node;
    }
    return false;
  }

  private maybeOpen(ctx: Context): void {
    const caret = ctx.caret;
    if (caret === 0) return;
    if (ctx.value[caret - 1] !== '/') return;

    const prevChar = ctx.value[caret - 2];
    const boundaryChars = this.deps.getBoundaryChars();
    if (prevChar !== undefined && !boundaryChars.includes(prevChar)) return; // "/" must start a new word

    this.session =
      ctx.kind === 'plain'
        ? { kind: 'plain', field: ctx.field, triggerIndex: caret - 1 }
        : { kind: 'ce', root: ctx.root, node: ctx.node, triggerOffset: caret - 1 };

    this.showMenu('');
  }

  private updateQuery(ctx: Context): void {
    if (!this.session) return;
    const triggerIndex = this.session.kind === 'plain' ? this.session.triggerIndex : this.session.triggerOffset;

    if (ctx.caret <= triggerIndex || ctx.value[triggerIndex] !== '/') {
      this.closeSession();
      return;
    }

    const query = ctx.value.slice(triggerIndex + 1, ctx.caret);
    const boundaryChars = this.deps.getBoundaryChars();
    if (Array.from(query).some((ch) => boundaryChars.includes(ch))) {
      this.closeSession(); // e.g. a space was typed - abandon the slash command
      return;
    }

    this.showMenu(query);
  }

  private showMenu(query: string): void {
    const field = this.currentField();
    if (!field) {
      this.closeSession();
      return;
    }
    const rect = getCaretRect(field);
    if (!rect) {
      this.closeSession();
      return;
    }
    const items = this.filterTemplates(query);
    if (this.menu.isVisible()) this.menu.updateItems(items, rect);
    else this.menu.show(items, rect);
  }

  private currentField(): EditableField | null {
    if (!this.session) return null;
    return this.session.kind === 'plain' ? this.session.field : this.session.root;
  }

  private filterTemplates(query: string): SuggestItem[] {
    const q = query.trim().toLowerCase();
    const categories = this.deps.getCategories();

    return this.deps
      .getTemplates()
      .filter((t) => !q || t.shortcut.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
      .sort((a, b) => {
        const aPrefix = a.shortcut.toLowerCase().startsWith(q) ? 0 : 1;
        const bPrefix = b.shortcut.toLowerCase().startsWith(q) ? 0 : 1;
        if (aPrefix !== bPrefix) return aPrefix - bPrefix;
        return a.title.localeCompare(b.title);
      })
      .slice(0, MAX_RESULTS)
      .map((t) => {
        const category = categories[t.categoryId];
        return {
          id: t.id,
          title: t.title,
          shortcut: t.shortcut,
          category: category ? { name: category.name, color: category.color } : undefined,
        };
      });
  }

  private pick(id: string): void {
    const template = this.deps.getTemplates().find((t) => t.id === id);
    if (!template || !this.session) {
      this.closeSession();
      return;
    }

    this.isProcessing = true;
    try {
      if (this.session.kind === 'plain') {
        const { field, triggerIndex } = this.session;
        const caret = field.selectionStart ?? field.value.length;
        const before = field.value.slice(0, triggerIndex);
        const after = field.value.slice(caret);
        field.value = before + template.body + after;
        const newCaret = before.length + template.body.length;
        field.setSelectionRange(newCaret, newCaret);
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.focus();
      } else {
        const { node, triggerOffset } = this.session;
        const sel = window.getSelection();
        if (sel) {
          const current = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
          const endOffset =
            current && current.startContainer === node ? current.startOffset : node.data.length;
          const range = document.createRange();
          range.setStart(node, triggerOffset);
          range.setEnd(node, Math.max(triggerOffset, endOffset));
          sel.removeAllRanges();
          sel.addRange(range);
          insertTextIntoContentEditable(template.body);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    this.closeSession();
  }

  private closeSession(): void {
    this.session = null;
    this.menu.hide();
  }
}
