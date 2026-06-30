// AutoBook — modules/reports/rep-inventory.js
// Inventory & Vendors tab: Inventory Summary, Vendor / PO Summary
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint } from './reports-app.js';

export function renderRepInventory(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  const parts = db.parts ? db.parts() : [];
  const pos = db.purchaseOrders ? db.purchaseOrders() : [];
  const suppliers = db.suppliers ? db.suppliers() : [];

  mount.innerHTML = `
    ${renderInventorySummary(parts, label)}
    ${renderVendorSummary(pos, suppliers, start, end, label)}
    ${renderLowStockSection(parts)}
  `;

  wireExports(mount, parts, pos, suppliers, start, end, label);
}

// ---------------------------------------------------------------------------
// Inventory Summary
// ---------------------------------------------------------------------------
function renderInventorySummary(parts, label) {
  const rows = [...parts].sort((a,b) => (a.name||'').localeCompare(b.name||'')).map(p => {
    const onHand = safeNum(p.onHand || p.qty || 0);
    const cost = safeNum(p.cost || 0);
    const price = safeNum(p.price || p.salePrice || 0);
    const value = onHand * cost;
    const margin = price > 0 && cost > 0 ? ((price - cost) / price * 100) : null;
    return {
      _value: value,
      _onHand: onHand,
      sku: p.sku || p.partNumber || '—',
      name: p.name || '—',
      cat: p.category || '—',
      onHand: onHand,
      cost: util.fmtMoney(cost),
      price: util.fmtMoney(price),
      value: util.fmtMoney(value),
      margin: margin != null ? `${margin.toFixed(1)}%` : '—',
    };
  });

  const totalValue = rows.reduce((s, r) => s + r._value, 0);
  const totalSkus = rows.length;
  const lowStock = rows.filter(r => r._onHand <= 0).length;

  const summary = `<div class="row" style="gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-weight:700">${totalSkus}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">SKUs</div></div>
    <div><span class="tnum" style="font-weight:700">${util.fmtMoney(totalValue)}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">On-Hand Value (at cost)</div></div>
    ${lowStock > 0 ? `<div><span class="tnum" style="font-weight:700;color:var(--red)">${lowStock}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Out of Stock</div></div>` : ''}
  </div>`;

  const cols = [
    { key: 'sku', label: 'SKU / Part #' },
    { key: 'name', label: 'Name' },
    { key: 'cat', label: 'Category' },
    { key: 'onHand', label: 'On Hand', num: true },
    { key: 'cost', label: 'Cost', num: true },
    { key: 'price', label: 'Price', num: true },
    { key: 'value', label: 'Value', num: true },
    { key: 'margin', label: 'Margin', num: true },
  ];

  if (!parts.length) {
    return repSection('Inventory Summary', '0 parts',
      '<div class="empty-sub">No parts in inventory. Add parts to track stock levels and value.</div>');
  }

  return repSection('Inventory Summary', `${totalSkus} SKUs · ${util.fmtMoney(totalValue)} total value`,
    summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="inv-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="inv-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// Vendor / PO Summary (filtered by date range)
// ---------------------------------------------------------------------------
function renderVendorSummary(pos, suppliers, start, end, label) {
  const suppById = Object.fromEntries(suppliers.map(s => [s.id, s]));
  const posInRange = pos.filter(po => inRange(po.createdAt || po.orderDate, start, end));

  const vendorMap = {};
  posInRange.forEach(po => {
    const sid = po.supplierId || po.vendorId || '__unknown';
    if (!vendorMap[sid]) vendorMap[sid] = { count: 0, total: 0, statuses: {} };
    vendorMap[sid].count++;
    vendorMap[sid].total += safeNum(po.total || po.amount || 0);
    const st = po.status || 'unknown';
    vendorMap[sid].statuses[st] = (vendorMap[sid].statuses[st] || 0) + 1;
  });

  const rows = Object.entries(vendorMap).sort((a,b) => b[1].total - a[1].total).map(([sid, m]) => {
    const sup = suppById[sid];
    return {
      vendor: sup ? (sup.name || sup.company || `${sup.firstName||''} ${sup.lastName||''}`.trim()) : '—',
      orders: m.count,
      total: util.fmtMoney(m.total),
      statuses: Object.entries(m.statuses).map(([s,n])=>`${n} ${s}`).join(', '),
    };
  });

  const grandTotal = Object.values(vendorMap).reduce((s,v) => s+v.total, 0);

  const cols = [
    { key: 'vendor', label: 'Vendor / Supplier' },
    { key: 'orders', label: 'POs', num: true },
    { key: 'total', label: 'Total Spend', num: true },
    { key: 'statuses', label: 'Statuses' },
  ];

  const footer = rows.length ? `<div style="text-align:right;margin-top:var(--s3);font-weight:700">Total Spend: <span class="tnum">${util.fmtMoney(grandTotal)}</span></div>` : '';

  return repSection('Purchase Orders by Vendor', `${posInRange.length} POs in range`,
    repTable(cols, rows) + footer,
    `<button class="btn btn-sm btn-ghost" data-export="po-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Low Stock Alert
// ---------------------------------------------------------------------------
function renderLowStockSection(parts) {
  const reorderParts = parts.filter(p => {
    const onHand = safeNum(p.onHand || p.qty || 0);
    const reorderAt = safeNum(p.reorderAt || p.reorderPoint || 0);
    return onHand <= reorderAt;
  });

  if (!reorderParts.length) return '';

  const rows = reorderParts.sort((a,b) => safeNum(a.onHand||a.qty||0) - safeNum(b.onHand||b.qty||0)).map(p => ({
    sku: p.sku || p.partNumber || '—',
    name: p.name || '—',
    onHand: safeNum(p.onHand || p.qty || 0),
    reorderAt: safeNum(p.reorderAt || p.reorderPoint || 0),
    supplier: p.supplierName || '—',
  }));

  const cols = [
    { key: 'sku', label: 'SKU' },
    { key: 'name', label: 'Part Name' },
    { key: 'onHand', label: 'On Hand', num: true },
    { key: 'reorderAt', label: 'Reorder At', num: true },
    { key: 'supplier', label: 'Supplier' },
  ];

  return `<div class="card" style="margin-bottom:var(--s4);border-color:var(--amber)">
    <div class="card-head">
      <div class="card-title" style="color:var(--amber)">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:4px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Low Stock Alert
      </div>
      <span class="badge badge-amber">${rows.length}</span>
    </div>
    <div class="card-body" style="overflow-x:auto">${repTable(cols, rows)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, parts, pos, suppliers, start, end, label) {
  const suppById = Object.fromEntries(suppliers.map(s => [s.id, s]));
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      if (key === 'inv-csv') {
        const rows = [['SKU','Name','Category','On Hand','Cost','Price','Value','Margin %']];
        parts.forEach(p => {
          const onHand=safeNum(p.onHand||p.qty||0), cost=safeNum(p.cost||0), price=safeNum(p.price||p.salePrice||0);
          const margin=price>0&&cost>0?((price-cost)/price*100).toFixed(1):'';
          rows.push([p.sku||p.partNumber||'', p.name||'', p.category||'', onHand, cost.toFixed(2), price.toFixed(2), (onHand*cost).toFixed(2), margin]);
        });
        repCsv(rows,'inventory-summary.csv');
      } else if (key === 'inv-print') {
        repPrint(`Inventory Summary`, mount.querySelector(".card").outerHTML);
      } else if (key === 'po-csv') {
        const rows = [['Vendor','PO Date','Total','Status']];
        pos.filter(po=>inRange(po.createdAt||po.orderDate,start,end)).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).forEach(po => {
          const sup=suppById[po.supplierId||po.vendorId];
          rows.push([sup?(sup.name||sup.company||''):'', (po.createdAt||po.orderDate||'').slice(0,10), safeNum(po.total||po.amount||0).toFixed(2), po.status||'']);
        });
        repCsv(rows,'purchase-orders.csv');
      }
    };
  });
}
