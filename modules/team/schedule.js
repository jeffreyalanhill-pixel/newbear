// AutoBook — modules/team/schedule.js (§B.4.4, Phase 1 — basic week view)

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

function weekStart() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1); // Monday
  return d.toISOString().slice(0, 10);
}

export function renderSchedule(mount) {
  const start = weekStart();
  const shifts = db.shiftsForWeek(start);
  const employees = db.employees().filter((e) => shifts.some((s) => s.employeeId === e.id));
  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + i);
    return d;
  });

  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">This week</div></div>
      <div class="card-body">
        <div class="sched-grid">
          <div class="sched-cell head">Employee</div>
          ${days.map((d) => `<div class="sched-cell head">${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}</div>`).join('')}
          ${employees.map((e) => `
            <div class="sched-cell name">${e.firstName} ${e.lastName}</div>
            ${days.map((d) => {
              const dateStr = d.toISOString().slice(0, 10);
              const shift = shifts.find((s) => s.employeeId === e.id && s.date === dateStr);
              return `<div class="sched-cell">${shift ? `${util.fmtTime(shift.start)} – ${util.fmtTime(shift.end)}` : '<span class="muted">Off</span>'}</div>`;
            }).join('')}
          `).join('')}
        </div>
        ${!employees.length ? '<div class="empty"><div class="empty-title">No shifts scheduled</div><div class="empty-sub">Nothing published for this week yet.</div></div>' : ''}
      </div>
    </div>
  `;
}
