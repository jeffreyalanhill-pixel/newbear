// AutoBook — modules/marketing/mkt-automations.js (§D)
// Automation ideas as visual/status cards only. Toggling on/off flips
// db.automations() status — there is no real trigger engine behind this yet
// (no scheduled jobs run anything when a customer becomes "inactive", etc.).
// That's intentionally out of scope for this step.

import { db } from '../../lib/data.js';
import { toast } from '../../lib/nav.js';

export function renderAutomations(mount) {
  mount.innerHTML = `
    <div class="alert alert-amber" style="margin-bottom:var(--s4)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0zM12 9v4M12 17h.01"/></svg>
      <div><b>These are status cards, not a live automation engine.</b><br>Turning one on records the preference only — no messages are sent automatically yet.</div>
    </div>
    <div class="grid-3" id="automation-cards"></div>
  `;
  render();
}

function render() {
  const automations = db.automations();
  document.getElementById('automation-cards').innerHTML = automations.map((a) => `
    <div class="stat-card" style="${a.status === 'on' ? 'border-color:var(--green)' : ''}">
      <div class="stat-head">
        <span class="stat-icon ${a.status === 'on' ? 'green' : 'amber'}">${iconBolt()}</span>
        <span class="stat-label">${a.name}</span>
      </div>
      <div class="muted" style="font-size:var(--t-13);margin:var(--s2) 0">${a.description}</div>
      <div class="muted" style="font-size:var(--t-xs);margin-bottom:var(--s2)">Trigger: ${a.trigger}</div>
      <div class="auto-toggle-row" data-toggle="${a.id}">
        <span class="badge ${a.status === 'on' ? 'badge-green' : 'badge-gray'}">${a.status === 'on' ? 'Enabled' : 'Disabled'}</span>
        <span class="row" style="gap:var(--s2)">
          <span class="toggle-label">${a.status === 'on' ? 'Turn off' : 'Turn on'}</span>
          <span class="toggle ${a.status === 'on' ? 'on' : ''}"></span>
        </span>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const automations = db.automations();
      const a = automations.find((x) => x.id === el.dataset.toggle);
      a.status = a.status === 'on' ? 'off' : 'on';
      db.saveAutomations(automations);
      toast(`${a.name} ${a.status === 'on' ? 'enabled' : 'disabled'}.`);
      render();
    });
  });
}

function iconBolt() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>';
}
