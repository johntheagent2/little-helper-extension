// Data model for TextStore, Phase 1.
// See docs/design/phase1-design.md §3 for the design rationale.

export interface Category {
  id: string; // uuid
  name: string;
  color: string; // hex, chosen from CATEGORY_COLORS (see shared/constants.ts)
  createdAt: number;
  updatedAt: number;
}

export interface Template {
  id: string; // uuid
  title: string;
  shortcut: string; // normalized lowercase, no spaces, e.g. "sig1"
  categoryId: string; // -> Category.id
  body: string; // required, single body - no per-language variants (Phase 1)
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  expansionEnabled: boolean; // global on/off toggle for shortcut auto-expansion
  triggerDelimiters: string; // boundary characters that end a shortcut match
}

export interface TextStore {
  schemaVersion: number; // bumps in Phase 2 when Drive sync + migrations land
  templates: Record<string, Template>;
  categories: Record<string, Category>;
  settings: Settings;
}

export const CURRENT_SCHEMA_VERSION = 1;

export function createEmptyStore(): TextStore {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    templates: {},
    categories: {},
    settings: {
      expansionEnabled: true,
      triggerDelimiters: ' \t\n.,;:!?',
    },
  };
}
