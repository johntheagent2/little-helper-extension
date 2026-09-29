import {
  MAX_TEMPLATE_BODY_LENGTH,
  MAX_TITLE_LENGTH,
  SHORTCUT_PATTERN,
} from '@/shared/constants';
import type { Template, TextStore } from './types';

export interface TemplateInput {
  title: string;
  shortcut: string;
  categoryId: string;
  body: string;
}

export type ValidationResult =
  | { ok: true; normalized: TemplateInput }
  | { ok: false; errors: Partial<Record<keyof TemplateInput, string>> };

/**
 * Validate a template form submission. `excludeId` lets edit-in-place skip
 * colliding with itself when checking shortcut uniqueness.
 */
export function validateTemplate(
  input: TemplateInput,
  store: TextStore,
  excludeId?: string
): ValidationResult {
  const errors: Partial<Record<keyof TemplateInput, string>> = {};

  const title = input.title.trim();
  if (!title) errors.title = 'Title is required.';
  else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must be ${MAX_TITLE_LENGTH} characters or fewer.`;
  }

  const shortcut = input.shortcut.trim().toLowerCase();
  if (!shortcut) {
    errors.shortcut = 'Shortcut is required.';
  } else if (!SHORTCUT_PATTERN.test(shortcut)) {
    errors.shortcut = 'Shortcut cannot contain spaces.';
  } else {
    const collision = findTemplateByShortcut(store, shortcut, excludeId);
    if (collision) {
      errors.shortcut = `"${shortcut}" is already used by "${collision.title}".`;
    }
  }

  if (!input.categoryId || !store.categories[input.categoryId]) {
    errors.categoryId = 'Category is required.';
  }

  const body = input.body;
  if (!body.trim()) {
    errors.body = 'Body is required.';
  } else if (body.length > MAX_TEMPLATE_BODY_LENGTH) {
    errors.body = `Body must be ${MAX_TEMPLATE_BODY_LENGTH.toLocaleString()} characters or fewer.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    normalized: { title, shortcut, categoryId: input.categoryId, body },
  };
}

export function findTemplateByShortcut(
  store: TextStore,
  shortcut: string,
  excludeId?: string
): Template | undefined {
  const normalized = shortcut.trim().toLowerCase();
  return Object.values(store.templates).find(
    (t) => t.shortcut === normalized && t.id !== excludeId
  );
}
