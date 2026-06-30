// AutoBook — lib/drawer.js
// Shared HTML builder helpers and note-wiring for the global Torklio drawer standard.
// CSS lives in style.css (tork-dh, tork-db, tork-ds, tork-dg, tork-dr, tork-dl, tork-dv,
// tork-summary, tork-totals, tork-note, tork-ab-*, tork-link, tork-li-table, tork-stock-pill).
// Import helpers as needed; nothing here touches the DOM at module-evaluation time.

// ---------------------------------------------------------------------------
// Header
// opts: { eyebrow, title, subtitle, badges: string[], closeId? }
// ---------------------------------------------------------------------------
export function torkDrawerHeader({ eyebrow = '', title = '', subtitle = '', badges = [], closeId = 'close-drawer' } = {}) {
  return `
    <div class="tork-dh">
      <div class="tork-dh-meta">
        ${eyebrow ? `<div class="tork-dh-eyebrow">${eyebrow}</div>` : ''}
        <div class="tork-dh-title">${title}</div>
        ${subtitle ? `<div class="tork-dh-sub">${subtitle}</div>` : ''}
        ${badges.length ? `<div class="tork-dh-badges">${badges.join('')}</div>` : ''}
      </div>
      <button class="icon-btn" id="${closeId}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
}

// ---------------------------------------------------------------------------
// Summary card
// main: { label, amount, sub? }   aside: string (html or text)
// ---------------------------------------------------------------------------
export function torkSummaryCard(main = {}, aside = '') {
  return `
    <div class="tork-summary">
      <div class="tork-summary-main">
        ${main.label ? `<div class="tork-summary-label">${main.label}</div>` : ''}
        ${main.amount != null ? `<div class="tork-summary-amount">${main.amount}</div>` : ''}
        ${main.sub ? `<div style="font-size:var(--t-sm);color:var(--ink-3);margin-top:4px">${main.sub}</div>` : ''}
      </div>
      ${aside ? `<div class="tork-summary-aside">${aside}</div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Section wrapper
// title: string, content: html string
// ---------------------------------------------------------------------------
export function torkSection(title, content) {
  return `
    <div class="tork-ds">
      ${title ? `<div class="tork-ds-title">${title}</div>` : ''}
      ${content}
    </div>`;
}

// ---------------------------------------------------------------------------
// Detail grid
// rows: [{ label, value, link?: boolean, action?: string }]
// action: data-* attribute string e.g. 'data-open-customer="id"'
// ---------------------------------------------------------------------------
export function torkDetailGrid(rows = []) {
  if (!rows.length) return '';
  const items = rows.map(({ label, value, link = false, action = '' }) => {
    const valHtml = link
      ? `<button class="tork-dv tork-link" ${action}>${value ?? '—'}</button>`
      : `<div class="tork-dv">${value ?? '—'}</div>`;
    return `
      <div class="tork-dr">
        <div class="tork-dl">${label}</div>
        ${valHtml}
      </div>`;
  });
  return `<div class="tork-dg">${items.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Totals box
// rows: [{ label, value, grand?: boolean }]
// ---------------------------------------------------------------------------
export function torkTotalsBox(rows = []) {
  if (!rows.length) return '';
  const items = rows.map(({ label, value, grand = false }) =>
    `<div class="tork-tot-row${grand ? ' grand' : ''}"><span class="tl">${label}</span><span class="tv">${value}</span></div>`
  );
  return `<div class="tork-totals">${items.join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Note block (view + edit + save + cancel)
// field: unique key, used as data-note-* attribute values
// canEdit: boolean
// hint: optional muted string shown after the label
// ---------------------------------------------------------------------------
export function torkNoteBlock(field, label, value, canEdit, hint = '') {
  const hasContent = value && value.trim();
  const safe = (v) => (v || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div class="tork-note" data-note-field="${field}">
      <div class="tork-note-hd">
        <div>
          <span class="tork-note-kicker">${label}</span>
          ${hint ? `<span class="tork-note-hint"> · ${hint}</span>` : ''}
        </div>
        ${canEdit ? `<button class="tork-note-edit-btn" data-note-edit="${field}">Edit</button>` : ''}
      </div>
      <div data-note-view="${field}">
        ${hasContent
          ? `<div class="tork-note-text">${safe(value)}</div>`
          : `<div class="tork-note-empty">No notes yet.</div>`}
      </div>
      <div data-note-editor="${field}" style="display:none">
        <textarea class="tork-note-textarea" data-note-textarea="${field}" rows="4">${safe(value)}</textarea>
        <div class="tork-note-actions">
          <button class="tork-note-save" data-note-save="${field}">Save</button>
          <button class="tork-note-cancel" data-note-cancel="${field}">Cancel</button>
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// wireTorkNotes — wire all tork-note blocks in a container.
// onSave(field, value) must save the value and return true on success.
// ---------------------------------------------------------------------------
export function wireTorkNotes(container, onSave) {
  container.querySelectorAll('[data-note-edit]').forEach((btn) => {
    const field = btn.dataset.noteEdit;
    btn.addEventListener('click', () => {
      container.querySelector(`[data-note-view="${field}"]`).style.display = 'none';
      container.querySelector(`[data-note-editor="${field}"]`).style.display = '';
      btn.style.display = 'none';
    });
  });
  container.querySelectorAll('[data-note-cancel]').forEach((btn) => {
    const field = btn.dataset.noteCancel;
    btn.addEventListener('click', () => {
      container.querySelector(`[data-note-view="${field}"]`).style.display = '';
      container.querySelector(`[data-note-editor="${field}"]`).style.display = 'none';
      container.querySelector(`[data-note-edit="${field}"]`).style.display = '';
    });
  });
  container.querySelectorAll('[data-note-save]').forEach((btn) => {
    const field = btn.dataset.noteSave;
    btn.addEventListener('click', () => {
      const textarea = container.querySelector(`[data-note-textarea="${field}"]`);
      const val = textarea?.value || '';
      const ok = onSave(field, val);
      if (ok === false) return;
      const safe = val.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const viewEl = container.querySelector(`[data-note-view="${field}"]`);
      viewEl.innerHTML = val.trim()
        ? `<div class="tork-note-text">${safe}</div>`
        : `<div class="tork-note-empty">No notes yet.</div>`;
      viewEl.style.display = '';
      container.querySelector(`[data-note-editor="${field}"]`).style.display = 'none';
      container.querySelector(`[data-note-edit="${field}"]`).style.display = '';
    });
  });
}

// ---------------------------------------------------------------------------
// Action bar HTML builder
// primary: html string (main CTA buttons)
// secondary: html string (print/copy/export/email/text etc.)
// ---------------------------------------------------------------------------
export function torkActionBar(primary = '', secondary = '') {
  return `
    ${primary ? `<div class="tork-ab-primary">${primary}</div>` : ''}
    ${secondary ? `<div class="tork-ab-secondary">${secondary}</div>` : ''}`;
}
