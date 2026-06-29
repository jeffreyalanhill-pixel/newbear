// AutoBook — modules/inventory/inv-dashboard.js
// InventoryOps dashboard: summary cards, channel demand, reorder
// suggestions, top movers, margin alerts. All real where util.js computes
// it from db data; clearly placeholder where noted.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

export function renderInvDashboard(mount) {
  const m = util.inventoryDashboardMetrics();
  const channels = util.channelDemand();
  const suggestions = util.reorderSuggestions();

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      ${statCard('Total Inventory Value', util.fmtMoney0(m.totalValue))}
      ${statCard('Low Stock Items (Main)', m.lowStockCount)}
      ${statCard('Open Purchase Orders', m.openPOCount)}
      ${statCard('Items On Order', m.itemsOnOrder)}
      ${statCard('Pending Returns', m.pendingReturns)}
      ${statCard('Transfer Recommendations', m.transferRecommendations, true)}
      ${statCard('Cycle Counts Due', m.cycleCountsDue)}
      ${statCard('Obsolete / Quarantined Qty', m.obsoleteOrQuarantined)}
      ${statCard('Margin Alert Items', m.marginAlertCount)}
    </div>

    <div class="grid-2" style="margin-bottom:var(--s4)">
      <div class="card">
        <div class="card-head"><div class="card-title">Reorder suggestions</div><span class="badge badge-green">real — multi-location aware</span></div>
        <div class="card-body">
          ${suggestions.length
            ? suggestions.map((s) => `
              <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <span>${s.part.name} <span class="muted" style="font-size:var(--t-13)">· ${s.totalAvailable} available</span></span>
                <span class="row" style="gap:var(--s2)">
                  <span class="badge badge-amber">order ${s.suggestedQty}</span>
                  <span class="muted" style="font-size:var(--t-13)">${s.supplier?.name || s.part.vendor || '—'}</span>
                </span>
              </div>`).join('')
            : '<div class="empty-sub">Nothing needs reordering right now.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Channel demand</div></div>
        <div class="card-body">
          ${channels.map((c) => `
            <div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)">
              <span>${c.name}${c.isPlaceholder ? ' <span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</span>
              <span class="badge ${c.isPlaceholder ? 'badge-gray' : 'badge-blue'}">${c.demandQty} units</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Top moving parts</div><span class="badge badge-green">real — from the transaction ledger, last 30 days</span></div>
      <div class="card-body">
        ${m.topMovingParts.length
          ? m.topMovingParts.map((v) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--rule)"><span>${v.part.name}</span><span class="tnum">${v.velocity}/day</span></div>`).join('')
          : '<div class="empty-sub">No usage recorded in the ledger yet.</div>'}
      </div>
    </div>

    <div class="alert alert-amber">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div>Sales/seasonal <b>forecasting</b> and true demand prediction aren't built yet — reorder suggestions above use a simple rule (available ≤ reorder point) plus real recent usage velocity, not AI forecasting.</div>
    </div>
  `;
}

function statCard(label, value, placeholder) {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}${placeholder ? ' <span class="badge badge-gray" style="font-size:10px">placeholder</span>' : ''}</div>
      <div class="stat-value">${value}</div>
    </div>`;
}
