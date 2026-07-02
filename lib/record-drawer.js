// Torklio — lib/record-drawer.js
// Shared Record Drawer shell: one consistent header / summary card / tab bar /
// body / action row for every major record type (Quote first; Customer, RO,
// Invoice, Customer Care task later). The shell owns STRUCTURE only — each
// record supplies tab render functions and wires its own listeners after
// render. No data-model knowledge lives here.
//
// Usage:
//   renderRecordDrawer(mountEl, {
//     title: 'Q-5001',
//     subtitle: 'Brake job',
//     statusChip: { label: 'Sent', badgeClass: 'badge-blue' },   // optional
//     summary: [{ label: 'Customer', value: 'Maria J.' }, ...],  // optional
//     tabs: [{ id, label, badge?, render(bodyEl) | html string }],
//     defaultTab: 'overview',
//     activeTab: 'items',            // optional explicit override
//     actionsHtml: '<button …>',     // optional persistent footer row
//     onClose(), onTabChange(tabId)  // optional callbacks
//   })
//
// Tab state is remembered on the mount element (data-rd-tab) so callers can
// re-render after a data mutation and stay on the same tab. Returns
// { activeTab, bodyEl } so callers can wire listeners into the fresh body.

export function renderRecordDrawer(mountEl, cfg = {}) {
  if (!mountEl) return null;
  const tabs = Array.isArray(cfg.tabs) ? cfg.tabs : [];
  const requested = cfg.activeTab || mountEl.dataset.rdTab || cfg.defaultTab;
  const tab = tabs.find((t) => t.id === requested) || tabs[0] || null;
  mountEl.dataset.rdTab = tab?.id || '';

  const chip = cfg.statusChip
    ? `<span class="badge ${cfg.statusChip.badgeClass || 'badge-gray'}">${cfg.statusChip.label}</span>`
    : '';
  const summaryHtml = Array.isArray(cfg.summary) && cfg.summary.length
    ? `<div class="rd-summary">${cfg.summary.map((s) => `
        <div class="rd-sum-item">
          <div class="rd-sum-label">${s.label}</div>
          <div class="rd-sum-value">${s.value ?? '—'}</div>
        </div>`).join('')}</div>`
    : '';
  const tabsHtml = tabs.length
    ? `<div class="rd-tabs">${tabs.map((t) => `
        <button class="rd-tab${t.id === tab?.id ? ' active' : ''}" data-rtab="${t.id}">
          ${t.label}${t.badge != null && t.badge !== '' ? ` <span class="rd-tab-badge">${t.badge}</span>` : ''}
        </button>`).join('')}</div>`
    : '';

  mountEl.innerHTML = `
    <div class="rd-head">
      <div class="rd-head-main">
        <div class="rd-title">${cfg.title || ''} ${chip}</div>
        ${cfg.subtitle ? `<div class="rd-subtitle">${cfg.subtitle}</div>` : ''}
      </div>
      <button class="icon-btn rd-close" title="Close" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    ${summaryHtml}
    ${tabsHtml}
    <div class="rd-body"></div>
    ${cfg.actionsHtml ? `<div class="rd-actions">${cfg.actionsHtml}</div>` : ''}
  `;

  mountEl.querySelector('.rd-close')?.addEventListener('click', () => cfg.onClose?.());
  mountEl.querySelectorAll('[data-rtab]').forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.rtab === mountEl.dataset.rdTab) return;
    mountEl.dataset.rdTab = btn.dataset.rtab;
    cfg.onTabChange?.(btn.dataset.rtab);
    renderRecordDrawer(mountEl, { ...cfg, activeTab: btn.dataset.rtab });
  }));

  const bodyEl = mountEl.querySelector('.rd-body');
  if (tab) {
    if (typeof tab.render === 'function') tab.render(bodyEl);
    else bodyEl.innerHTML = tab.render || '';
  }
  return { activeTab: tab?.id || null, bodyEl };
}
