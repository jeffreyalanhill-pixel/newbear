// AutoBook — modules/reports/rep-overview.js
// Overview tab: KPI cards + charts (ported / enhanced from modules/reports.js)
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repStatCard, repCsv, repPrint } from './reports-app.js';

export function renderRepOverview(mount) {
  const { start, end, days } = getRepState();

  // --- compute ---
  const invAll = db.invoices();
  const invRange = invAll.filter(i => inRange(i.issuedAt, start, end));
  const invPaid = invRange.filter(i => i.status === 'paid');

  const revenue = invPaid.reduce((s, i) => s + safeNum(i.total), 0);
  const prevEnd = new Date(start); prevEnd.setMilliseconds(-1);
  const prevStart = new Date(start); prevStart.setDate(prevStart.getDate() - days);
  const prevPaid = invAll.filter(i => i.status === 'paid' && inRange(i.issuedAt, prevStart, prevEnd));
  const prevRevenue = prevPaid.reduce((s, i) => s + safeNum(i.total), 0);
  const revDelta = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : null;

  const aro = invPaid.length > 0 ? revenue / invPaid.length : 0;
  const tax = invPaid.reduce((s, i) => s + safeNum(i.tax), 0);

  // pending / outstanding
  const invPending = invRange.filter(i => i.status !== 'paid' && i.status !== 'canceled');
  const outstanding = invPending.reduce((s, i) => s + safeNum(i.total), 0);

  // jobs
  const jobsAll = db.jobs();
  const jobsRange = jobsAll.filter(j => inRange(j.createdAt, start, end));
  const jobsComp = jobsRange.filter(j => j.status === 'completed' || j.status === 'invoiced');

  // daily revenue for chart
  const dayMs = 86400000;
  const chartDays = Math.min(days, 30);
  const dailyRevenue = [];
  for (let i = chartDays - 1; i >= 0; i--) {
    const d = new Date(end.getTime() - i * dayMs);
    d.setHours(0, 0, 0, 0);
    const dEnd = new Date(d); dEnd.setHours(23, 59, 59, 999);
    const rev = invAll.filter(v => v.status === 'paid' && inRange(v.issuedAt, d, dEnd))
                      .reduce((s, v) => s + safeNum(v.total), 0);
    dailyRevenue.push({ date: d, rev });
  }

  mount.innerHTML = `
    <div class="grid-4" style="margin-bottom:var(--s5)">
      ${repStatCard('Revenue', util.fmtMoney(revenue), revDelta != null ? `${revDelta >= 0 ? '+' : ''}${revDelta.toFixed(1)}% vs prior period` : `vs ${days}d prior`, revDelta == null ? 'blue' : revDelta >= 0 ? 'green' : 'red')}
      ${repStatCard('Avg Invoice (ARO)', util.fmtMoney(aro), `${invPaid.length} paid invoice${invPaid.length !== 1 ? 's' : ''}`, 'blue')}
      ${repStatCard('Outstanding', util.fmtMoney(outstanding), `${invPending.length} unpaid`, outstanding > 0 ? 'amber' : 'green')}
      ${repStatCard('Tax Collected', util.fmtMoney(tax), `${invPaid.length} invoices`, 'blue')}
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">Daily Revenue — Last ${chartDays} Days</div>
        <div class="row" style="gap:var(--s2)">
          <button class="btn btn-sm btn-ghost" id="ov-export-csv">Export CSV</button>
          <button class="btn btn-sm btn-ghost" id="ov-print">Print</button>
        </div>
      </div>
      <div class="card-body">
        <div style="overflow-x:auto">${lineChartSvg(dailyRevenue.map(d => d.rev), { color: 'var(--accent)', height: 140, fill: true })}</div>
        <table class="table" style="margin-top:var(--s3)">
          <thead><tr><th>Date</th><th class="num">Revenue</th><th class="num">Invoices</th></tr></thead>
          <tbody>${dailyRevenue.map(d => {
            const dEnd = new Date(d.date); dEnd.setHours(23,59,59,999);
            const cnt = invAll.filter(v => v.status === 'paid' && inRange(v.issuedAt, d.date, dEnd)).length;
            return `<tr><td>${d.date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</td><td class="num tnum">${util.fmtMoney(d.rev)}</td><td class="num tnum">${cnt}</td></tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </div>

    ${renderServiceMixCard(invPaid)}
    ${renderCapacityCard(jobsRange, jobsComp)}
  `;

  mount.querySelector('#ov-export-csv').onclick = () => {
    const rows = [['Date','Revenue','Invoices']].concat(dailyRevenue.map(d => {
      const dEnd = new Date(d.date); dEnd.setHours(23,59,59,999);
      const cnt = invAll.filter(v => v.status === 'paid' && inRange(v.issuedAt, d.date, dEnd)).length;
      return [d.date.toISOString().slice(0,10), d.rev.toFixed(2), cnt];
    }));
    repCsv(rows, `revenue-${days}d.csv`);
  };
  mount.querySelector('#ov-print').onclick = () => repPrint(`Revenue Overview — ${repLabel(start,end)}`, mount.innerHTML);
}

// --- Service Mix ---
function renderServiceMixCard(invPaid) {
  const catMap = {};
  const services = db.services();
  const svcById = Object.fromEntries(services.map(s => [s.id, s]));
  invPaid.forEach(inv => {
    (inv.lineItems || []).forEach(li => {
      const svc = svcById[li.refId];
      const cat = svc?.category || li.type || 'Other';
      catMap[cat] = (catMap[cat] || 0) + safeNum(li.price) * safeNum(li.qty || 1);
    });
  });
  const cats = Object.entries(catMap).sort((a,b) => b[1]-a[1]);
  const total = cats.reduce((s,[,v]) => s + v, 0);
  if (!cats.length) return '';
  return `<div class="card" style="margin-bottom:var(--s4)">
    <div class="card-head"><div class="card-title">Revenue by Service Category</div></div>
    <div class="card-body">
      ${cats.map(([cat, rev]) => {
        const pct = total > 0 ? (rev/total*100) : 0;
        return `<div style="margin-bottom:var(--s3)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:var(--t-13);font-weight:600">${cat}</span>
            <span style="font-size:var(--t-13);color:var(--ink-3)">${util.fmtMoney(rev)} · ${pct.toFixed(1)}%</span>
          </div>
          <div style="height:6px;background:var(--canvas);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// --- Capacity ---
function renderCapacityCard(jobsRange, jobsComp) {
  const total = jobsRange.length;
  const comp = jobsComp.length;
  const pct = total > 0 ? Math.round(comp/total*100) : 0;
  return `<div class="card" style="margin-bottom:var(--s4)">
    <div class="card-head"><div class="card-title">Shop Utilization</div></div>
    <div class="card-body">
      <div style="display:flex;gap:var(--s6);flex-wrap:wrap">
        <div><div class="tnum" style="font-size:var(--t-2xl);font-weight:700">${total}</div><div style="font-size:var(--t-13);color:var(--ink-3)">Total jobs opened</div></div>
        <div><div class="tnum" style="font-size:var(--t-2xl);font-weight:700">${comp}</div><div style="font-size:var(--t-13);color:var(--ink-3)">Completed</div></div>
        <div><div class="tnum" style="font-size:var(--t-2xl);font-weight:700">${pct}%</div><div style="font-size:var(--t-13);color:var(--ink-3)">Completion rate</div></div>
      </div>
    </div>
  </div>`;
}

// --- SVG Line Chart (ported from modules/reports.js) ---
function lineChartSvg(values, opts = {}) {
  const W = 900, H = opts.height || 120;
  const PAD = { t: 12, r: 12, b: 28, l: 52 };
  const iW = W - PAD.l - PAD.r;
  const iH = H - PAD.t - PAD.b;
  const n = values.length;
  if (!n) return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px"></svg>`;

  const max = Math.max(...values, 0.01);
  const step = iW / Math.max(n - 1, 1);
  const yFmt = v => `${v >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${v.toFixed(0)}`}`;
  const pts = values.map((v, i) => `${PAD.l + i * step},${PAD.t + iH - (v / max) * iH}`);
  const pathD = pts.map((p,i) => (i === 0 ? 'M' : 'L') + p).join(' ');
  const fillD = `${pathD} L${PAD.l + (n-1)*step},${PAD.t+iH} L${PAD.l},${PAD.t+iH} Z`;
  const color = opts.color || 'var(--accent)';

  // Y-axis ticks
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: max * f, y: PAD.t + iH - f * iH }));

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px;overflow:visible" xmlns="http://www.w3.org/2000/svg">
    ${ticks.map(t => `<line x1="${PAD.l}" y1="${t.y}" x2="${W-PAD.r}" y2="${t.y}" stroke="var(--rule)" stroke-width="1"/>
      <text x="${PAD.l - 6}" y="${t.y+4}" text-anchor="end" font-size="10" fill="var(--ink-4)">${yFmt(t.v)}</text>`).join('')}
    ${opts.fill ? `<path d="${fillD}" fill="${color}" opacity="0.12"/>` : ''}
    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p,i) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="${color}"/>
      <title>${yFmt(values[i])}</title>`).join('')}
  </svg>`;
}
