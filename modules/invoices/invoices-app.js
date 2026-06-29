// AutoBook — modules/invoices/invoices-app.js
// InvoiceOps sub-app shell: shared icon-rail + a tabbed finance workspace
// (Dashboard / Customers / Estimates / Invoices / Payments / Credit Notes /
// Expenses / Items / Daily Closeout / Accounting Export). Same hash-routed
// tab pattern as modules/inventory/inventory-app.js and modules/team —
// one shared drawer mount per page.
//
// SECURITY/SCOPE NOTE: role gating here is demo/UI-only (driven by the
// "View app as" switcher on the Team page) — see the SECURITY WARNING at
// the top of lib/auth.js. Real enforcement must happen server-side once
// this app moves to Supabase/a real backend.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { renderNav } from '../../lib/nav.js';
import { renderShareMenu, downloadCSV, downloadJSON, printHTML, copyToClipboard } from '../../lib/export.js';
import { renderInvDashboard } from './inv-dashboard.js';
import { renderInvCustomers } from './inv-customers.js';
import { renderInvEstimates } from './inv-estimates.js';
import { renderInvInvoicesList } from './inv-invoices-list.js';
import { renderInvPayments } from './inv-payments.js';
import { renderInvCreditNotes } from './inv-credit-notes.js';
import { renderInvExpenses } from './inv-expenses.js';
import { renderInvItems } from './inv-items.js';
import { renderInvCloseout } from './inv-closeout.js';
import { renderInvAccountingExport } from './inv-accounting-export.js';

const VIEWS = {
  dashboard: renderInvDashboard,
  customers: renderInvCustomers,
  estimates: renderInvEstimates,
  invoices: renderInvInvoicesList,
  payments: renderInvPayments,
  'credit-notes': renderInvCreditNotes,
  expenses: renderInvExpenses,
  items: renderInvItems,
  closeout: renderInvCloseout,
  accounting: renderInvAccountingExport,
};

// Tabs hidden outright when the current demo role has 'none' Invoices
// access. Dashboard/Customers/Estimates/Items stay reachable read-only for
// roles with at least 'limited'/'read_only' (e.g. Front Desk) since those
// are mostly informational; create-heavy tabs (Expenses/Credit Notes) are
// reserved for fuller access. This is intentionally coarse — see
// auth.canUser()/util.moduleAccessForRole() for the underlying levels.
function currentAccessLevel() {
  const employee = db.employeeById(db.settings().currentUserId);
  if (!employee) return 'full';
  return util.moduleAccessForRole(employee.role).access.Invoices;
}

export function invoiceAccessLevel() { return currentAccessLevel(); }
export function canCreateFinanceRecords() { return ['full', 'limited'].includes(currentAccessLevel()); }

export function renderInvoicesApp() {
  renderNav('#icon-rail', 'invoices.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();

  document.getElementById('inv-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'inv-overlay') closeInvDrawer();
  });

  const level = currentAccessLevel();
  if (level === 'none') {
    document.getElementById('inv-tabs').style.display = 'none';
    document.getElementById('inv-view-body').innerHTML = `
      <div class="empty">
        <div class="empty-title">No access to InvoiceOps</div>
        <div class="empty-sub">Your current demo role doesn't have Invoices access. Switch roles from the Team page if this is unexpected.</div>
      </div>`;
    return;
  }
  // Credit Notes/Expenses/Daily Closeout/Accounting Export are finance-admin
  // tabs — only roles with full Invoices access (Owner/Admin, General
  // Manager, Bookkeeper, Advisor) see them. 'limited' (Front Desk) and
  // 'read_only' roles get the informational tabs only.
  if (level !== 'full') {
    ['credit-notes', 'expenses', 'closeout', 'accounting'].forEach((v) => {
      document.querySelector(`#inv-tabs button[data-view="${v}"]`)?.remove();
    });
  }

  document.getElementById('inv-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });
  window.addEventListener('hashchange', renderCurrentView);
  renderCurrentView();

  renderShareMenu(document.getElementById('inv-share-mount'), [
    { label: 'Export Invoices CSV', onClick: () => downloadCSV('invoices', db.invoices().map((i) => ({ number: i.number, customer: util.customerName(db.customerById(i.customerId)), total: i.total, balance: i.balance, status: i.status, issuedAt: i.issuedAt })), [{ key: 'number', label: 'Number' }, { key: 'customer', label: 'Customer' }, { key: 'total', label: 'Total' }, { key: 'balance', label: 'Balance' }, { key: 'status', label: 'Status' }, { key: 'issuedAt', label: 'Issued' }]) },
    { label: 'Export Receivables Aging CSV', onClick: exportAgingCSV },
    { label: 'Export Payments CSV', onClick: exportPaymentsCSV },
    { label: 'Export Expenses CSV', onClick: exportExpensesCSV },
    { divider: true },
    { label: 'Print Receivables Summary', onClick: printAgingSummary },
    { label: 'Copy Receivables Summary', onClick: copyAgingSummary },
  ]);
}

function renderCurrentView() {
  const level = currentAccessLevel();
  let view = (location.hash || '#dashboard').slice(1);
  if (level !== 'full' && ['credit-notes', 'expenses', 'closeout', 'accounting'].includes(view)) view = 'dashboard';
  const fn = VIEWS[view] || VIEWS.dashboard;
  document.querySelectorAll('#inv-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('inv-view-body'));
}

export function refreshInvoicesApp() { renderCurrentView(); }

export function closeInvDrawer() {
  document.getElementById('inv-overlay').classList.remove('open');
}
export function openInvDrawer(html) {
  document.getElementById('inv-drawer').innerHTML = html;
  document.getElementById('inv-overlay').classList.add('open');
}

// ---------------------------------------------------------------------------
function exportAgingCSV() {
  const a = util.receivablesAging();
  const rows = Object.entries(a.buckets).map(([key, b]) => ({ bucket: key, total: b.total, count: b.count }));
  downloadCSV('receivables-aging', rows, [{ key: 'bucket', label: 'Bucket' }, { key: 'total', label: 'Total' }, { key: 'count', label: 'Invoice Count' }]);
}
function exportPaymentsCSV() {
  const rows = util.allPaymentsReceived().map((p) => ({ date: util.fmtDate(p.date), customer: util.customerName(db.customerById(p.customerId)), invoice: p.invoiceNumber, amount: p.amount, method: p.method, reference: p.reference || '' }));
  downloadCSV('payments-received', rows, [{ key: 'date', label: 'Date' }, { key: 'customer', label: 'Customer' }, { key: 'invoice', label: 'Invoice' }, { key: 'amount', label: 'Amount' }, { key: 'method', label: 'Method' }, { key: 'reference', label: 'Reference' }]);
}
function exportExpensesCSV() {
  downloadCSV('expenses', db.expenses(), [{ key: 'date', label: 'Date' }, { key: 'vendor', label: 'Vendor' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount' }, { key: 'paymentMethod', label: 'Method' }, { key: 'status', label: 'Status' }]);
}
function agingSummaryLines() {
  const a = util.receivablesAging();
  return [
    `Receivables aging — ${util.fmtMoney0(a.totalReceivables)} total (${a.invoiceCount} invoices)`,
    `Current: ${util.fmtMoney0(a.current)}`,
    `1-15 days: ${util.fmtMoney0(a.buckets.d1_15.total)} (${a.buckets.d1_15.count})`,
    `16-30 days: ${util.fmtMoney0(a.buckets.d16_30.total)} (${a.buckets.d16_30.count})`,
    `31-45 days: ${util.fmtMoney0(a.buckets.d31_45.total)} (${a.buckets.d31_45.count})`,
    `45+ days: ${util.fmtMoney0(a.buckets.d45plus.total)} (${a.buckets.d45plus.count})`,
  ];
}
function printAgingSummary() { printHTML('Receivables Aging', `<pre>${agingSummaryLines().join('\n')}</pre>`); }
function copyAgingSummary() { copyToClipboard(agingSummaryLines().join('\n')); }
