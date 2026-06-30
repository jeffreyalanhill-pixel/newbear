// AutoBook — modules/reports/rep-payments.js
// Payments tab: All Payments, End of Day (any date), Credit Notes
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint, custLink } from './reports-app.js';

export function renderRepPayments(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  mount.innerHTML = `
    ${renderAllPayments(start, end, label)}
    ${renderEodSection()}
    ${renderCreditNotesSection(start, end, label)}
  `;

  wireExports(mount, start, end, label);
  wireEod(mount);
}

// ---------------------------------------------------------------------------
// All Payments (flattened from invoice.payments[])
// ---------------------------------------------------------------------------
function renderAllPayments(start, end, label) {
  const custs = Object.fromEntries(db.customers().map(c => [c.id, c]));
  const invAll = db.invoices();

  const payments = [];
  invAll.forEach(inv => {
    const c = custs[inv.customerId];
    (inv.payments || []).forEach(p => {
      if (!inRange(p.date, start, end)) return;
      payments.push({
        _date: p.date,
        _amount: safeNum(p.amount),
        _method: p.method || 'unknown',
        date: fmtDate((p.date||'').slice(0,10)),
        method: capitalize(p.method || 'unknown'),
        amount: util.fmtMoney(safeNum(p.amount)),
        invoice: inv.invoiceNumber || inv.id.slice(0,8),
        customer: custLink(inv.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
        note: p.note || '',
      });
    });
  });

  payments.sort((a,b) => (b._date||'').localeCompare(a._date||''));

  const total = payments.reduce((s, p) => s + p._amount, 0);
  const byMethod = payments.reduce((acc, p) => { acc[p._method] = (acc[p._method]||0)+p._amount; return acc; }, {});

  const summary = `<div class="row" style="gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-size:var(--t-xl);font-weight:700">${util.fmtMoney(total)}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">Total Collected</div></div>
    ${Object.entries(byMethod).map(([m,v])=>`<div><span class="tnum" style="font-weight:700">${util.fmtMoney(v)}</span><div style="font-size:var(--t-xs);color:var(--ink-3)">${capitalize(m)}</div></div>`).join('')}
  </div>`;

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'invoice', label: 'Invoice #' },
    { key: 'customer', label: 'Customer' },
    { key: 'method', label: 'Method' },
    { key: 'amount', label: 'Amount', num: true },
    { key: 'note', label: 'Note' },
  ];

  return repSection('All Payments', `${payments.length} transactions`,
    summary + repTable(cols, payments.map(p => ({ date:p.date, invoice:p.invoice, customer:p.customer, method:p.method, amount:p.amount, note:p.note }))),
    `<button class="btn btn-sm btn-ghost" data-export="pay-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="pay-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// End of Day Report (date picker)
// ---------------------------------------------------------------------------
function renderEodSection() {
  const today = new Date().toISOString().slice(0, 10);
  return `<div class="card" style="margin-bottom:var(--s4)">
    <div class="card-head">
      <div class="card-title">End of Day Report</div>
      <div class="row" style="gap:var(--s2);align-items:center">
        <label style="font-size:var(--t-13);color:var(--ink-3)">Date:</label>
        <input type="date" id="eod-date" value="${today}" class="input" style="width:160px;padding:4px 8px;font-size:var(--t-13)">
        <button class="btn btn-sm btn-primary" id="eod-run">Run</button>
      </div>
    </div>
    <div class="card-body" id="eod-body">
      <div class="empty-sub">Select a date and click Run to view the closeout report.</div>
    </div>
  </div>`;
}

function wireEod(mount) {
  mount.querySelector('#eod-run').onclick = () => {
    const date = mount.querySelector('#eod-date').value;
    if (!date) return;
    const body = mount.querySelector('#eod-body');
    body.innerHTML = buildEodHtml(date);
    // wire print button
    const printBtn = body.querySelector('#eod-print');
    if (printBtn) printBtn.onclick = () => repPrint(`End of Day — ${date}`, body.innerHTML);
  };
}

function buildEodHtml(dateIso) {
  const invAll = db.invoices();
  const d = new Date(dateIso); d.setHours(0,0,0,0);
  const dEnd = new Date(dateIso); dEnd.setHours(23,59,59,999);

  // Use util.dailyCloseout if it accepts a date, otherwise compute manually
  let closeout = null;
  try { closeout = util.dailyCloseout(dateIso); } catch(e) {}

  if (closeout) {
    const methodOrder = ['cash','card','check','ach','financing'];
    const totalCollected = methodOrder.reduce((s,m) => s + safeNum(closeout[m]), 0);
    const rows = methodOrder.filter(m => closeout[m] != null)
      .map(m => `<tr><td>${capitalize(m)}</td><td class="num tnum">${util.fmtMoney(safeNum(closeout[m]))}</td></tr>`).join('');
    return `<div>
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:var(--s4)">
        <div style="font-weight:600">${fmtDateLong(dateIso)}</div>
        <button class="btn btn-sm btn-ghost" id="eod-print">Print</button>
      </div>
      <table class="table" style="max-width:480px"><tbody>
        ${rows}
        <tr style="border-top:2px solid var(--rule)"><td style="font-weight:700">Total Collected</td><td class="num tnum" style="font-weight:700">${util.fmtMoney(totalCollected)}</td></tr>
        ${safeNum(closeout.deposits) > 0 ? `<tr><td>Deposits</td><td class="num tnum">${util.fmtMoney(safeNum(closeout.deposits))}</td></tr>` : ''}
        ${safeNum(closeout.refunds) > 0 ? `<tr><td style="color:var(--red)">Refunds</td><td class="num tnum" style="color:var(--red)">−${util.fmtMoney(safeNum(closeout.refunds))}</td></tr>` : ''}
        ${safeNum(closeout.netCollected) !== totalCollected ? `<tr style="border-top:1px solid var(--rule)"><td style="font-weight:700">Net Collected</td><td class="num tnum" style="font-weight:700">${util.fmtMoney(safeNum(closeout.netCollected))}</td></tr>` : ''}
      </tbody></table>
      <div style="margin-top:var(--s4);font-size:var(--t-13);color:var(--ink-3)">${closeout.invoicesPaidToday || 0} invoice${closeout.invoicesPaidToday !== 1 ? 's' : ''} paid</div>
    </div>`;
  }

  // Manual computation
  const payments = [];
  invAll.forEach(inv => {
    (inv.payments||[]).forEach(p => {
      if (!p.date) return;
      const pd = new Date(p.date); if (isNaN(pd)) return;
      if (pd >= d && pd <= dEnd) payments.push({ ...p, inv });
    });
  });

  const byMethod = {};
  payments.forEach(p => { byMethod[p.method||'unknown'] = (byMethod[p.method||'unknown']||0) + safeNum(p.amount); });
  const totalCollected = payments.reduce((s,p) => s + safeNum(p.amount), 0);

  const creditNotes = db.creditNotes ? db.creditNotes() : [];
  const refunds = creditNotes.filter(cn => {
    const d2 = new Date(cn.createdAt||''); return d2 >= d && d2 <= dEnd;
  });
  const totalRefunds = refunds.reduce((s, cn) => s + safeNum(cn.amount), 0);

  const invoicesPaidToday = invAll.filter(inv =>
    (inv.payments||[]).some(p => { const pd=new Date(p.date); return !isNaN(pd) && pd>=d && pd<=dEnd; })
  ).length;

  const methodOrder = ['cash','card','check','ach','financing','other','unknown'];
  const sortedMethods = Object.entries(byMethod).sort((a,b) => {
    const ai = methodOrder.indexOf(a[0]), bi = methodOrder.indexOf(b[0]);
    return (ai<0?99:ai) - (bi<0?99:bi);
  });

  return `<div>
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:var(--s4)">
      <div style="font-weight:600">${fmtDateLong(dateIso)}</div>
      <button class="btn btn-sm btn-ghost" id="eod-print">Print</button>
    </div>
    <table class="table" style="max-width:480px">
      <tbody>
        ${sortedMethods.map(([m,v]) => `<tr><td>${capitalize(m)}</td><td class="num tnum">${util.fmtMoney(v)}</td></tr>`).join('')}
        <tr style="border-top:2px solid var(--rule)"><td style="font-weight:700">Total Collected</td><td class="num tnum" style="font-weight:700">${util.fmtMoney(totalCollected)}</td></tr>
        ${totalRefunds > 0 ? `<tr><td style="color:var(--red)">Refunds / Credits</td><td class="num tnum" style="color:var(--red)">−${util.fmtMoney(totalRefunds)}</td></tr>` : ''}
        ${totalRefunds > 0 ? `<tr style="border-top:1px solid var(--rule)"><td style="font-weight:700">Net Collected</td><td class="num tnum" style="font-weight:700">${util.fmtMoney(totalCollected - totalRefunds)}</td></tr>` : ''}
      </tbody>
    </table>
    <div style="margin-top:var(--s4);font-size:var(--t-13);color:var(--ink-3)">${invoicesPaidToday} invoice${invoicesPaidToday!==1?'s':''} paid · ${payments.length} transaction${payments.length!==1?'s':''}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Credit Notes / Refunds
// ---------------------------------------------------------------------------
function renderCreditNotesSection(start, end, label) {
  const creditNotes = db.creditNotes ? db.creditNotes() : [];
  const custs = Object.fromEntries(db.customers().map(c=>[c.id,c]));

  const inRange_ = creditNotes.filter(cn => inRange(cn.createdAt, start, end));
  const total = inRange_.reduce((s, cn) => s + safeNum(cn.amount), 0);

  const rows = inRange_.sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||'')).map(cn => {
    const c = custs[cn.customerId];
    return {
      date: fmtDate((cn.createdAt||'').slice(0,10)),
      customer: custLink(cn.customerId, c ? `${c.firstName||''} ${c.lastName||''}`.trim() : ''),
      amount: util.fmtMoney(safeNum(cn.amount)),
      reason: cn.reason || cn.note || '—',
      ref: cn.referenceNumber || cn.id?.slice(0,8) || '—',
    };
  });

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'ref', label: 'Ref #' },
    { key: 'customer', label: 'Customer' },
    { key: 'amount', label: 'Amount', num: true },
    { key: 'reason', label: 'Reason' },
  ];

  const footer = rows.length ? `<div style="text-align:right;margin-top:var(--s3);font-weight:700">Total: <span class="tnum">${util.fmtMoney(total)}</span></div>` : '';

  return repSection('Credit Notes & Refunds', `${rows.length}`, repTable(cols, rows) + footer,
    `<button class="btn btn-sm btn-ghost" data-export="cn-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, start, end, label) {
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      const custs = Object.fromEntries(db.customers().map(c=>[c.id,c]));
      const invAll = db.invoices();

      if (key === 'pay-csv') {
        const rows = [['Date','Invoice #','Customer','Method','Amount','Note']];
        invAll.forEach(inv => {
          const c=custs[inv.customerId];
          (inv.payments||[]).filter(p=>inRange(p.date,start,end)).forEach(p => {
            rows.push([(p.date||'').slice(0,10), inv.invoiceNumber||inv.id.slice(0,8), c?`${c.firstName||''} ${c.lastName||''}`.trim():'', p.method||'', safeNum(p.amount).toFixed(2), p.note||'']);
          });
        });
        rows.sort((a,b)=>b[0].localeCompare(a[0]));
        repCsv(rows,'all-payments.csv');
      } else if (key === 'pay-print') {
        repPrint(`All Payments — ${label}`, mount.querySelector(".card").outerHTML);
      } else if (key === 'cn-csv') {
        const creditNotes = db.creditNotes ? db.creditNotes() : [];
        const rows = [['Date','Ref #','Customer','Amount','Reason']];
        creditNotes.filter(cn=>inRange(cn.createdAt,start,end)).sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')).forEach(cn => {
          const c=custs[cn.customerId];
          rows.push([(cn.createdAt||'').slice(0,10), cn.referenceNumber||cn.id?.slice(0,8)||'', c?`${c.firstName||''} ${c.lastName||''}`.trim():'', safeNum(cn.amount).toFixed(2), cn.reason||cn.note||'']);
        });
        repCsv(rows,'credit-notes.csv');
      }
    };
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const [y,m,day] = d.split('-');
  return `${Number(m)}/${Number(day)}/${y}`;
}
function fmtDateLong(d) {
  if (!d) return '';
  return new Date(d+'T12:00:00').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
