// AutoBook — modules/marketing/mkt-dashboard.js (§D)
// Marketing home: reachable audience, campaign/automation status, engagement
// + revenue placeholders (clearly labeled — no real send tracking exists),
// top segments, recent activity, and actionable suggested campaigns. All
// real numbers come from db/util; only engagement/revenue are explicit
// simulated seed data, called out as such in the UI.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import { setCampaignPrefill } from './mkt-app.js';

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
  const totalBooked = sent.reduce((s, c) => s + (c.metrics?.booked || 0), 0);
  const totalRevenue = campaigns.reduce((s, c) => s + (c.metrics?.revenue || 0), 0);
  const openRate = totalSent ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate = totalSent ? Math.round((totalClicked / totalSent) * 100) : 0;

  const topSegments = util.topSegments(4);
  const maxSegCount = Math.max(...topSegments.map((t) => t.count), 1);
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

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">${iconTrend()} Campaign Performance</div>
      </div>
      <div class="card-body">
        <div class="grid-3">
          <div>
            <div class="muted" style="font-size:var(--t-13)">Messages Sent</div>
            <div class="stat-value tnum" style="font-size:var(--t-2xl)">${totalSent}</div>
            <div class="muted" style="font-size:var(--t-13)">real — recipient count at send time</div>
          </div>
          <div>
            <div class="muted" style="font-size:var(--t-13)">Open / Click Rate</div>
            <div class="stat-value tnum" style="font-size:var(--t-2xl)">${openRate}% <small style="font-size:var(--t-md);color:var(--ink-3)">/ ${clickRate}%</small></div>
            <div class="muted" style="font-size:var(--t-13)">simulated — no real email/SMS sending yet</div>
          </div>
          <div>
            <div class="muted" style="font-size:var(--t-13)">Booked / Revenue Influenced</div>
            <div class="stat-value tnum" style="font-size:var(--t-2xl)">${totalBooked} <small style="font-size:var(--t-md);color:var(--ink-3)">/ ${util.fmtMoney0(totalRevenue)}</small></div>
            <div class="muted" style="font-size:var(--t-13)">simulated — not tied to real attribution</div>
          </div>
        </div>
        <div class="row" style="gap:6px;margin-top:var(--s3);padding-top:var(--s3);border-top:1px solid var(--rule)">
          <span class="dot" style="background:var(--ink-4)"></span>
          <span class="muted" style="font-size:var(--t-xs)">Open/click rate and revenue figures are simulated — no real email/SMS sending exists yet.</span>
        </div>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconBolt()}</span><span class="stat-label">Automated Reminders</span></div>
        <div class="stat-value">${automationsOn.length}<small style="font-size:var(--t-md);color:var(--ink-3)"> / ${db.automations().length}</small></div>
        <div class="stat-sub">enabled — see the Automations tab</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconMail()}</span><span class="stat-label">Engagement</span></div>
        <div class="stat-value">${openRate}<small style="font-size:var(--t-md)">% open</small></div>
        <div class="stat-sub">${clickRate}% click · simulated, no real email/SMS sending yet</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconTrend()}</span><span class="stat-label">Revenue Influenced</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(totalRevenue)}</div>
        <div class="stat-sub">Simulated metric — not tied to real attribution yet</div>
      </div>
    </div>

    <div class="grid-2" style="margin-bottom:var(--s4);align-items:start">
      <div class="card">
        <div class="card-head"><div class="card-title">Top customer segments</div></div>
        <div class="card-body">
          ${topSegments.length
            ? topSegments.map((t) => {
                const color = segmentColor(t.segment.id);
                return `
              <div style="padding:var(--s2) 0;border-bottom:1px solid var(--rule)">
                <div class="row between"><span>${t.segment.name}</span><span class="badge badge-${color}">${t.count}</span></div>
                <div class="mkt-bar-track"><div class="mkt-bar-fill ${color}" style="width:${(t.count / maxSegCount) * 100}%"></div></div>
              </div>`;
              }).join('')
            : '<div class="empty-sub">No segments yet.</div>'}
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Suggested campaigns</div></div>
        <div class="card-body">
          ${suggestions.length
            ? suggestions.map((s) => `
              <div class="suggestion-row">
                <div>
                  <div class="strong" style="color:var(--ink)">${s.name}</div>
                  <div class="muted" style="font-size:var(--t-13)">${s.audienceSize} reachable customer${s.audienceSize === 1 ? '' : 's'} · <span class="badge ${suggestionCategory(s).cls}">${suggestionCategory(s).label}</span></div>
                </div>
                <button class="btn btn-primary btn-sm" data-suggest="${s.name}" data-type="${s.type}" data-segment="${s.segmentId}">Create</button>
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
                <span class="row" style="gap:var(--s2)">
                  <span class="insight-bubble" style="background:var(--canvas);color:var(--ink-3);width:26px;height:26px">${TYPE_ICON[c.type] || iconMegaphone()}</span>
                  <span>${c.name} <span class="muted">· ${segment?.name || ''}</span></span>
                </span>
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

  document.querySelectorAll('[data-suggest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setCampaignPrefill({ name: btn.dataset.suggest, type: btn.dataset.type, segmentId: btn.dataset.segment });
      toast(`Drafting "${btn.dataset.suggest}" — finish it in the builder.`);
    });
  });
}

const STATUS_BADGE = { draft: 'badge-gray', scheduled: 'badge-amber', sent: 'badge-green', paused: 'badge-purple', failed: 'badge-red' };

// Suggested-campaign category chip — derived from segment + type, not a
// stored field, so it stays correct as new suggestions are added.
function suggestionCategory(s) {
  if (s.segmentId === 'seg_inactive') return { label: 'Win-back', cls: 'badge-purple' };
  if (s.segmentId === 'seg_declined') return { label: 'Declined work', cls: 'badge-amber' };
  if (s.type === 'review_request') return { label: 'Review request', cls: 'badge-green' };
  if (s.type === 'reminder') return { label: 'Reminder', cls: 'badge-blue' };
  return { label: s.type.replace('_', ' '), cls: 'badge-gray' };
}

// Top-segments progress-bar/chip color — by segment id where the meaning is
// explicit, falling back to blue (audience) for anything else.
const SEGMENT_COLOR = { seg_all: 'blue', seg_due_oil: 'amber', seg_due_tire: 'purple', seg_new: 'green', seg_inactive: 'red', seg_declined: 'amber', seg_returning: 'green', seg_fleet: 'blue' };
function segmentColor(id) { return SEGMENT_COLOR[id] || 'blue'; }
const TYPE_ICON = {
  email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  sms: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  reminder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  promotion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  review_request: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>',
  postcard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="13" rx="1"/><path d="M2 9h20M7 13h4"/></svg>',
};

function iconMegaphone() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a2 2 0 11-3.2 2.4"/></svg>'; }
function iconMail() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>'; }
function iconUsers() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>'; }
function iconCalendar() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>'; }
function iconBolt() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>'; }
function iconTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;display:inline-block;vertical-align:middle;margin-right:4px"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
