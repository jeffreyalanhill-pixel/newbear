// AutoBook — modules/inventory/inventory-app.js
// InventoryOps sub-app shell: shared icon-rail + a banner + hash-routed
// secondary views (Dashboard, Stock, Purchase Orders, Transfers,
// Returns & Counts, Suppliers & Integrations). Same pattern as
// crm-app.js/quotes-app.js/team-app.js — one shared drawer mount.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { renderNav } from '../../lib/nav.js';
import { renderShareMenu, downloadCSV, downloadJSON, copyToClipboard, printHTML, showMessagePreview } from '../../lib/export.js';
import { renderInvDashboard } from './inv-dashboard.js';
import { renderInvStock } from './inv-stock.js';
import { renderInvPurchaseOrders } from './inv-purchase-orders.js';
import { renderInvTransfers } from './inv-transfers.js';
import { renderInvReturnsCounts } from './inv-returns-counts.js';
import { renderInvSuppliers } from './inv-suppliers-integrations.js';

const VIEWS = {
  dashboard: renderInvDashboard,
  stock: renderInvStock,
  'purchase-orders': renderInvPurchaseOrders,
  transfers: renderInvTransfers,
  'returns-counts': renderInvReturnsCounts,
  suppliers: renderInvSuppliers,
};

export function renderInventoryApp() {
  renderNav('#icon-rail', 'inventory.html');
  document.getElementById('avatar').textContent = (db.settings().owner || '?').charAt(0).toUpperCase();
  document.getElementById('inv-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'inv-overlay') closeInvDrawer();
  });

  renderBanner();

  document.getElementById('inv-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    location.hash = btn.dataset.view;
  });
  window.addEventListener('hashchange', renderCurrentView);
  renderCurrentView();

  renderShareMenu(document.getElementById('inv-share-mount'), [
    { label: 'Print Inventory List', onClick: printInventoryList },
    { label: 'Export Inventory CSV', onClick: exportInventoryCSV },
    { label: 'Export Inventory JSON', onClick: exportInventoryJSON },
    { label: 'Copy Low-Stock Summary', onClick: copyLowStockSummary },
    { divider: true },
    { label: 'Email Low-Stock Report Preview…', onClick: emailLowStockPreview },
    { label: 'Export Purchase Orders CSV', onClick: exportPOsCSV },
    { label: 'Export Cycle Count Report CSV', onClick: exportCycleCountsCSV },
  ]);
}

function renderCurrentView() {
  const view = (location.hash || '#dashboard').slice(1);
  const fn = VIEWS[view] || VIEWS.dashboard;
  document.querySelectorAll('#inv-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  fn(document.getElementById('inv-view-body'));
}

export function refreshInventoryApp() {
  renderBanner();
  renderCurrentView();
}

function renderBanner() {
  const m = util.inventoryDashboardMetrics();
  document.getElementById('inv-banner').innerHTML = `
    <div class="kpi-strip" style="display:flex;align-items:center;justify-content:space-between;gap:var(--s5);flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:var(--s4)">
        <span style="width:48px;height:48px;border-radius:50%;background:var(--panel-2);display:grid;place-items:center;flex-shrink:0">
          ${iconBox()}
        </span>
        <div>
          <div style="color:#fff;font-weight:800;font-size:var(--t-lg);letter-spacing:-.01em">InventoryOps</div>
          <div style="color:var(--panel-txt);font-size:var(--t-13)">Parts, locations, purchase orders, and the transaction ledger behind every number.</div>
        </div>
      </div>
      <div class="row" style="gap:var(--s5);flex-shrink:0;flex-wrap:wrap">
        ${bannerStat('Inventory Value', util.fmtMoney0(m.totalValue))}
        ${bannerStat('Low Stock', m.lowStockCount)}
        ${bannerStat('Open POs', m.openPOCount)}
        ${bannerStat('On Order', m.itemsOnOrder)}
      </div>
    </div>
  `;
}
function bannerStat(label, value) {
  return `<div style="text-align:right"><div class="tnum" style="color:#fff;font-weight:800;font-size:var(--t-2xl);line-height:1">${value}</div><div style="color:var(--panel-txt);font-size:var(--t-13)">${label}</div></div>`;
}
function iconBox() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="22" height="22"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>';
}

export function closeInvDrawer() {
  document.getElementById('inv-overlay').classList.remove('open');
}
export function openInvDrawer(html) {
  document.getElementById('inv-drawer').innerHTML = html;
  document.getElementById('inv-overlay').classList.add('open');
}

// ---------------------------------------------------------------------------
// Share / Export — top-level, whole-inventory exports. Per-PO/per-count
// exports (if any) live next to their own tabs.
// ---------------------------------------------------------------------------
const PART_COLUMNS = [
  { key: 'name', label: 'Name' }, { key: 'sku', label: 'SKU' }, { key: 'category', label: 'Category' },
  { key: 'qtyOnHand', label: 'On Hand (Main)' }, { label: 'Total Available', value: (p) => util.totalAvailableQty(p.id) },
  { key: 'reorderPoint', label: 'Reorder Point' }, { key: 'reorderQty', label: 'Reorder Qty' },
  { key: 'cost', label: 'Cost' }, { key: 'price', label: 'Price' }, { key: 'vendor', label: 'Vendor' },
];
function sortedParts() { return db.parts().slice().sort((a, b) => a.name.localeCompare(b.name)); }

function printInventoryList() {
  const parts = sortedParts();
  printHTML('Inventory', `
    <table>
      <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th class="num">On Hand (Main)</th><th class="num">Total Available</th><th class="num">Reorder Pt</th><th class="num">Cost</th><th class="num">Price</th><th>Vendor</th></tr></thead>
      <tbody>${parts.map((p) => `<tr><td>${p.name}</td><td>${p.sku}</td><td>${p.category}</td><td class="num">${p.qtyOnHand}</td><td class="num">${util.totalAvailableQty(p.id)}</td><td class="num">${p.reorderPoint}</td><td class="num">${util.fmtMoney(p.cost)}</td><td class="num">${util.fmtMoney(p.price)}</td><td>${p.vendor}</td></tr>`).join('')}</tbody>
    </table>
  `);
}
function exportInventoryCSV() { downloadCSV('inventory', sortedParts(), PART_COLUMNS); }
function exportInventoryJSON() { downloadJSON('inventory', sortedParts()); }

function lowStockSummaryLines() {
  const suggestions = util.reorderSuggestions();
  const lines = [`Reorder report — ${suggestions.length} part(s) at or below reorder point (all locations combined)`, ''];
  suggestions.forEach((s) => lines.push(`${s.part.name} (${s.part.sku}) — ${s.totalAvailable} available, suggest ordering ${s.suggestedQty} from ${s.supplier?.name || s.part.vendor}`));
  if (!suggestions.length) lines.push('Nothing needs reordering right now.');
  return lines;
}
function copyLowStockSummary() { copyToClipboard(lowStockSummaryLines().join('\n')); }
function emailLowStockPreview() {
  showMessagePreview({ channel: 'email', to: db.settings().email || '', subject: `Reorder report — ${util.reorderSuggestions().length} part(s) need reordering`, body: lowStockSummaryLines().join('\n') });
}

function exportPOsCSV() {
  const pos = db.purchaseOrders().map((po) => ({ ...po, supplierName: db.supplierById(po.supplierId)?.name || '', destinationName: db.inventoryLocationById(po.destinationLocationId)?.name || '' }));
  downloadCSV('purchase-orders', pos, [
    { key: 'number', label: 'PO #' }, { key: 'supplierName', label: 'Supplier' }, { key: 'status', label: 'Status' },
    { key: 'destinationName', label: 'Destination' }, { key: 'expectedDate', label: 'Expected' },
  ]);
}
function exportCycleCountsCSV() {
  const rows = db.cycleCountItems().map((i) => {
    const count = db.cycleCountById(i.countId);
    const part = db.partById(i.partId);
    return { countNumber: count?.number, location: db.inventoryLocationById(count?.locationId)?.name, partName: part?.name, expectedQty: i.expectedQty, countedQty: i.countedQty, variance: (i.countedQty ?? 0) - i.expectedQty };
  });
  downloadCSV('cycle-counts', rows, [
    { key: 'countNumber', label: 'Count #' }, { key: 'location', label: 'Location' }, { key: 'partName', label: 'Part' },
    { key: 'expectedQty', label: 'Expected' }, { key: 'countedQty', label: 'Counted' }, { key: 'variance', label: 'Variance' },
  ]);
}
