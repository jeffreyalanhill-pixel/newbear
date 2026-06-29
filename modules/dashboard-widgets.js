// AutoBook — modules/dashboard-widgets.js
// Reusable card renderers shared by every role dashboard (modules/role-dashboards.js).
// Each function takes plain data and returns an HTML string using the SAME
// classes the existing Owner dashboard already uses (.card/.stat-card/.badge-*/
// .alert-*/.empty-sub/etc) — no new CSS, no new visual language.
//
// SECURITY/SCOPE NOTE: these widgets render whatever data they're given —
// they do not themselves check permissions. Callers (modules/role-dashboards.js)
// decide which widgets to include per role, based on util.moduleAccessForRole().
// This is demo/UI-only role filtering; real enforcement must happen
// server-side once this app moves to Supabase/a real backend.

function esc(s) { return String(s ?? ''); }

export function kpiCard({ label, value, sub, color = 'blue' }) {
  return `
    <div class="stat-card">
      <div class="stat-head"><span class="stat-icon ${color}"></span><span class="stat-label">${esc(label)}</span></div>
      <div class="stat-value tnum">${esc(value)}</div>
      ${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}
    </div>`;
}

// items: [{ title, sub, badge, badgeClass }]
export function queueCard({ title, icon = '', items = [], emptyText = 'Nothing here right now.', placeholder = false }) {
  return `
    <div class="card">
      <div class="card-head"><div class="card-title">${icon}${esc(title)}</div>${placeholder ? '<span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</div>
      <div class="card-body">
        ${items.length
          ? items.map((it) => `
            <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
              <div>
                <div class="strong" style="color:var(--ink)">${esc(it.title)}</div>
                ${it.sub ? `<div class="muted" style="font-size:var(--t-13)">${esc(it.sub)}</div>` : ''}
              </div>
              ${it.badge ? `<span class="badge ${it.badgeClass || 'badge-gray'}">${esc(it.badge)}</span>` : ''}
            </div>`).join('')
          : `<div class="empty-sub">${esc(emptyText)}</div>`}
      </div>
    </div>`;
}

// columns: [{key,label}], rows: array of plain objects
export function tableCard({ title, icon = '', columns = [], rows = [], emptyText = 'No rows yet.' }) {
  return `
    <div class="card">
      <div class="card-head"><div class="card-title">${icon}${esc(title)}</div></div>
      <div class="card-body" style="padding-top:var(--s3)">
        ${rows.length
          ? `<table class="table">
              <thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
              <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>`
          : `<div class="empty-sub">${esc(emptyText)}</div>`}
      </div>
    </div>`;
}

// items: [{ title, sub }]
export function warningCard({ title = 'Warnings', level = 'amber', items = [] }) {
  if (!items.length) return '';
  return `
    <div class="alert alert-${level}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div><b>${esc(title)}:</b> ${items.map((it) => esc(it.title)).join(' · ')}</div>
    </div>`;
}

// actions: [{ label, href }]
export function quickActionCard({ title = 'Quick actions', actions = [] }) {
  if (!actions.length) return '';
  return `
    <div class="card">
      <div class="card-head"><div class="card-title">${esc(title)}</div></div>
      <div class="card-body row" style="gap:var(--s2);flex-wrap:wrap">
        ${actions.map((a) => `<a class="btn btn-secondary btn-sm" href="${esc(a.href)}">${esc(a.label)}</a>`).join('')}
      </div>
    </div>`;
}

// rows: [{ time, title, sub }]
export function scheduleCard({ title = "Today's Schedule", rows = [], emptyText = 'Nothing scheduled.' }) {
  return `
    <div class="card">
      <div class="card-head"><div class="card-title">${esc(title)}</div></div>
      <div class="card-body">
        ${rows.length
          ? rows.map((r) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span class="tnum muted" style="width:60px;flex-shrink:0">${esc(r.time)}</span><span>${esc(r.title)}${r.sub ? ` <span class="muted">· ${esc(r.sub)}</span>` : ''}</span></div>`).join('')
          : `<div class="empty-sub">${esc(emptyText)}</div>`}
      </div>
    </div>`;
}

// Alias of queueCard for "my assigned work" lists — kept as a distinct
// export so role configs can name intent clearly even though the markup
// is identical.
export const assignedWorkCard = queueCard;

// rows: [{ label, value }]
export function financialSummaryCard({ title = 'Financial Summary', rows = [], placeholder = false }) {
  return `
    <div class="card">
      <div class="card-head"><div class="card-title">${esc(title)}</div>${placeholder ? '<span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</div>
      <div class="card-body">
        ${rows.map((r) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span class="muted">${esc(r.label)}</span><span class="tnum strong">${esc(r.value)}</span></div>`).join('')}
      </div>
    </div>`;
}

// Inventory alert list — thin wrapper over queueCard with the box icon.
export function inventoryAlertCard({ title = 'Inventory Alerts', items = [], emptyText = 'Stock looks healthy.' }) {
  return queueCard({ title, items, emptyText });
}

// Marketing summary — thin wrapper over queueCard.
export function marketingSummaryCard({ title = 'Marketing', items = [], emptyText = 'Nothing queued.', placeholder = false }) {
  return queueCard({ title, items, emptyText, placeholder });
}
