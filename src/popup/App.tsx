import { useMemo, useState } from 'react';
import { useTextStore } from '@/lib/useStore';
import './App.css';

export function App() {
  const store = useTextStore();
  const [query, setQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

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

  const categories = useMemo(
    () => (store ? Object.values(store.categories).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [store]
  );

  function openOptions() {
    chrome.runtime.openOptionsPage();
  }

  if (!store) {
    return <div className="popup" />;
  }

  return (
    <div className="popup">
      <div className="search-bar">
        <input
          autoFocus
          type="text"
          placeholder="Search templates..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {categories.length > 0 && (
        <div className="chips">
          <button
            className={`chip ${activeCategoryId === null ? 'active' : ''}`}
            onClick={() => setActiveCategoryId(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`chip ${activeCategoryId === c.id ? 'active' : ''}`}
              onClick={() => setActiveCategoryId(c.id)}
            >
              <span className="chip-dot" style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="template-list">
        {templates.length === 0 ? (
          <div className="empty-state">
            {Object.keys(store.templates).length === 0
              ? 'No templates yet. Open "Manage templates" below to add your first one.'
              : 'No templates match your search.'}
          </div>
        ) : (
          templates.map((t) => {
            const category = store.categories[t.categoryId];
            return (
              <div className="template-row" key={t.id}>
                <div className="template-info">
                  <div className="template-title">{t.title}</div>
                  <div className="template-meta">
                    {category && (
                      <span className="chip-dot" style={{ background: category.color }} />
                    )}
                    <span>/{t.shortcut}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="popup-footer">
        <a onClick={openOptions}>Manage templates</a>
      </div>
    </div>
  );
}
