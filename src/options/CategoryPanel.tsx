import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { updateStore } from '@/lib/storage';
import type { Category, TextStore } from '@/lib/types';
import { CATEGORY_COLORS } from '@/shared/constants';

interface Props {
  store: TextStore;
  activeCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
}

export function CategoryPanel({ store, activeCategoryId, onSelectCategory }: Props) {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const categories = Object.values(store.categories).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  function nextColor(): string {
    const usedCount = categories.length;
    return CATEGORY_COLORS[usedCount % CATEGORY_COLORS.length];
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const duplicate = categories.some((c) => c.name.toLowerCase() === name.toLowerCase());
    if (duplicate) {
      setError(`A category named "${name}" already exists.`);
      return;
    }
    setError(null);
    const now = Date.now();
    const category: Category = {
      id: uuidv4(),
      name,
      color: nextColor(),
      createdAt: now,
      updatedAt: now,
    };
    await updateStore((current) => ({
      ...current,
      categories: { ...current.categories, [category.id]: category },
    }));
    setNewName('');
  }

  async function handleRename(id: string) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    const duplicate = categories.some(
      (c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) {
      setError(`A category named "${name}" already exists.`);
      return;
    }
    setError(null);
    await updateStore((current) => {
      const existing = current.categories[id];
      if (!existing) return current;
      return {
        ...current,
        categories: {
          ...current.categories,
          [id]: { ...existing, name, updatedAt: Date.now() },
        },
      };
    });
    setRenamingId(null);
  }

  async function handleDelete(id: string) {
    const inUse = Object.values(store.templates).some((t) => t.categoryId === id);
    if (inUse) {
      setError('Cannot delete a category that still has templates. Reassign or delete those templates first.');
      return;
    }
    setError(null);
    if (activeCategoryId === id) onSelectCategory(null);
    await updateStore((current) => {
      const { [id]: _removed, ...rest } = current.categories;
      return { ...current, categories: rest };
    });
  }

  return (
    <div className="category-panel">
      <h2>Categories</h2>
      {error && <div className="form-error">{error}</div>}

      <button
        className={`category-item ${activeCategoryId === null ? 'active' : ''}`}
        onClick={() => onSelectCategory(null)}
      >
        All templates
      </button>

      {categories.map((c) => (
        <div key={c.id} className="category-row">
          {renamingId === c.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRename(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(c.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
            />
          ) : (
            <button
              className={`category-item ${activeCategoryId === c.id ? 'active' : ''}`}
              onClick={() => onSelectCategory(c.id)}
              onDoubleClick={() => {
                setRenamingId(c.id);
                setRenameValue(c.name);
              }}
            >
              <span className="chip-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          )}
          <button
            className="icon-btn"
            title="Delete category"
            onClick={() => handleDelete(c.id)}
          >
            ×
          </button>
        </div>
      ))}

      <div className="category-add">
        <input
          placeholder="New category..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button onClick={handleAdd}>Add</button>
      </div>
    </div>
  );
}
