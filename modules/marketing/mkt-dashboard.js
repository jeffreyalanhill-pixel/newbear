// AutoBook — modules/marketing/mkt-dashboard.js (§D)
// Marketing home: reachable audience, campaign/automation status, engagement
// + revenue placeholders (clearly labeled — no real send tracking exists),
// top segments, recent activity, and suggested campaigns. All real numbers
// come from db/util; only engagement/revenue are explicit simulated seed
// data, called out as such in the UI.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';

export function renderMktDashboard(mount) {
  const customers = db.customers();
  const reachable = customers.filter((c) => !c.doNotContact);
  const campaigns = db.campaigns();
  const active = campaigns.filter((c) => c.status === 'sent' || c.status === 'scheduled');
  const scheduled = campaigns.filter((c) => c.status === 'scheduled');
  const sent = campaigns.filter((c) => c.status === 'sent');
  const automationsOn = db.automations().filter((a) => a.status === 'on');

  const totalSent = sent.reduce((s, c) => s + (c.metrics?.sent || 0), 0);
  const totalOpened = sent.reduce((s, c) => s + (c.metrics?.opened || 0), 0);
  const totalClicked = sent.reduce((s, c) => s + (c.metrics?.clicked || 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + (c.metrics?.revenue || 0), 0);
  const openRate = totalSent ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate = totalSent ? Math.round((totalClicked / totalSent) * 100) : 0;

  const topSegments = util.topSegments(4);
  const suggestions = util.suggestedCampaigns(3);
  const recentActivity = campaigns
    .filter((c) => c.sentAt || c.scheduledAt)
    .slice()
    .sort((a, b) => new Date(b.sentAt || b.scheduledAt) - new Date(a.sentAt || a.scheduledAt))
    .slice(0, 5);

  mount.innerHTML = `
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconUsers()}</span><span class="stat-label">Customers Reachable</span></div>
        <div class="stat-value">${reachable.length}</div>
        <div class="stat-sub">${customers.length - reachable.length} opted out</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconMegaphone()}</span><span class="stat-label">Active Campaigns</span></div>
        <div class="stat-value">${active.length}</div>
        <div class="stat-sub">${campaigns.filter((c) => c.status === 'draft').length} draft</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon amber">${iconCalendar()}</span><span class="stat-label">Scheduled Campaigns</span></div>
        <div class="stat-value">${scheduled.length}</div>
        <div class="stat-sub">${sent.length} sent all-time</div>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconBolt()}</span><span class="stat-label">Automated Reminders</span></div>
        <div class="stat-value">${automationsOn.length}<small style="font-size:var(--t-md);color:var(--ink-3)"> / ${db.automations().length}</small></div>
        <div class="stat-sub">enabled — see the Automations tab</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconMail()}</span><span class="stat-label">Engagement <span class="badge badge-gray" style="margin-left:4px;font-size:10px">placeholder</span></span></div>
        <div class="stat-value">${openRate}<small style="font-size:var(--t-md)">% open</small></div>
        <div class="stat-sub">${clickRate}% click · simulated, no real email/SMS sending yet</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconTrend()}</span><span class="stat-label">Revenue Influenced <span class="badge badge-gray" style="margin-left:4px;font-size:10px">placeholder</span></span></div>
        <div class="stat-value tnum">${util.fmtMoney0(totalRevenue)}</div>
        <div class="stat-sub">Simulated metric — not tied to real attribution yet</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      <div class="card">
        <div class="card-head"><div class="card-title">Top customer segments</div></div>
        <div class="card-body">
          ${topSegments.length
            ? topSegments.map((t) => `
              <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <span>${t.segment.name}</span>
                <span class="badge badge-blue">${t.count}</span>
              </div>`).join('')
            : '<div class="empty-sub">No segments yet.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Suggested campaigns</div></div>
        <div class="card-body">
          ${suggestions.length
            ? suggestions.map((s) => `
              <div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <div>
                  <div>${s.name}</div>
                  <div class="muted" style="font-size:var(--t-13)">${s.audienceSize} reachable customer${s.audienceSize === 1 ? '' : 's'}</div>
                </div>
                <span class="badge badge-gray">${s.type.replace('_', ' ')}</span>
              </div>`).join('')
            : '<div class="empty-sub">You\'ve created every suggested campaign type — nice.</div>'}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><div class="card-title">Recent campaign activity</div></div>
      <div class="card-body">
        ${recentActivity.length
          ? recentActivity.map((c) => {
              const segment = db.segmentById(c.segmentId);
              return `<div class="row between" style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <span>${c.name} <span class="muted">· ${segment?.name || ''}</span></span>
                <span class="row" style="gap:var(--s2)">
                  <span class="muted" style="font-size:var(--t-13)">${util.fmtDate(c.sentAt || c.scheduledAt)}</span>
                  <span class="badge ${STATUS_BADGE[c.status] || 'badge-gray'}">${c.status}${c.status === 'sent' ? ' · ' + (c.metrics?.sent || 0) + ' sent' : ''}</span>
                </span>
              </div>`;
            }).join('')
          : '<div class="empty-sub">No campaign activity yet — create one in the Campaigns tab.</div>'}
      </div>
    </div>
  `;
}

const STATUS_BADGE = { draft: 'badge-gray', scheduled: 'badge-amber', sent: 'badge-green', paused: 'badge-red' };

function iconMegaphone() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a2 2 0 11-3.2 2.4"/></svg>'; }
function iconMail() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'; }
function iconUsers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function iconCalendar() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>'; }
function iconBolt() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>'; }
function iconTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
