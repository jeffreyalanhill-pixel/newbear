// AutoBook — modules/dashboard.js (§11.1)
// Renders the dashboard page from db/util only — no hardcoded numbers.

import { db } from '../lib/data.js';
import { util } from '../lib/util.js';
import { renderNav } from '../lib/nav.js';
import { hasRoleDashboard, renderRoleDashboard, roleDashboardMeta } from './role-dashboards.js';

function svg(path, vb = '0 0 24 24') {
  return `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const ICONS = {
  gauge: svg('<path d="M12 20V10M6 20v-6M18 20V6"/>'),
  dollar: svg('<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'),
  warning: svg('<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/>'),
  clipboard: svg('<path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>'),
  car: svg('<path d="M5 17h14l-1.5-5a2 2 0 00-1.9-1.4H8.4A2 2 0 006.5 12L5 17zM5 17v2M19 17v2"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>'),
  trend: svg('<path d="M3 17l6-6 4 4 8-8"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  invoice: svg('<path d="M4 4h11l5 5v11H4z"/><path d="M15 4v5h5"/>'),
  part: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.97 7.97 0 000-2"/>'),
  calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>'),
  inventory: svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>'),
  comeback: svg('<path d="M3 12a9 9 0 109-9"/><path d="M3 3v6h6"/>'),
  idle: svg('<circle cx="12" cy="12" r="9"/>'),
};

const FLAG_DOT = { red: 'dot-red', amber: 'dot-amber', blue: 'dot-blue' };

// One dashboard renderer, one entry point — dashboard.html only ever calls
// this. It picks Owner/Admin's existing rich dashboard (renderOwnerDashboard,
// unchanged below) for Owner and as the fallback for any role with no
// dedicated config, or hands off to modules/role-dashboards.js for every
// other App Permission Role. See lib/auth.js's SECURITY WARNING — this is
// demo/UI-only role filtering (driven by the "View app as" switcher on the
// Team page), not real access control.
export function renderDashboard() {
  const employee = db.employeeById(db.settings().currentUserId);
  const roleId = employee?.role;
  if (!employee || !roleId || roleId === 'owner' || !hasRoleDashboard(roleId)) {
    renderOwnerDashboard();
    return;
  }
  renderRoleDashboardPage(roleId, employee);
}

function renderRoleDashboardPage(roleId, employee) {
  renderNav('#icon-rail', 'dashboard.html');
  const role = db.roleById(roleId);
  const meta = roleDashboardMeta(roleId);
  document.getElementById('greeting-title').textContent = meta?.title || `Hi, ${employee.firstName}`;
  const headerTextEl = document.getElementById('greeting-title').parentElement;
  let sub = headerTextEl.querySelector('.greeting-sub');
  if (!sub) { sub = document.createElement('div'); sub.className = 'greeting-sub'; headerTextEl.appendChild(sub); }
  sub.innerHTML = `${meta?.subtitle || ''} <span class="badge badge-amber" style="font-size:10px;margin-left:6px">Dashboard view: ${role?.name || roleId} — demo only</span>`;
  document.getElementById('avatar').textContent = (employee.firstName || '?').charAt(0).toUpperCase();

  // The Owner dashboard's three-column shell (kpi-strip/kanban/flags/etc +
  // context-rail) is purpose-built for Owner's data; role dashboards instead
  // render entirely into .page-body and collapse the context rail, since
  // none of the role configs need it. Nothing here touches the Owner path.
  const pageBody = document.querySelector('.page-body');
  renderRoleDashboard(pageBody, roleId, employee);
  const contextRail = document.getElementById('context-rail');
  if (contextRail) {
    contextRail.innerHTML = `
      <div class="ctx-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        Demo role view
      </div>
      <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s3)">You're viewing the dashboard as <b>${role?.name || roleId}</b>. This only changes what's shown in the browser — see the Team page's "View app as" switcher to change roles.</div>
      <a class="btn btn-secondary btn-sm" href="team.html">Manage roles / switch demo view</a>
    `;
  }
}

function renderOwnerDashboard() {
  renderNav('#icon-rail', 'dashboard.html');

  const settings = db.settings();
  document.getElementById('greeting-title').textContent = `Good morning, ${settings.owner || ''}`.trim();
  const sub = document.querySelector('.greeting-sub');
  if (sub) sub.innerHTML = "Here's how your shop is performing today.";
  document.getElementById('avatar').textContent = (settings.owner || '?').charAt(0).toUpperCase();

  renderKpiStrip();
  renderStatCards();
  renderKanban();
  renderFlags();
  renderSchedule();
  renderTomorrow();
  renderOverview('today');
  renderTeamPulse();
  renderAiCoaching();
  renderGauge();

  document.getElementById('period-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-period]');
    if (!btn) return;
    document.querySelectorAll('#period-toggle button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderOverview(btn.dataset.period);
  });
}

function renderKpiStrip() {
  const k = util.computeKPIs();
  const barColor = k.billedPct >= 85 ? 'var(--green)' : k.billedPct >= 50 ? 'var(--accent)' : 'var(--amber)';
  document.getElementById('kpi-strip').innerHTML = `
    <div class="kpi">
      <div class="kpi-head"><span class="kpi-bubble blue">${ICONS.gauge}</span><span class="kpi-label">Billed Hrs vs Capacity</span></div>
      <div class="kpi-value tnum">${k.billed.toFixed(1)} <small>/ ${k.capacity} hrs</small></div>
      <div class="kpi-sub">${k.billedPct}%</div>
      <div class="kpi-bar"><i style="width:${Math.min(k.billedPct, 100)}%;background:${barColor}"></i></div>
    </div>
    <div class="kpi">
      <div class="kpi-head"><span class="kpi-bubble green">${ICONS.dollar}</span><span class="kpi-label">Collected Today</span></div>
      <div class="kpi-value tnum">${util.fmtMoney0(k.collectedToday)}</div>
      <div class="kpi-sub">vs invoiced ${util.fmtMoney0(k.invoicedToday)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-head"><span class="kpi-bubble red">${ICONS.warning}</span><span class="kpi-label">Outstanding / At Risk</span></div>
      <div class="kpi-value tnum">${util.fmtMoney0(k.outstanding)}</div>
      <div class="kpi-sub down">${k.outstandingCount} job${k.outstandingCount === 1 ? '' : 's'} not invoiced</div>
    </div>
  `;
}

function renderStatCards() {
  const k = util.computeKPIs();
  const lateCount = db.jobs().filter((j) => j.status === 'in_progress' && j.billedHours > j.estHours).length;
  const waitingPartsCount = db.jobs().filter((j) => j.status === 'on_hold' && j.holdReason === 'parts_ordered').length;
  const spark = util.sparkline([k.aro * 0.9, k.aro * 0.95, k.aro * 0.92, k.aro, k.aro * 1.05, k.aro * 0.98, k.aro], 70, 22);

  document.getElementById('stat-cards').innerHTML = `
    <div class="stat-card">
      <div class="stat-head"><span class="stat-icon green">${ICONS.clipboard}</span><span class="stat-label">Jobs Today</span></div>
      <div class="stat-value">${k.jobsToday}</div>
      <div class="stat-sub">${k.jobsTodayOpen} open • ${k.jobsTodayDone} done</div>
    </div>
    <div class="stat-card">
      <div class="stat-head"><span class="stat-icon blue">${ICONS.car}</span><span class="stat-label">Cars in Shop (WIP)</span></div>
      <div class="stat-value">${k.wipCount}</div>
      <div class="stat-sub">${lateCount ? `<span class="amber">${lateCount} late</span>` : ''}${lateCount && waitingPartsCount ? ' • ' : ''}${waitingPartsCount ? `<span class="amber">${waitingPartsCount} waiting parts</span>` : ''}${!lateCount && !waitingPartsCount ? 'On track' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-head"><span class="stat-icon purple">${ICONS.trend}</span><span class="stat-label">ARO</span></div>
      <div class="stat-value tnum">${util.fmtMoney0(k.aro)}</div>
      <div class="stat-sub">Target: ${util.fmtMoney0(k.aroTarget)} <svg style="width:70px;height:22px;vertical-align:middle;margin-left:6px" viewBox="0 0 70 22"><path d="${spark}" fill="none" stroke="var(--purple)" stroke-width="2"/></svg></div>
    </div>
  `;
}

function kanbanCard(job) {
  const v = db.vehicleById(job.vehicleId);
  const c = db.customerById(job.customerId);
  const tech = db.techById(job.techId);
  const bay = db.bayById(job.bayId);
  const mk = util.makeBadge(v?.make);
  const chips = [];
  if (bay) chips.push(`<span class="badge badge-blue">${bay.name}${tech ? ' • ' + tech.firstName : ''}</span>`);
  else if (tech) chips.push(`<span class="badge badge-blue">${tech.firstName}</span>`);
  else if (['waiting', 'in_progress'].includes(job.status)) chips.push(`<span class="badge badge-amber">Unassigned</span>`);
  if (job.holdReason === 'parts_ordered') chips.push(`<span class="badge badge-amber">Parts</span>`);
  if (job.status === 'ready') {
    const mins = job.completedAt ? Math.round((Date.now() - new Date(job.completedAt).getTime()) / 60000) : 0;
    const readyLabel = mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
    chips.push(`<span class="badge badge-green">Ready ${readyLabel}</span>`);
    if (!job.invoiceId) chips.push(`<span class="badge badge-green">Invoice</span>`);
  }
  if (job.status === 'in_progress' && job.billedHours > job.estHours) {
    const lateMin = Math.round((job.billedHours - job.estHours) * 60);
    chips.push(`<span class="badge badge-red">Late ${lateMin}m</span>`);
  }
  return `
    <div class="kan-card" draggable="true" data-job-id="${job.id}">
      <div class="kan-top">
        <span class="make-badge" style="background:${mk.bg};color:${mk.txt}">${mk.letter}</span>
        <span class="kan-name">${util.vehicleLabel(v) || 'Vehicle not assigned'}</span>
      </div>
      <div class="kan-sub">${util.customerName(c) || 'Customer not assigned'} · ${job.lineItems?.[0]?.name || 'No service listed'}</div>
      <div class="kan-meta">${chips.join('')}</div>
    </div>`;
}

function renderKanban() {
  const active = db.activeJobs();
  const cols = {
    waiting: active.filter((j) => util.statusMeta(j.status).kanbanCol === 'waiting'),
    in_progress: active.filter((j) => util.statusMeta(j.status).kanbanCol === 'in_progress'),
    ready: db.jobs().filter((j) => j.status === 'ready'),
  };
  const colDef = [
    { key: 'waiting', label: 'Waiting', badge: 'badge-amber' },
    { key: 'in_progress', label: 'In Progress', badge: 'badge-blue' },
    { key: 'ready', label: 'Ready', badge: 'badge-green' },
  ];
  document.getElementById('kanban').innerHTML = colDef.map((c) => `
    <div class="kan-col" data-col="${c.key}">
      <div class="kan-col-head"><span class="badge ${c.badge}">${cols[c.key].length}</span> ${c.label.toUpperCase()}</div>
      <div class="kan-cards">
        ${cols[c.key].length ? cols[c.key].map(kanbanCard).join('') : `<div class="empty" style="padding:var(--s5)"><div class="empty-sub">No jobs here.</div></div>`}
      </div>
    </div>
  `).join('');

  // Drag-and-drop → real lifecycle transitions, never a raw status set.
  document.querySelectorAll('.kan-card').forEach((card) => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
  document.querySelectorAll('.kan-col').forEach((col) => {
    col.addEventListener('dragover', (e) => e.preventDefault());
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      const dragging = document.querySelector('.kan-card.dragging');
      if (!dragging) return;
      const jobId = dragging.dataset.jobId;
      const targetCol = col.dataset.col;
      const job = db.jobById(jobId);
      try {
        if (targetCol === 'in_progress' && (job.status === 'waiting' || job.status === 'on_hold')) {
          util.startJob(jobId, job.bayId, job.techId);
        } else if (targetCol === 'ready' && job.status === 'in_progress') {
          util.markReady(jobId);
        } else if (targetCol === 'waiting' && job.status === 'on_hold') {
          util.resumeJob(jobId);
        }
      } catch (err) {
        console.warn('Transition blocked:', err.message);
      }
      renderKanban();
      renderStatCards();
      renderKpiStrip();
      renderFlags();
    });
  });
}

function renderFlags() {
  const flags = util.computeFlags();
  document.getElementById('flags-body').innerHTML = flags.length
    ? flags.map((f) => `
      <a class="flag" href="${f.href}">
        <span class="dot ${FLAG_DOT[f.level] || 'dot-blue'}"></span>
        <div class="flag-body">
          <div class="flag-title">${f.title}</div>
          <div class="flag-sub">${f.sub}</div>
        </div>
        <span class="flag-chev">›</span>
      </a>`).join('')
    : `<div class="empty"><div class="empty-title">All clear</div><div class="empty-sub">No flags right now.</div></div>`;
}

function renderSchedule() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const rows = db.jobs()
    .filter((j) => j.scheduledDate === todayStr && j.scheduledTime)
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

  const dotByStatus = { waiting: 'dot-amber', in_progress: 'dot-blue', on_hold: 'dot-purple', scheduled: 'dot-green' };

  document.getElementById('schedule-body').innerHTML = rows.length
    ? rows.map((j) => {
        const c = db.customerById(j.customerId);
        const v = db.vehicleById(j.vehicleId);
        const tech = db.techById(j.techId);
        const bay = db.bayById(j.bayId);
        const assignment = [bay?.name, tech?.firstName].filter(Boolean).join(' • ') || 'Unassigned';
        return `
        <tr>
          <td><span class="row"><span class="dot ${dotByStatus[j.status] || 'dot-blue'}"></span>${util.fmtTime(j.scheduledTime)}</span></td>
          <td class="strong">${j.ro} · ${util.customerName(c) || 'Customer not assigned'}</td>
          <td>${util.vehicleLabel(v) || 'Vehicle not assigned'}</td>
          <td>${j.lineItems?.[0]?.name || 'No service listed'}</td>
          <td>${assignment}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5"><div class="empty"><div class="empty-title">Nothing scheduled</div><div class="empty-sub">Today's board is clear.</div></div></td></tr>`;
}

function renderTomorrow() {
  const t = util.tomorrowPreview();
  document.getElementById('tomorrow-body').innerHTML = `
    <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)"><span class="muted">Appointments</span><span class="tnum" style="font-weight:700;color:var(--ink)">${t.appts}</span></div>
    <div class="row between" style="padding:var(--s3) 0;border-bottom:1px solid var(--rule)"><span class="muted">Est. Labor Hours</span><span class="tnum" style="font-weight:700;color:var(--ink)">${t.estHours.toFixed(1)} hrs</span></div>
    <div class="row between" style="padding:var(--s3) 0"><span class="muted">Capacity</span><span class="tnum" style="font-weight:700;color:var(--ink)">${t.capacity.toFixed(1)} hrs</span></div>
    ${t.overCapacity ? `
      <div class="alert alert-red" style="margin-top:var(--s3)">
        ${ICONS.warning}
        <div><b>Over capacity by ${(t.estHours - t.capacity).toFixed(1)} hrs</b><br>Reschedule or confirm more techs.</div>
      </div>` : ''}
  `;
}

// Compact period summary only — "Outstanding" and "Billed Hrs" used to
// repeat here too, but both pull from util.computeKPIs() which is always
// today-only, so they never actually changed with the period toggle and
// were a pure (and slightly misleading) duplicate of the top hero. Collected/
// Invoiced/ARO/Invoice Count below are genuinely period-scoped (the toggle
// changes them), so they stay — this panel now only shows what the hero doesn't.
function renderOverview(period) {
  const stats = util.periodStats(period);
  document.getElementById('overview-rows').innerHTML = `
    <div class="ov-row"><span class="ov-l">Collected</span><span class="ov-v green tnum">${util.fmtMoney0(stats.collected)}</span></div>
    <div class="ov-row"><span class="ov-l">Invoiced</span><span class="ov-v tnum">${util.fmtMoney0(stats.invoiced)}</span></div>
    <div class="ov-row"><span class="ov-l">ARO</span><span class="ov-v tnum">${util.fmtMoney0(stats.aro)}</span></div>
    <div class="ov-row" style="border-bottom:none"><span class="ov-l">Invoice Count</span><span class="ov-v">${stats.count}</span></div>
  `;
}

function renderTeamPulse() {
  const techs = db.techs();
  const statusColor = { working: 'dot-green', idle: 'dot-amber', waiting: 'dot-blue', off: 'dot-gray' };
  const statusLabel = { working: 'Working', idle: 'Idle', waiting: 'Waiting', off: 'Off' };
  const statusTextColor = { working: '#5CD98A', idle: 'var(--amber)', waiting: '#7AA2FF', off: 'var(--panel-txt)' };

  document.getElementById('team-pulse').innerHTML = techs.map((t) => {
    const bay = db.bayById(t.bayId);
    const stats = util.techStats(t.id);
    return `
      <div class="panel-card">
        <div class="row between">
          <div class="pc-name">${t.firstName}</div>
          <span class="dot ${statusColor[t.workStatus] || 'dot-blue'}"></span>
        </div>
        <div class="pc-sub">${bay ? bay.name : 'No bay'} · ${stats.billedHoursToday.toFixed(1)} hrs • ${util.fmtMoney0(stats.revenueToday)}</div>
        <div style="color:${statusTextColor[t.workStatus] || '#fff'};font-weight:600;font-size:var(--t-13);margin-top:4px">${statusLabel[t.workStatus] || t.workStatus}</div>
      </div>`;
  }).join('');
}

function renderAiCoaching() {
  const insights = util.coachingInsights().slice(0, 3); // right panel stays scannable — 2-3 max
  document.getElementById('ai-coaching').innerHTML = insights.length
    ? insights.map((i) => `
      <div class="insight">
        <span class="insight-bubble">${ICONS[i.icon] || ICONS.idle}</span>
        <div class="insight-text"><b>${i.title}</b>${i.body ? ' — ' + i.body : ''}</div>
      </div>`).join('')
    : `<div class="insight"><div class="insight-text">No coaching notes right now — team's on pace.</div></div>`;
}

function renderGauge() {
  const u = util.utilization();
  const pct = Math.min(100, Math.round((u.bookedHours / (u.capacity || 1)) * 100));
  const color = pct >= 85 && pct <= 100 ? '#5CD98A' : pct > 100 ? '#FF8A8A' : '#F0A91B';
  // half-circle radial arc (180°), background track + colored value arc
  const r = 54, cx = 70, cy = 64;
  const circ = Math.PI * r;
  const valueLen = Math.min(pct, 120) / 100 * circ;
  document.getElementById('gauge-wrap').innerHTML = `
    <div class="gauge">
      <svg width="140" height="78" viewBox="0 0 140 78">
        <path d="M${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="var(--panel-rule)" stroke-width="10" fill="none" stroke-linecap="round"/>
        <path d="M${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round"
          stroke-dasharray="${valueLen} ${circ}"/>
      </svg>
      <div class="gauge-val" style="margin-top:-28px">${pct}%</div>
      <div class="gauge-cap">${u.bookedHours.toFixed(1)} / ${u.capacity} hrs</div>
      <div class="gauge-cap">Booked Hours vs Capacity</div>
    </div>`;
}
