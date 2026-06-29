// AutoBook — modules/invoices/inv-dashboard.js
// InvoiceOps dashboard: quick-action cards (role-gated), receivables aging,
// and a sales/payments summary with a date-range filter. Real numbers from
// util.receivablesAging()/util.invoiceSalesSummary(); placeholders (avg
// days to pay has no real data source yet, financing/ACH) are badged.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { invoiceAccessLevel } from './invoices-app.js';

const ICONS = {
  invoice: '<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/>',
  quote: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/>',
  customer: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  item: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  payment: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  expense: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2H10a2 2 0 00-2 2v16"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 1h6"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${ICONS[name]}</svg>`; }

let currentPeriod = 'month';

export function renderInvDashboard(mount) {
  const level = invoiceAccessLevel(); // 'full'|'limited'|'read_only'|'none' (page already blocks 'none')
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Quick Actions</div></div>
      <div class="card-body">
        <div class="qa-grid" id="qa-grid"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Total Receivables</div></div>
      <div class="card-body" id="aging-body"></div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">Sales &amp; Payments Summary</div>
        <div class="seg" id="period-toggle">
          <button data-period="today">Today</button>
          <button data-period="week">This Week</button>
          <button data-period="month" class="active">This Month</button>
          <button data-period="year">Last 12 Months</button>
          <button data-period="custom">Custom <span class="badge badge-gray" style="font-size:9px">placeholder</span></button>
        </div>
      </div>
      <div class="card-body" id="summary-body"></div>
    </div>
  `;

  // Each action lists the minimum Invoices access level it needs — Front
  // Desk ('limited') gets payment intake + customer/timer, but not invoice/
  // item/expense creation (those stay 'full'-only, per the role spec).
  const LEVEL_RANK = { none: 0, read_only: 1, limited: 2, full: 3 };
  const actions = [
    { icon: 'invoice', label: 'Add Invoice', href: 'invoices.html#invoices', minLevel: 'full' },
    { icon: 'quote', label: 'Add Estimate / Quote', href: 'quotes.html', minLevel: 'full' },
    { icon: 'customer', label: 'Add Customer', href: 'crm.html', minLevel: 'limited' },
    { icon: 'item', label: 'Add Item / Service', href: 'invoices.html#items', minLevel: 'full' },
    { icon: 'payment', label: 'Record Payment', href: 'invoices.html#invoices', minLevel: 'limited' },
    { icon: 'expense', label: 'Add Expense', href: 'invoices.html#expenses', minLevel: 'full' },
    { icon: 'timer', label: 'Start Labor Timer', placeholder: true, minLevel: 'limited' },
  ].filter((a) => LEVEL_RANK[level] >= LEVEL_RANK[a.minLevel]);

  document.getElementById('qa-grid').innerHTML = actions.map((a) => `
    <div class="qa-card" data-qa="${a.href || ''}" data-placeholder="${a.placeholder ? '1' : ''}">
      ${icon(a.icon)}
      <div class="qa-card-label">${a.label}${a.placeholder ? ' <span class="badge badge-gray" style="font-size:9px">placeholder</span>' : ''}</div>
    </div>`).join('');
  document.querySelectorAll('[data-qa]').forEach((card) => {
    card.addEventListener('click', () => {
      if (card.dataset.placeholder) { import('../../lib/nav.js').then((m) => m.toast('Labor timer is a placeholder — not wired up yet.')); return; }
      if (card.dataset.qa.startsWith('invoices.html#')) location.hash = card.dataset.qa.split('#')[1];
      else if (card.dataset.qa) location.href = card.dataset.qa;
    });
  });

  renderAging();
  renderSummary(currentPeriod);
  document.getElementById('period-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-period]');
    if (!btn) return;
    document.querySelectorAll('#period-toggle button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    renderSummary(currentPeriod);
  });
}

function renderAging() {
  const a = util.receivablesAging();
  const segments = [
    { label: 'Current', value: a.current, color: 'var(--green)' },
    { label: '1–15', value: a.buckets.d1_15.total, color: 'var(--amber)' },
    { label: '16–30', value: a.buckets.d16_30.total, color: '#F0A91B' },
    { label: '31–45', value: a.buckets.d31_45.total, color: '#FF6A2B' },
    { label: '45+', value: a.buckets.d45plus.total, color: 'var(--red)' },
  ];
  const total = a.totalReceivables || 1;
  document.getElementById('aging-body').innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s3)">
      ${statCard('Total Receivables', util.fmtMoney0(a.totalReceivables), `${a.invoiceCount} open invoices`)}
      ${statCard('Current', util.fmtMoney0(a.current))}
      ${statCard('Overdue', util.fmtMoney0(a.overdue), null, a.overdue > 0 ? 'red' : 'green')}
    </div>
    <div class="aging-bar">
      ${segments.map((s) => `<span style="width:${(s.value / total) * 100}%;background:${s.color}" title="${s.label}: ${util.fmtMoney(s.value)}"></span>`).join('')}
    </div>
    <div class="row between" style="flex-wrap:wrap;gap:var(--s3)">
      ${[{ label: 'Current', b: { total: a.current, count: a.buckets.current.count } }, { label: '1–15 days', b: a.buckets.d1_15 }, { label: '16–30 days', b: a.buckets.d16_30 }, { label: '31–45 days', b: a.buckets.d31_45 }, { label: '45+ days', b: a.buckets.d45plus }]
        .map((x) => `<div style="font-size:var(--t-13)"><b class="tnum">${util.fmtMoney0(x.b.total)}</b> <span class="muted">${x.label} · ${x.b.count}</span></div>`).join('')}
    </div>
  `;
}

function renderSummary(period) {
  const s = util.invoiceSalesSummary(period === 'custom' ? 'all' : period);
  document.getElementById('summary-body').innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s3)">
      ${statCard('Total Invoiced', util.fmtMoney0(s.totalInvoiced))}
      ${statCard('Total Paid', util.fmtMoney0(s.totalPaid), null, 'green')}
      ${statCard('Total Outstanding', util.fmtMoney0(s.totalOutstanding), null, s.totalOutstanding > 0 ? 'amber' : 'green')}
      ${statCard('Refunds', util.fmtMoney0(s.refunds))}
      ${statCard('Deposits', util.fmtMoney0(s.deposits))}
      ${statCard('Unpaid Balance', util.fmtMoney0(s.unpaidBalance))}
      ${statCard('Avg Invoice Value', util.fmtMoney0(s.avgInvoiceValue))}
      ${statCard('Avg Days to Pay', s.avgDaysToPay != null ? `${s.avgDaysToPay}d` : '—', 'placeholder framing')}
    </div>
    ${period === 'custom' ? '<div class="empty-sub">Custom date range picker is a placeholder — showing all-time data for now.</div>' : ''}
  `;
}

function statCard(label, value, sub, color) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="${color ? `color:var(--${color})` : ''}">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div>`;
}
