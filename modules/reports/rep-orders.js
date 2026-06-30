// AutoBook — modules/reports/rep-orders.js
// Orders & Invoices tab: All ROs, All Estimates, Deferred Services
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint, custLink } from './reports-app.js';

export function renderRepOrders(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  const custs = Object.fromEntries(db.customers().map(c => [c.id, c]));
  const vehs = Object.fromEntries(db.vehicles().map(v => [v.id, v]));
  const emps = Object.fromEntries(db.employees().map(e => [e.id, e]));

  const jobs = db.jobs().filter(j => inRange(j.createdAt, start, end));
  const quotes = db.quotes().filter(q => inRange(q.createdAt, start, end));
  const allQuotes = db.quotes(); // need all for deferred

  mount.innerHTML = `
    ${renderROSection(jobs, custs, vehs, emps, label)}
    ${renderEstimatesSection(quotes, custs, label)}
    ${renderDeferredSection(allQuotes, custs, label)}
  `;

  wireExports(mount, jobs, quotes, allQuotes, custs, vehs, emps, label);
}

// ---------------------------------------------------------------------------
// All Repair Orders
// ---------------------------------------------------------------------------
function renderROSection(jobs, custs, vehs, emps, label) {
  const statusColors = { open: 'amber', in_progress: 'blue', completed: 'green', invoiced: 'green', canceled: 'gray' };

  const rows = [...jobs].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(j => {
    const c = custs[j.customerId];
    const v = vehs[j.vehicleId];
    const tech = emps[j.techId];
    return {
      num: j.roNumber || j.id.slice(0,8),
      date: fmtDate((j.createdAt||'').slice(0,10)),
      customer: custLink(j.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
      vehicle: v ? `${v.year||''} ${v.make||''} ${v.model||''}`.trim() : '—',
      tech: tech ? `${tech.firstName||''} ${tech.lastName||''}`.trim() : '—',
      status: statusBadge(j.status, statusColors[j.status] || 'gray'),
    };
  });

  const counts = jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status]||0)+1; return acc; }, {});
  const summary = `<div class="row" style="gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-weight:700">${jobs.length}</span> <span class="t-sm" style="color:var(--ink-3)">total</span></div>
    ${Object.entries(counts).map(([s,n]) => `<div><span class="tnum" style="font-weight:700">${n}</span> <span class="t-sm" style="color:var(--ink-3)">${s.replace('_',' ')}</span></div>`).join('')}
  </div>`;

  const cols = [
    { key: 'num', label: 'RO #' },
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'vehicle', label: 'Vehicle' },
    { key: 'tech', label: 'Technician' },
    { key: 'status', label: 'Status' },
  ];

  return repSection('All Repair Orders', `${jobs.length} in range`,
    summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="ro-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="ro-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// All Estimates / Quotes
// ---------------------------------------------------------------------------
function renderEstimatesSection(quotes, custs, label) {
  const rows = [...quotes].sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(q => {
    const c = custs[q.customerId];
    const total = (q.lineItems||[]).reduce((s,li) => s + safeNum(li.price)*safeNum(li.qty||1), 0);
    return {
      num: q.quoteNumber || q.id.slice(0,8),
      date: fmtDate((q.createdAt||'').slice(0,10)),
      customer: custLink(q.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
      items: (q.lineItems||[]).length,
      total: util.fmtMoney(total),
      status: statusBadge(q.status, q.status === 'accepted' ? 'green' : q.status === 'declined' ? 'red' : 'amber'),
    };
  });

  const accepted = quotes.filter(q => q.status === 'accepted').length;
  const rate = quotes.length > 0 ? Math.round(accepted/quotes.length*100) : 0;

  const summary = `<div class="row" style="gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-weight:700">${quotes.length}</span> <span style="color:var(--ink-3);font-size:var(--t-13)">estimates</span></div>
    <div><span class="tnum" style="font-weight:700">${accepted}</span> <span style="color:var(--ink-3);font-size:var(--t-13)">accepted</span></div>
    <div><span class="tnum" style="font-weight:700">${rate}%</span> <span style="color:var(--ink-3);font-size:var(--t-13)">acceptance rate</span></div>
  </div>`;

  const cols = [
    { key: 'num', label: 'Estimate #' },
    { key: 'date', label: 'Date' },
    { key: 'customer', label: 'Customer' },
    { key: 'items', label: 'Items', num: true },
    { key: 'total', label: 'Total', num: true },
    { key: 'status', label: 'Status' },
  ];

  return repSection('All Estimates', `${quotes.length} in range`,
    summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="est-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Deferred Services
// ---------------------------------------------------------------------------
function renderDeferredSection(allQuotes, custs, label) {
  const deferred = [];
  allQuotes.forEach(q => {
    const c = custs[q.customerId];
    (q.lineItems||[]).filter(li => li.status === 'deferred').forEach(li => {
      deferred.push({
        customer: custLink(q.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
        service: li.name || li.type || '—',
        price: util.fmtMoney(safeNum(li.price)),
        date: fmtDate((q.createdAt||'').slice(0,10)),
        quoteNum: q.quoteNumber || q.id.slice(0,8),
      });
    });
  });

  deferred.sort((a,b) => (b.date||'').localeCompare(a.date||''));

  const totalValue = allQuotes.reduce((s, q) =>
    s + (q.lineItems||[]).filter(li=>li.status==='deferred').reduce((ss,li)=>ss+safeNum(li.price),0), 0);

  const summary = deferred.length
    ? `<div style="margin-bottom:var(--s3)"><strong>${deferred.length}</strong> deferred items · <strong>${util.fmtMoney(totalValue)}</strong> total deferred value</div>`
    : '';

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'quoteNum', label: 'Estimate #' },
    { key: 'customer', label: 'Customer' },
    { key: 'service', label: 'Deferred Service' },
    { key: 'price', label: 'Price', num: true },
  ];

  return repSection('Deferred Services', `${deferred.length} items`,
    summary + repTable(cols, deferred),
    `<button class="btn btn-sm btn-ghost" data-export="def-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, jobs, quotes, allQuotes, custs, vehs, emps, label) {
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      if (key === 'ro-csv') {
        const rows = [['RO #','Date','Customer','Vehicle','Technician','Status']];
        jobs.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).forEach(j => {
          const c=custs[j.customerId]; const v=vehs[j.vehicleId]; const t=emps[j.techId];
          rows.push([j.roNumber||j.id.slice(0,8),(j.createdAt||'').slice(0,10), c?`${c.firstName||''} ${c.lastName||''}`.trim():'', v?`${v.year||''} ${v.make||''} ${v.model||''}`.trim():'', t?`${t.firstName||''} ${t.lastName||''}`.trim():'', j.status||'']);
        });
        repCsv(rows,'repair-orders.csv');
      } else if (key === 'ro-print') {
        repPrint(`Repair Orders — ${label}`, mount.querySelector(".card").outerHTML);
      } else if (key === 'est-csv') {
        const rows = [['Estimate #','Date','Customer','Items','Total','Status']];
        quotes.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).forEach(q => {
          const c=custs[q.customerId]; const total=(q.lineItems||[]).reduce((s,li)=>s+safeNum(li.price)*safeNum(li.qty||1),0);
          rows.push([q.quoteNumber||q.id.slice(0,8),(q.createdAt||'').slice(0,10),c?`${c.firstName||''} ${c.lastName||''}`.trim():'',(q.lineItems||[]).length,total.toFixed(2),q.status||'']);
        });
        repCsv(rows,'estimates.csv');
      } else if (key === 'def-csv') {
        const rows = [['Date','Estimate #','Customer','Deferred Service','Price']];
        allQuotes.forEach(q => {
          const c=custs[q.customerId];
          (q.lineItems||[]).filter(li=>li.status==='deferred').forEach(li=>{
            rows.push([(q.createdAt||'').slice(0,10),q.quoteNumber||q.id.slice(0,8),c?`${c.firstName||''} ${c.lastName||''}`.trim():'',li.name||li.type||'',safeNum(li.price).toFixed(2)]);
          });
        });
        repCsv(rows,'deferred-services.csv');
      }
    };
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${Number(m)}/${Number(day)}/${y}`;
}

function statusBadge(status, color) {
  if (!status) return '—';
  const colors = { green: 'badge-green', red: 'badge-red', amber: 'badge-amber', blue: 'badge-blue', gray: 'badge-gray' };
  return `<span class="badge ${colors[color]||'badge-gray'}">${status.replace('_',' ')}</span>`;
}
