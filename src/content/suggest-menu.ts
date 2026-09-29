// Floating "/" suggestion dropdown, rendered in a shadow root so the host
// page's CSS can't leak in or be affected by it. Vanilla DOM (not React) to
// keep the content script's footprint small and framework-independent.

import type { CaretRect } from './caret';

export interface SuggestItem {
  id: string;
  title: string;
  shortcut: string;
  category?: { name: string; color: string };
}

const MENU_WIDTH = 280;
const MENU_MAX_HEIGHT = 220;

export class SuggestMenu {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private listEl: HTMLDivElement;
  private items: SuggestItem[] = [];
  private selectedIndex = 0;
  private onPick: ((id: string) => void) | null = null;

  constructor() {
    this.host = document.createElement('div');
    this.host.style.position = 'fixed';
    this.host.style.zIndex = '2147483647';
    this.host.style.display = 'none';
    this.host.style.top = '0';
    this.host.style.left = '0';

    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .menu {
        font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
        font-size: 13px;
        background: #ffffff;
        color: #111827;
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        max-height: ${MENU_MAX_HEIGHT}px;
        width: ${MENU_WIDTH}px;
        overflow-y: auto;
      }
      @media (prefers-color-scheme: dark) {
        .menu {
          background: #1f2937;
          color: #f9fafb;
          border-color: rgba(255, 255, 255, 0.15);
        }
      }
      .item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 10px;
        cursor: pointer;
      }
      .item.active {
        background: rgba(37, 99, 235, 0.15);
      }
      .title {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        opacity: 0.7;
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .empty {
        padding: 10px;
        opacity: 0.6;
      }
    `;
    this.listEl = document.createElement('div');
    this.listEl.className = 'menu';
    this.shadow.appendChild(style);
    this.shadow.appendChild(this.listEl);
  }

  setOnPick(cb: (id: string) => void): void {
    this.onPick = cb;
  }

  show(items: SuggestItem[], rect: CaretRect): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    this.items = items;
    this.selectedIndex = 0;
    this.render();
    this.host.style.display = 'block';
    this.position(rect);
  }

  updateItems(items: SuggestItem[], rect: CaretRect): void {
    this.items = items;
    this.selectedIndex = 0;
    this.render();
    this.position(rect);
  }

  private position(rect: CaretRect): void {
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
    let top = rect.bottom + 4;
    if (top + MENU_MAX_HEIGHT > window.innerHeight) {
      top = Math.max(8, rect.top - MENU_MAX_HEIGHT - 4);
    }
    this.host.style.left = `${left}px`;
    this.host.style.top = `${top}px`;
  }

  moveSelection(delta: number): void {
    if (this.items.length === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
    this.render();
  }

  getSelected(): SuggestItem | null {
    return this.items[this.selectedIndex] ?? null;
  }

  hide(): void {
    this.host.style.display = 'none';
  }

  isVisible(): boolean {
    return this.host.style.display !== 'none';
  }

  /** True if `node` is inside this menu (used to ignore outside-click handling correctly). */
  contains(node: Node | null): boolean {
    return !!node && this.host.contains(node);
  }

  private render(): void {
    this.listEl.innerHTML = '';
    if (this.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No matching templates';
      this.listEl.appendChild(empty);
      return;
    }

    this.items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = `item${index === this.selectedIndex ? ' active' : ''}`;

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title;

      const meta = document.createElement('div');
      meta.className = 'meta';
      if (item.category) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.background = item.category.color;
        meta.appendChild(dot);
        const catName = document.createElement('span');
        catName.textContent = item.category.name;
        meta.appendChild(catName);
      }
      const shortcut = document.createElement('span');
      shortcut.textContent = `/${item.shortcut}`;
      meta.appendChild(shortcut);

      row.appendChild(title);
      row.appendChild(meta);

      // mousedown (not click) + preventDefault so the field never loses focus.
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.onPick?.(item.id);
      });

      this.listEl.appendChild(row);
    });

    // Keep the highlighted row visible when arrow-key navigation moves it
    // outside the scrollable list's current viewport.
    const activeRow = this.listEl.children[this.selectedIndex];
    if (activeRow instanceof HTMLElement) {
      activeRow.scrollIntoView({ block: 'nearest' });
    }
  }
}
