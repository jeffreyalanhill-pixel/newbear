// AutoBook — modules/invoices/inv-controls.js
// Shared table-control helpers for InvoiceOps tabs: search, filter selects,
// sortable headers, export/print/copy buttons, result count, CSS injection.
// No data logic lives here — each tab passes in its own data and render fn.

let stylesInjected = false;

export function ensureControlStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .tbl-ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0 0 12px}
    .tbl-ctrl-l{display:flex;align-items:center;gap:6px;flex:1;flex-wrap:wrap;min-width:0}
    .tbl-ctrl-r{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap}
    .tbl-ctrl .input{height:32px;padding:0 10px;font-size:var(--t-13);width:200px}
    .tbl-ctrl .select{height:32px;padding:0 30px 0 10px;font-size:var(--t-13);width:auto;min-width:0}
    .tbl-count{font-size:var(--t-sm);color:var(--ink-3);white-space:nowrap}
    th.th-sort{cursor:pointer;user-select:none;white-space:nowrap}
    th.th-sort:hover{color:var(--accent)}
    th.th-sort::after{content:' ↕';opacity:.28;font-size:.75em}
    th.sort-asc::after{content:' ↑';opacity:.8}
    th.sort-desc::after{content:' ↓';opacity:.8}
  `;
  document.head.appendChild(s);
}

// Returns the HTML string for a control bar.
// filters: [{key, all, options:[{value,label}]}]
// actions: [{key, label}]
export function renderControlBar({ searchPlaceholder = 'Search…', filters = [], actions = [] } = {}) {
  ensureControlStyles();
  return `
    <div class="tbl-ctrl">
      <div class="tbl-ctrl-l">
        <input class="input" type="search" placeholder="${searchPlaceholder}" data-tbl-search>
        ${filters.map(f => `
          <select class="select" data-tbl-filter="${f.key}">
            <option value="">${f.all || 'All'}</option>
            ${f.options.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>`).join('')}
        <button class="btn btn-secondary btn-sm" data-tbl-clear style="display:none">Clear</button>
      </div>
      <div class="tbl-ctrl-r">
        <span class="tbl-count" data-tbl-count></span>
        ${actions.map(a => `<button class="btn btn-secondary btn-sm" data-tbl-action="${a.key}">${a.label}</button>`).join('')}
      </div>
    </div>`;
}

// Wire search/filter inputs: calls onChange whenever any control changes.
// Returns a function that reads current {search, filters} values.
export function wireControls(container, onChange) {
  const searchEl  = container.querySelector('[data-tbl-search]');
  const filterEls = [...container.querySelectorAll('[data-tbl-filter]')];
  const clearBtn  = container.querySelector('[data-tbl-clear]');

  const checkClear = () => {
    const active = (searchEl?.value.trim()) || filterEls.some(f => f.value);
    if (clearBtn) clearBtn.style.display = active ? '' : 'none';
    onChange();
  };
  searchEl?.addEventListener('input', checkClear);
  filterEls.forEach(f => f.addEventListener('change', checkClear));
  clearBtn?.addEventListener('click', () => {
    if (searchEl) searchEl.value = '';
    filterEls.forEach(f => { f.value = ''; });
    if (clearBtn) clearBtn.style.display = 'none';
    onChange();
  });

  return () => ({
    search: (searchEl?.value || '').trim().toLowerCase(),
    filters: Object.fromEntries(filterEls.map(f => [f.dataset.tblFilter, f.value])),
  });
}

// Wire click-to-sort on <th data-sort="key" data-sort-type="text|number|money|date">.
// sortState: { key: null, dir: 'asc' } — mutated in place; call onSort() after.
export function wireSortHeaders(thead, sortState, onSort) {
  thead.querySelectorAll('[data-sort]').forEach(th => {
    th.classList.add('th-sort');
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      sortState.dir = sortState.key === key && sortState.dir === 'asc' ? 'desc' : 'asc';
      sortState.key = key;
      thead.querySelectorAll('[data-sort]').forEach(t => {
        t.classList.remove('sort-asc', 'sort-desc');
        if (t.dataset.sort === key) t.classList.add(sortState.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      });
      onSort();
    });
  });
}

// Sort an array of objects. key can be a string field name or accessor fn.
// type: 'text' | 'number' | 'money' | 'date'
export function sortRows(rows, key, dir, type = 'text') {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    let av = typeof key === 'function' ? key(a) : a[key];
    let bv = typeof key === 'function' ? key(b) : b[key];
    if (type === 'money' || type === 'number') {
      av = Number(av) || 0; bv = Number(bv) || 0;
    } else if (type === 'date') {
      av = av ? new Date(av).getTime() : 0;
      bv = bv ? new Date(bv).getTime() : 0;
    } else {
      av = String(av ?? '').toLowerCase();
      bv = String(bv ?? '').toLowerCase();
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });
}

// Update the count label inside a container.
export function updateCount(container, shown, total) {
  const el = container.querySelector('[data-tbl-count]');
  if (!el) return;
  el.textContent = shown === total
    ? `${total} record${total !== 1 ? 's' : ''}`
    : `Showing ${shown} of ${total}`;
}
