// AutoBook — modules/reports/rep-sales.js
// Sales & Financial tab: Sales Summary, Tax, By Customer, By Category, By Type, Canned Services
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint, custLink } from './reports-app.js';

export function renderRepSales(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  const invAll = db.invoices();
  const invPaid = invAll.filter(i => i.status === 'paid' && inRange(i.issuedAt, start, end));
  const custs = Object.fromEntries(db.customers().map(c => [c.id, c]));
  const svcs = db.services();
  const svcById = Object.fromEntries(svcs.map(s => [s.id, s]));

  mount.innerHTML = `
    ${salesSummarySection(invPaid, label)}
    ${taxReportSection(invPaid, label)}
    ${byCustomerSection(invPaid, custs, label)}
    ${byCategorySection(invPaid, svcById, label)}
    ${byTypeSection(invPaid, label)}
    ${cannedServicesSection(invPaid, svcs, label)}
  `;

  wireExports(mount, invPaid, custs, svcById, svcs, label, start, end);
}

// ---------------------------------------------------------------------------
// Sales Summary
// ---------------------------------------------------------------------------
function salesSummarySection(invPaid, label) {
  const totalRev = invPaid.reduce((s, i) => s + safeNum(i.total), 0);
  const totalTax = invPaid.reduce((s, i) => s + safeNum(i.tax), 0);
  const aro = invPaid.length > 0 ? totalRev / invPaid.length : 0;

  // group by day
  const dayMap = {};
  invPaid.forEach(inv => {
    const day = (inv.issuedAt || '').slice(0, 10);
    if (!day) return;
    if (!dayMap[day]) dayMap[day] = { date: day, count: 0, revenue: 0, tax: 0 };
    dayMap[day].count++;
    dayMap[day].revenue += safeNum(inv.total);
    dayMap[day].tax += safeNum(inv.tax);
  });
  const rows = Object.values(dayMap).sort((a,b) => b.date.localeCompare(a.date)).map(r => ({
    date: fmtDate(r.date),
    count: r.count,
    revenue: util.fmtMoney(r.revenue),
    aro: util.fmtMoney(r.count > 0 ? r.revenue / r.count : 0),
    tax: util.fmtMoney(r.tax),
  }));

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'count', label: 'Invoices', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
    { key: 'aro', label: 'ARO', num: true },
    { key: 'tax', label: 'Tax', num: true },
  ];

  const summary = `<div class="row" style="gap:var(--s6);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-size:var(--t-xl);font-weight:700">${util.fmtMoney(totalRev)}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Total Revenue</div></div>
    <div><span class="tnum" style="font-size:var(--t-xl);font-weight:700">${invPaid.length}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Paid Invoices</div></div>
    <div><span class="tnum" style="font-size:var(--t-xl);font-weight:700">${util.fmtMoney(aro)}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">ARO</div></div>
    <div><span class="tnum" style="font-size:var(--t-xl);font-weight:700">${util.fmtMoney(totalTax)}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Tax Collected</div></div>
  </div>`;

  return repSection('Sales Summary', label,
    summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="summary-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="summary-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// Sales Tax Report
// ---------------------------------------------------------------------------
function taxReportSection(invPaid, label) {
  const withTax = invPaid.filter(i => safeNum(i.tax) > 0);
  const custs = Object.fromEntries(db.customers().map(c => [c.id, c]));

  const rows = withTax.sort((a,b) => (b.issuedAt||'').localeCompare(a.issuedAt||'')).map(inv => {
    const cust = custs[inv.customerId];
    const subtotal = safeNum(inv.total) - safeNum(inv.tax);
    const rate = subtotal > 0 ? (safeNum(inv.tax) / subtotal * 100).toFixed(2) : '—';
    return {
      num: inv.invoiceNumber || inv.id.slice(0,8),
      customer: custLink(inv.customerId, cust ? `${cust.firstName || ''} ${cust.lastName || ''}`.trim() : ''),
      date: fmtDate((inv.issuedAt || '').slice(0,10)),
      subtotal: util.fmtMoney(subtotal),
      rate: rate !== '—' ? `${rate}%` : '—',
      tax: util.fmtMoney(safeNum(inv.tax)),
      status: inv.status || '—',
    };
  });

  const totalTax = withTax.reduce((s, i) => s + safeNum(i.tax), 0);
  const cols = [
    { key: 'num', label: 'Invoice #' },
    { key: 'customer', label: 'Customer' },
    { key: 'date', label: 'Date' },
    { key: 'subtotal', label: 'Subtotal', num: true },
    { key: 'rate', label: 'Tax Rate', num: true },
    { key: 'tax', label: 'Tax', num: true },
    { key: 'status', label: 'Status' },
  ];

  const footer = withTax.length ? `<div style="text-align:right;margin-top:var(--s3);font-weight:700">Total Tax: <span class="tnum">${util.fmtMoney(totalTax)}</span></div>` : '';

  return repSection('Sales Tax Report', `${withTax.length} invoices with tax`,
    repTable(cols, rows) + footer,
    `<button class="btn btn-sm btn-ghost" data-export="tax-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="tax-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// Sales by Customer
// ---------------------------------------------------------------------------
function byCustomerSection(invPaid, custs, label) {
  const custMap = {};
  invPaid.forEach(inv => {
    const id = inv.customerId || '__unknown';
    if (!custMap[id]) custMap[id] = { id, count: 0, revenue: 0, last: '' };
    custMap[id].count++;
    custMap[id].revenue += safeNum(inv.total);
    const dt = (inv.issuedAt || '').slice(0,10);
    if (dt > custMap[id].last) custMap[id].last = dt;
  });

  const rows = Object.values(custMap).sort((a,b) => b.revenue - a.revenue).map(r => {
    const c = custs[r.id];
    return {
      name: custLink(r.id, c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() : '') || '(Unknown)',
      count: r.count,
      revenue: util.fmtMoney(r.revenue),
      avg: util.fmtMoney(r.count > 0 ? r.revenue / r.count : 0),
      last: r.last ? fmtDate(r.last) : '—',
    };
  });

  const cols = [
    { key: 'name', label: 'Customer' },
    { key: 'count', label: 'Invoices', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
    { key: 'avg', label: 'Avg Invoice', num: true },
    { key: 'last', label: 'Last Invoice' },
  ];

  return repSection('Sales by Customer', `${rows.length} customers`, repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="cust-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="cust-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// Sales by Service Category
// ---------------------------------------------------------------------------
function byCategorySection(invPaid, svcById, label) {
  const catMap = {};
  invPaid.forEach(inv => {
    (inv.lineItems || []).forEach(li => {
      const svc = svcById[li.refId];
      const cat = svc?.category || li.type || 'Other';
      if (!catMap[cat]) catMap[cat] = { cat, count: 0, revenue: 0 };
      catMap[cat].count += safeNum(li.qty || 1);
      catMap[cat].revenue += safeNum(li.price) * safeNum(li.qty || 1);
    });
  });

  const total = Object.values(catMap).reduce((s, c) => s + c.revenue, 0);
  const rows = Object.values(catMap).sort((a,b) => b.revenue - a.revenue).map(r => ({
    cat: r.cat,
    count: r.count,
    revenue: util.fmtMoney(r.revenue),
    pct: total > 0 ? `${(r.revenue / total * 100).toFixed(1)}%` : '0%',
  }));

  const cols = [
    { key: 'cat', label: 'Category' },
    { key: 'count', label: 'Items Sold', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
    { key: 'pct', label: '% of Total', num: true },
  ];

  return repSection('Sales by Service Category', `${rows.length} categories`, repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="cat-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Sales by Line Item Type
// ---------------------------------------------------------------------------
function byTypeSection(invPaid, label) {
  const typeMap = {};
  invPaid.forEach(inv => {
    (inv.lineItems || []).forEach(li => {
      const t = li.type || 'other';
      if (!typeMap[t]) typeMap[t] = { type: t, count: 0, revenue: 0 };
      typeMap[t].count += safeNum(li.qty || 1);
      typeMap[t].revenue += safeNum(li.price) * safeNum(li.qty || 1);
    });
  });

  const total = Object.values(typeMap).reduce((s, c) => s + c.revenue, 0);
  const rows = Object.values(typeMap).sort((a,b) => b.revenue - a.revenue).map(r => ({
    type: capitalize(r.type),
    count: r.count,
    revenue: util.fmtMoney(r.revenue),
    pct: total > 0 ? `${(r.revenue / total * 100).toFixed(1)}%` : '0%',
  }));

  const cols = [
    { key: 'type', label: 'Type' },
    { key: 'count', label: 'Line Items', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
    { key: 'pct', label: '% of Total', num: true },
  ];

  return repSection('Sales by Line Item Type', null, repTable(cols, rows));
}

// ---------------------------------------------------------------------------
// Canned Services Utilization
// ---------------------------------------------------------------------------
function cannedServicesSection(invPaid, svcs, label) {
  const usageMap = {};
  invPaid.forEach(inv => {
    (inv.lineItems || []).forEach(li => {
      if (!li.refId) return;
      if (!usageMap[li.refId]) usageMap[li.refId] = { count: 0, revenue: 0, prices: [] };
      usageMap[li.refId].count += safeNum(li.qty || 1);
      usageMap[li.refId].revenue += safeNum(li.price) * safeNum(li.qty || 1);
      usageMap[li.refId].prices.push(safeNum(li.price));
    });
  });

  const rows = svcs.map(s => {
    const u = usageMap[s.id] || { count: 0, revenue: 0, prices: [] };
    return {
      name: s.name || '—',
      cat: s.category || '—',
      count: u.count,
      revenue: util.fmtMoney(u.revenue),
      avg: u.prices.length ? util.fmtMoney(u.prices.reduce((a,b)=>a+b,0)/u.prices.length) : '—',
    };
  }).filter(r => r.count > 0).sort((a,b) => parseInt(b.count) - parseInt(a.count));

  const cols = [
    { key: 'name', label: 'Service' },
    { key: 'cat', label: 'Category' },
    { key: 'count', label: 'Times Used', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
    { key: 'avg', label: 'Avg Price', num: true },
  ];

  return repSection('Canned Services Utilization', `${rows.length} of ${svcs.length} used`, repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="svc-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, invPaid, custs, svcById, svcs, label, start, end) {
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      if (key === 'summary-csv') {
        const rows = [['Date','Invoices','Revenue','ARO','Tax']];
        const dayMap = {};
        invPaid.forEach(inv => {
          const day = (inv.issuedAt||'').slice(0,10);
          if (!dayMap[day]) dayMap[day] = { count:0, revenue:0, tax:0 };
          dayMap[day].count++; dayMap[day].revenue += safeNum(inv.total); dayMap[day].tax += safeNum(inv.tax);
        });
        Object.entries(dayMap).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([day, r]) => {
          rows.push([day, r.count, r.revenue.toFixed(2), (r.count>0?r.revenue/r.count:0).toFixed(2), r.tax.toFixed(2)]);
        });
        repCsv(rows, `sales-summary.csv`);
      } else if (key === 'summary-print') {
        repPrint(`Sales Summary — ${label}`, mount.querySelector(".card").outerHTML);
      } else if (key === 'tax-csv') {
        const rows = [['Invoice #','Customer','Date','Subtotal','Tax Rate','Tax','Status']];
        invPaid.filter(i => safeNum(i.tax) > 0).forEach(inv => {
          const c = custs[inv.customerId];
          const sub = safeNum(inv.total) - safeNum(inv.tax);
          rows.push([inv.invoiceNumber||inv.id.slice(0,8), c?`${c.firstName||''} ${c.lastName||''}`.trim():'', (inv.issuedAt||'').slice(0,10), sub.toFixed(2), (sub>0?(safeNum(inv.tax)/sub*100).toFixed(2):''), safeNum(inv.tax).toFixed(2), inv.status||'']);
        });
        repCsv(rows, 'sales-tax.csv');
      } else if (key === 'tax-print') {
        repPrint(`Sales Tax — ${label}`, mount.querySelectorAll(".card")[1].outerHTML);
      } else if (key === 'cust-csv') {
        const rows = [['Customer','Invoices','Revenue','Avg Invoice','Last Invoice']];
        const custMap = {};
        invPaid.forEach(inv => {
          const id = inv.customerId||'__unknown';
          if (!custMap[id]) custMap[id]={id,count:0,revenue:0,last:''};
          custMap[id].count++; custMap[id].revenue+=safeNum(inv.total);
          const dt=(inv.issuedAt||'').slice(0,10); if(dt>custMap[id].last) custMap[id].last=dt;
        });
        Object.values(custMap).sort((a,b)=>b.revenue-a.revenue).forEach(r => {
          const c=custs[r.id];
          rows.push([c?`${c.firstName||''} ${c.lastName||''}`.trim():'Unknown', r.count, r.revenue.toFixed(2), (r.count>0?r.revenue/r.count:0).toFixed(2), r.last||'']);
        });
        repCsv(rows, 'sales-by-customer.csv');
      } else if (key === 'cust-print') {
        repPrint(`Sales by Customer — ${label}`, mount.querySelectorAll(".card")[2].outerHTML);
      } else if (key === 'cat-csv') {
        const rows = [['Category','Items Sold','Revenue','% of Total']];
        const catMap = {};
        invPaid.forEach(inv => { (inv.lineItems||[]).forEach(li => { const s=svcById[li.refId]; const cat=s?.category||li.type||'Other'; if(!catMap[cat]) catMap[cat]={count:0,revenue:0}; catMap[cat].count+=safeNum(li.qty||1); catMap[cat].revenue+=safeNum(li.price)*safeNum(li.qty||1); }); });
        const total=Object.values(catMap).reduce((s,c)=>s+c.revenue,0);
        Object.entries(catMap).sort((a,b)=>b[1].revenue-a[1].revenue).forEach(([cat,r])=>{
          rows.push([cat,r.count,r.revenue.toFixed(2),total>0?(r.revenue/total*100).toFixed(1)+'%':'0%']);
        });
        repCsv(rows,'sales-by-category.csv');
      } else if (key === 'svc-csv') {
        const rows = [['Service','Category','Times Used','Revenue','Avg Price']];
        const usageMap={};
        invPaid.forEach(inv=>{(inv.lineItems||[]).forEach(li=>{if(!li.refId)return;if(!usageMap[li.refId])usageMap[li.refId]={count:0,revenue:0,prices:[]};usageMap[li.refId].count+=safeNum(li.qty||1);usageMap[li.refId].revenue+=safeNum(li.price)*safeNum(li.qty||1);usageMap[li.refId].prices.push(safeNum(li.price));});});
        svcs.filter(s=>usageMap[s.id]?.count>0).sort((a,b)=>(usageMap[b.id]?.count||0)-(usageMap[a.id]?.count||0)).forEach(s=>{
          const u=usageMap[s.id];
          rows.push([s.name,s.category||'',u.count,u.revenue.toFixed(2),(u.prices.length?u.prices.reduce((a,b)=>a+b,0)/u.prices.length:0).toFixed(2)]);
        });
        repCsv(rows,'canned-services.csv');
      }
    };
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${Number(m)}/${Number(day)}/${y}`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
