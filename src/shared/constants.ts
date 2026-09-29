// Single storage key holding the whole TextStore JSON blob.
// See docs/design/phase1-design.md §3 for why this is one atomic blob
// rather than per-item keys.
export const STORAGE_KEY = 'textstore.v1';

// Fixed, accessible color palette for categories (no free color picker in Phase 1).
export const CATEGORY_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#F59E0B', // amber
  '#84CC16', // lime
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#6B7280', // gray
] as const;

// Soft cap on a single template's body length (characters).
export const MAX_TEMPLATE_BODY_LENGTH = 20_000;

export const MAX_TITLE_LENGTH = 200;

// Shortcuts are normalized (lowercased, trimmed) and must not contain whitespace.
export const SHORTCUT_PATTERN = /^[^\s]+$/;
