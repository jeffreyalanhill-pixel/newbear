// AutoBook — modules/marketing/mkt-dashboard.js (§D, Phase 1)
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

export function renderMktDashboard(mount) {
  const campaigns = db.campaigns();
  const sent = campaigns.filter((c) => c.status === 'sent');
  const totalSent = sent.reduce((s, c) => s + (c.metrics?.sent || 0), 0);
  const comms = db.communications();

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconMegaphone()}</span><span class="stat-label">Campaigns Sent</span></div>
        <div class="stat-value">${sent.length}</div>
        <div class="stat-sub">${campaigns.length - sent.length} draft</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconMail()}</span><span class="stat-label">Messages Sent</span></div>
        <div class="stat-value">${totalSent}</div>
        <div class="stat-sub">${comms.length} total in the communication log</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconUsers()}</span><span class="stat-label">Segments</span></div>
        <div class="stat-value">${db.segments().length}</div>
        <div class="stat-sub">${db.customers().filter((c) => !c.doNotContact).length} contactable customers</div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Recent campaigns</div></div>
      <div class="card-body">
        ${campaigns.length
          ? campaigns.slice().reverse().map((c) => {
              const segment = db.segmentById(c.segmentId);
              return `<div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <span>${c.name} <span class="muted">· ${segment?.name || ''}</span></span>
                <span class="badge ${c.status === 'sent' ? 'badge-green' : 'badge-gray'}">${c.status}${c.status === 'sent' ? ' · ' + (c.metrics?.sent || 0) + ' sent' : ''}</span>
              </div>`;
            }).join('')
          : '<div class="empty-sub">No campaigns yet — create one in the Campaigns tab.</div>'}
      </div>
    </div>
  `;
}

function iconMegaphone() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a2 2 0 11-3.2 2.4"/></svg>';
}
function iconMail() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';
}
function iconUsers() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>';
}
