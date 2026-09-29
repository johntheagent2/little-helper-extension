import { useState } from 'react';
import { validateTemplate, type TemplateInput } from '@/lib/validation';
import type { Template, TextStore } from '@/lib/types';
import { MAX_TEMPLATE_BODY_LENGTH, MAX_TITLE_LENGTH } from '@/shared/constants';

interface Props {
  store: TextStore;
  /** undefined = creating a new template; a Template = editing that one. */
  initial?: Template;
  defaultCategoryId?: string | null;
  onSave: (input: TemplateInput) => void | Promise<void>;
  onCancel: () => void;
}

export function TemplateForm({ store, initial, defaultCategoryId, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [shortcut, setShortcut] = useState(initial?.shortcut ?? '');
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? defaultCategoryId ?? Object.keys(store.categories)[0] ?? ''
  );
  const [body, setBody] = useState(initial?.body ?? '');
  const [errors, setErrors] = useState<Partial<Record<keyof TemplateInput, string>>>({});

  const categories = Object.values(store.categories).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateTemplate({ title, shortcut, categoryId, body }, store, initial?.id);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await onSave(result.normalized);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="modal template-form"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2>{initial ? 'Edit template' : 'New template'}</h2>

        <label>
          Title
          <input
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          {errors.title && <div className="form-error">{errors.title}</div>}
        </label>

        <label>
          Shortcut
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="e.g. sig1"
          />
          {errors.shortcut && <div className="form-error">{errors.shortcut}</div>}
        </label>

        <label>
          Category
          {categories.length === 0 ? (
            <div className="form-hint">Add a category on the left first.</div>
          ) : (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {errors.categoryId && <div className="form-error">{errors.categoryId}</div>}
        </label>

        <label>
          Body
          <textarea
            value={body}
            maxLength={MAX_TEMPLATE_BODY_LENGTH}
            rows={8}
            onChange={(e) => setBody(e.target.value)}
          />
          {errors.body && <div className="form-error">{errors.body}</div>}
        </label>

        <div className="modal-actions">
          <button type="button" className="secondary-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-btn">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
