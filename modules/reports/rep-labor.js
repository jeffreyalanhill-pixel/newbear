// AutoBook — modules/reports/rep-labor.js
// Labor & Technicians tab: Tech Summary, Time Log, Commission (placeholder)
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint } from './reports-app.js';

export function renderRepLabor(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  const emps = db.employees();
  const jobs = db.jobs().filter(j => inRange(j.createdAt, start, end));
  const invAll = db.invoices().filter(i => inRange(i.issuedAt, start, end));
  const entries = (db.timeClockEntries ? db.timeClockEntries() : []).filter(e => inRange(e.date ? e.date + 'T12:00:00' : '', start, end));

  mount.innerHTML = `
    ${renderTechSummary(emps, jobs, invAll, label)}
    ${renderTimeLog(emps, entries, label)}
    ${renderCommissionPlaceholder()}
  `;

  wireExports(mount, emps, jobs, invAll, entries, label);
}

// ---------------------------------------------------------------------------
// Technician Summary
// ---------------------------------------------------------------------------
function renderTechSummary(emps, jobs, invAll, label) {
  const techs = emps.filter(e => e.role === 'technician' || e.isTech);

  const techMap = {};
  jobs.forEach(j => {
    if (!j.techId) return;
    if (!techMap[j.techId]) techMap[j.techId] = { jobs: 0, completed: 0, billedHours: 0, revenue: 0 };
    techMap[j.techId].jobs++;
    if (j.status === 'completed' || j.status === 'invoiced') techMap[j.techId].completed++;
    techMap[j.techId].billedHours += safeNum(j.billedHours || j.estimatedHours || 0);
  });

  invAll.forEach(inv => {
    if (!inv.techId || inv.status !== 'paid') return;
    if (!techMap[inv.techId]) techMap[inv.techId] = { jobs: 0, completed: 0, billedHours: 0, revenue: 0 };
    techMap[inv.techId].revenue += safeNum(inv.total);
  });

  // Include all techs with at least some data
  const allTechIds = new Set([...Object.keys(techMap), ...techs.map(t => t.id)]);

  const rows = [...allTechIds].map(id => {
    const emp = db.employeeById ? db.employeeById(id) : emps.find(e => e.id === id);
    const m = techMap[id] || { jobs: 0, completed: 0, billedHours: 0, revenue: 0 };
    const eff = m.jobs > 0 ? Math.round(m.completed / m.jobs * 100) : 0;
    return {
      _revenue: m.revenue,
      _jobs: m.jobs,
      name: emp ? `${emp.firstName||''} ${emp.lastName||''}`.trim() : id.slice(0,8),
      jobs: m.jobs,
      completed: m.completed,
      eff: `${eff}%`,
      hours: m.billedHours.toFixed(1),
      revenue: util.fmtMoney(m.revenue),
    };
  }).filter(r => r._jobs > 0 || r._revenue > 0).sort((a,b) => b._revenue - a._revenue);

  const cols = [
    { key: 'name', label: 'Technician' },
    { key: 'jobs', label: 'Jobs', num: true },
    { key: 'completed', label: 'Completed', num: true },
    { key: 'eff', label: 'Completion %', num: true },
    { key: 'hours', label: 'Billed Hrs', num: true },
    { key: 'revenue', label: 'Revenue', num: true },
  ];

  const totalRevenue = rows.reduce((s, r) => s + r._revenue, 0);
  const totalJobs = rows.reduce((s, r) => s + r._jobs, 0);

  const summary = `<div class="row" style="gap:var(--s5);flex-wrap:wrap;margin-bottom:var(--s4)">
    <div><span class="tnum" style="font-weight:700">${rows.length}</span> <span style="color:var(--ink-3);font-size:var(--t-13)">active techs</span></div>
    <div><span class="tnum" style="font-weight:700">${totalJobs}</span> <span style="color:var(--ink-3);font-size:var(--t-13)">total jobs</span></div>
    <div><span class="tnum" style="font-weight:700">${util.fmtMoney(totalRevenue)}</span> <span style="color:var(--ink-3);font-size:var(--t-13)">revenue</span></div>
  </div>`;

  return repSection('Technician Summary', `${rows.length} technicians`,
    summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="tech-csv">CSV</button>
     <button class="btn btn-sm btn-ghost" data-export="tech-print">Print</button>`
  );
}

// ---------------------------------------------------------------------------
// Time Log
// ---------------------------------------------------------------------------
function renderTimeLog(emps, entries, label) {
  const empById = Object.fromEntries(emps.map(e => [e.id, e]));

  const rows = [...entries].sort((a,b) => {
    const da = (a.date||''), db2 = (b.date||'');
    return db2.localeCompare(da) || (a.employeeId||'').localeCompare(b.employeeId||'');
  }).map(e => {
    const emp = empById[e.employeeId];
    const hours = safeNum(e.totalHours);
    return {
      date: fmtDate(e.date),
      name: emp ? `${emp.firstName||''} ${emp.lastName||''}`.trim() : '—',
      clockIn: fmtTime(e.clockIn),
      clockOut: fmtTime(e.clockOut),
      hours: hours > 0 ? hours.toFixed(2) : '—',
    };
  });

  const totalHours = entries.reduce((s, e) => s + safeNum(e.totalHours), 0);

  const summary = entries.length ? `<div style="margin-bottom:var(--s3)"><strong>${totalHours.toFixed(2)}</strong> total hours · <strong>${entries.length}</strong> clock entries</div>` : '';

  const cols = [
    { key: 'date', label: 'Date' },
    { key: 'name', label: 'Employee' },
    { key: 'clockIn', label: 'Clock In' },
    { key: 'clockOut', label: 'Clock Out' },
    { key: 'hours', label: 'Hours', num: true },
  ];

  return repSection('Time Log', `${entries.length} entries`,
    summary + repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="time-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Commission (placeholder — commission fields not yet in data model)
// ---------------------------------------------------------------------------
function renderCommissionPlaceholder() {
  return `<div class="card" style="margin-bottom:var(--s4)">
    <div class="card-head"><div class="card-title">Commission Report</div></div>
    <div class="card-body">
      <div class="empty-sub" style="padding:var(--s6) 0">
        Commission tracking requires <strong>employee.commissionRate</strong> fields, which are not yet set up.<br>
        Once commission rates are configured in employee profiles, this report will calculate earned commissions by technician and service advisor.
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, emps, jobs, invAll, entries, label) {
  const empById = Object.fromEntries(emps.map(e => [e.id, e]));
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      if (key === 'tech-csv') {
        const techMap = {};
        jobs.forEach(j => {
          if (!j.techId) return;
          if (!techMap[j.techId]) techMap[j.techId]={jobs:0,completed:0,billedHours:0,revenue:0};
          techMap[j.techId].jobs++; if(j.status==='completed'||j.status==='invoiced') techMap[j.techId].completed++;
          techMap[j.techId].billedHours+=safeNum(j.billedHours||j.estimatedHours||0);
        });
        invAll.forEach(inv => {
          if(!inv.techId||inv.status!=='paid') return;
          if(!techMap[inv.techId]) techMap[inv.techId]={jobs:0,completed:0,billedHours:0,revenue:0};
          techMap[inv.techId].revenue+=safeNum(inv.total);
        });
        const rows=[['Technician','Jobs','Completed','Completion %','Billed Hours','Revenue']];
        Object.entries(techMap).sort((a,b)=>b[1].revenue-a[1].revenue).forEach(([id,m]) => {
          const e=empById[id];
          rows.push([e?`${e.firstName||''} ${e.lastName||''}`.trim():id.slice(0,8), m.jobs, m.completed, m.jobs>0?Math.round(m.completed/m.jobs*100)+'%':'', m.billedHours.toFixed(1), m.revenue.toFixed(2)]);
        });
        repCsv(rows,'tech-summary.csv');
      } else if (key === 'tech-print') {
        repPrint(`Technician Summary — ${label}`, mount.querySelector(".card").outerHTML);
      } else if (key === 'time-csv') {
        const rows=[['Date','Employee','Clock In','Clock Out','Hours']];
        entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).forEach(e => {
          const emp=empById[e.employeeId];
          rows.push([e.date||'', emp?`${emp.firstName||''} ${emp.lastName||''}`.trim():'', fmtTime(e.clockIn), fmtTime(e.clockOut), safeNum(e.totalHours).toFixed(2)]);
        });
        repCsv(rows,'time-log.csv');
      }
    };
  });
}

function fmtDate(d) {
  if (!d) return '—';
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const [y,m,day] = parts;
  return `${Number(m)}/${Number(day)}/${y}`;
}
function fmtTime(t) {
  if (!t) return '—';
  // t might be HH:MM or ISO string
  if (t.includes('T')) return new Date(t).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
  return t;
}
