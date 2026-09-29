import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { updateStore } from '@/lib/storage';
import { useTextStore } from '@/lib/useStore';
import type { Template } from '@/lib/types';
import type { TemplateInput } from '@/lib/validation';
import { CategoryPanel } from './CategoryPanel';
import { TemplateForm } from './TemplateForm';
import './App.css';

type Editing = { mode: 'new' } | { mode: 'edit'; template: Template } | null;

export function App() {
  const store = useTextStore();
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Editing>(null);

  const templates = useMemo(() => {
    if (!store) return [];
    const q = query.trim().toLowerCase();
    return Object.values(store.templates)
      .filter((t) => !activeCategoryId || t.categoryId === activeCategoryId)
      .filter(
        (t) =>
          !q ||
          t.title.toLowerCase().includes(q) ||
          t.shortcut.toLowerCase().includes(q) ||
          t.body.toLowerCase().includes(q)
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [store, query, activeCategoryId]);

  async function handleSave(input: TemplateInput) {
    const now = Date.now();
    if (editing?.mode === 'edit') {
      const id = editing.template.id;
      await updateStore((current) => {
        const existing = current.templates[id];
        if (!existing) return current;
        return {
          ...current,
          templates: {
            ...current.templates,
            [id]: { ...existing, ...input, updatedAt: now },
          },
        };
      });
    } else {
      const template: Template = {
        id: uuidv4(),
        ...input,
        createdAt: now,
        updatedAt: now,
      };
      await updateStore((current) => ({
        ...current,
        templates: { ...current.templates, [template.id]: template },
      }));
    }
    setEditing(null);
  }

  async function handleDelete(id: string) {
    await updateStore((current) => {
      const { [id]: _removed, ...rest } = current.templates;
      return { ...current, templates: rest };
    });
  }

  if (!store) {
    return <div className="options-app" />;
  }

  const hasCategories = Object.keys(store.categories).length > 0;

  return (
    <div className="options-app">
      <header className="options-header">
        <h1>TextStore</h1>
        <p>Manage your local templates and categories. Nothing here leaves your device.</p>
      </header>

      <div className="options-body">
        <CategoryPanel
          store={store}
          activeCategoryId={activeCategoryId}
          onSelectCategory={setActiveCategoryId}
        />

        <main className="template-panel">
          <div className="template-panel-toolbar">
            <input
              className="search-input"
              placeholder="Search templates..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="primary-btn"
              disabled={!hasCategories}
              title={hasCategories ? undefined : 'Add a category first'}
              onClick={() => setEditing({ mode: 'new' })}
            >
              + New template
            </button>
          </div>

          {templates.length === 0 ? (
            <div className="empty-state">
              {Object.keys(store.templates).length === 0
                ? 'No templates yet. Create your first one above.'
                : 'No templates match your filters.'}
            </div>
          ) : (
            <table className="template-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Shortcut</th>
                  <th>Category</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => {
                  const category = store.categories[t.categoryId];
                  return (
                    <tr key={t.id}>
                      <td>{t.title}</td>
                      <td>
                        <code>{t.shortcut}</code>
                      </td>
                      <td>
                        {category && (
                          <span className="category-tag">
                            <span className="chip-dot" style={{ background: category.color }} />
                            {category.name}
                          </span>
                        )}
                      </td>
                      <td className="row-actions">
                        <button
                          className="secondary-btn"
                          onClick={() => setEditing({ mode: 'edit', template: t })}
                        >
                          Edit
                        </button>
                        <button className="danger-btn" onClick={() => handleDelete(t.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </main>
      </div>

      {editing && (
        <TemplateForm
          store={store}
          initial={editing.mode === 'edit' ? editing.template : undefined}
          defaultCategoryId={activeCategoryId}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
