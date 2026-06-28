// AutoBook — modules/marketing/mkt-campaigns.js (§D)
// Campaign builder (type, segment, subject/body, offer, schedule date) +
// list. "Send Now" logs a Communication per recipient via util.sendCampaign
// (real); scheduling a date just sets status/scheduledAt for display — there
// is no real scheduler/sender running in the background in this MVP.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import { takeCampaignPrefill } from './mkt-app.js';

const CAMPAIGN_TYPES = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'postcard', label: 'Postcard' },
  { value: 'review_request', label: 'Review Request' },
  { value: 'reminder', label: 'Reminder' },
  { value: 'promotion', label: 'Promotion' },
];

const STATUS_BADGE = { draft: 'badge-gray', scheduled: 'badge-amber', sent: 'badge-green', paused: 'badge-red' };

export function renderCampaigns(mount) {
  const segments = db.segments();
  const coupons = (db.settings().coupons || []).filter((c) => c.active);

  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">Campaign Builder</div>
        <span class="badge badge-blue">New</span>
      </div>
      <div class="card-body">
        <div class="section-label" style="margin-bottom:var(--s3)">1 · Basics</div>
        <div class="grid-2" style="margin-bottom:var(--s5)">
          <div class="field"><label class="label">Campaign name</label><input class="input" id="nc-name" placeholder="e.g. Spring Service Reminder"></div>
          <div class="field">
            <label class="label">Type</label>
            <select class="select" id="nc-type">${CAMPAIGN_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}</select>
          </div>
        </div>

        <div class="section-label" style="margin-bottom:var(--s3)">2 · Audience &amp; Message</div>
        <div class="grid-2" style="margin-bottom:var(--s5)">
          <div class="field" style="grid-column:1/-1">
            <label class="label">Customer segment</label>
            <select class="select" id="nc-segment">${segments.map((s) => `<option value="${s.id}">${s.name} (${db.segmentMembers(s.id).length} reachable)</option>`).join('')}</select>
          </div>
          <div class="field" style="grid-column:1/-1"><label class="label">Subject / title</label><input class="input" id="nc-subject" placeholder="e.g. Time for an oil change, {{firstName}}?"></div>
          <div class="field" style="grid-column:1/-1"><label class="label">Message</label><textarea class="textarea" id="nc-body" placeholder="Hi {{firstName}}, ..."></textarea></div>
        </div>

        <div class="section-label" style="margin-bottom:var(--s3)">3 · Offer &amp; Schedule</div>
        <div class="grid-2" style="margin-bottom:var(--s5)">
          <div class="field">
            <label class="label">Offer / coupon (optional)</label>
            <select class="select" id="nc-offer">
              <option value="">No offer</option>
              ${coupons.map((c) => `<option value="${c.code}">${c.code}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label class="label">Schedule date (optional)</label><input class="input" type="date" id="nc-schedule"></div>
        </div>

        <div class="section-label" style="margin-bottom:var(--s3)">4 · Preview &amp; Save</div>
        <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s2)">Merge fields resolved for the first matching customer:</div>
        <div class="card navy" style="padding:var(--s4);margin-bottom:var(--s4)" id="nc-preview">
          <div class="empty-sub" style="color:var(--panel-txt)">Select a segment and enter a message to preview.</div>
        </div>
        <button class="btn btn-primary" id="add-campaign-btn">Save as Draft</button>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Campaigns</div>
        <span class="badge badge-gray">opened/booked are placeholders until real sending exists</span>
      </div>
      <div class="card-body" id="campaigns-list"></div>
    </div>
  `;

  const updatePreview = () => renderPreview();
  ['nc-segment', 'nc-subject', 'nc-body', 'nc-offer'].forEach((id) => document.getElementById(id).addEventListener('input', updatePreview));
  document.getElementById('add-campaign-btn').addEventListener('click', addCampaign);
  applyPrefill();
  updatePreview();
  renderList();
}

function applyPrefill() {
  const prefill = takeCampaignPrefill();
  if (!prefill) return;
  document.getElementById('nc-name').value = prefill.name || '';
  document.getElementById('nc-type').value = prefill.type || 'email';
  if (prefill.segmentId) document.getElementById('nc-segment').value = prefill.segmentId;
  document.getElementById('nc-subject').focus();
}

function renderPreview() {
  const segmentId = document.getElementById('nc-segment').value;
  const subject = document.getElementById('nc-subject').value;
  const body = document.getElementById('nc-body').value;
  const offer = document.getElementById('nc-offer').value;
  const previewEl = document.getElementById('nc-preview');
  if (!segmentId || (!subject && !body)) {
    previewEl.innerHTML = '<div class="empty-sub" style="color:var(--panel-txt)">Select a segment and enter a message to preview.</div>';
    return;
  }

  const audience = util.previewAudience(segmentId);
  if (!audience.length) {
    previewEl.innerHTML = '<div class="empty-sub" style="color:var(--panel-txt)">No contactable customers in this segment yet.</div>';
    return;
  }
  const sample = audience[0];
  const vehicle = db.vehiclesForCustomer(sample.id)[0];
  const vars = { firstName: sample.firstName, lastName: sample.lastName, vehicleMake: vehicle?.make || 'vehicle', vehicleModel: vehicle?.model || '', couponCode: offer };
  previewEl.innerHTML = `
    <div style="font-weight:700;color:#fff;margin-bottom:6px">${util.renderTemplate(subject, vars)}</div>
    <div style="color:var(--panel-txt);font-size:var(--t-13)">${util.renderTemplate(body, vars)}</div>
    <div style="color:var(--panel-txt);font-size:var(--t-xs);margin-top:var(--s2)">Previewing for ${util.customerName(sample)} · ${audience.length} recipient${audience.length === 1 ? '' : 's'} total</div>
  `;
}

function addCampaign() {
  const name = document.getElementById('nc-name').value.trim();
  const segmentId = document.getElementById('nc-segment').value;
  const subject = document.getElementById('nc-subject').value.trim();
  const body = document.getElementById('nc-body').value.trim();
  if (!name || !segmentId || !subject || !body) {
    toast('Name, segment, subject, and message are all required.', 'error');
    return;
  }
  const scheduleDate = document.getElementById('nc-schedule').value;
  const campaigns = db.campaigns();
  campaigns.push({
    id: db.nextId('camp'),
    name,
    type: document.getElementById('nc-type').value,
    status: scheduleDate ? 'scheduled' : 'draft',
    segmentId,
    subject,
    body,
    offer: document.getElementById('nc-offer').value || '',
    scheduledAt: scheduleDate ? new Date(scheduleDate + 'T09:00:00').toISOString() : null,
    sentAt: null,
    metrics: {},
  });
  db.saveCampaigns(campaigns);
  toast(scheduleDate ? 'Campaign scheduled.' : 'Campaign saved as a draft.', 'success');
  ['nc-name', 'nc-subject', 'nc-body', 'nc-schedule'].forEach((id) => (document.getElementById(id).value = ''));
  renderPreview();
  renderList();
}

function renderList() {
  const campaigns = db.campaigns().slice().reverse();
  document.getElementById('campaigns-list').innerHTML = campaigns.length
    ? `<table class="table">
        <thead><tr><th>Campaign</th><th>Type</th><th>Segment</th><th>Status</th><th class="num">Sent</th><th class="num">Opened</th><th class="num">Booked</th><th></th></tr></thead>
        <tbody>
          ${campaigns.map((c) => {
            const segment = db.segmentById(c.segmentId);
            const m = c.metrics || {};
            return `
            <tr>
              <td class="strong">${c.name}</td>
              <td>${(c.type || '').replace('_', ' ')}</td>
              <td>${segment?.name || '—'}</td>
              <td><span class="badge ${STATUS_BADGE[c.status] || 'badge-gray'}">${c.status}</span></td>
              <td class="num tnum">${m.sent ?? '—'}</td>
              <td class="num tnum">${m.opened ?? '—'}</td>
              <td class="num tnum">${m.booked ?? '—'}</td>
              <td>
                ${c.status === 'draft' || c.status === 'scheduled' ? `<button class="btn btn-primary btn-sm" data-send="${c.id}">Send Now</button>` : ''}
                ${c.status === 'scheduled' ? `<button class="btn btn-secondary btn-sm" data-pause="${c.id}">Pause</button>` : ''}
                ${c.status === 'paused' ? `<button class="btn btn-secondary btn-sm" data-resume="${c.id}">Resume</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`
    : '<div class="empty"><div class="empty-title">No campaigns yet</div><div class="empty-sub">Create one above.</div></div>';

  document.querySelectorAll('[data-send]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Send this campaign now? This logs a message to every matching customer\'s timeline.', { confirmLabel: 'Send', danger: false });
      if (!confirmed) return;
      try {
        const result = util.sendCampaign(btn.dataset.send);
        toast(`Sent to ${result.recipientCount} customer${result.recipientCount === 1 ? '' : 's'}.`, 'success');
        renderList();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  document.querySelectorAll('[data-pause]').forEach((btn) => {
    btn.addEventListener('click', () => setStatus(btn.dataset.pause, 'paused', 'Campaign paused.'));
  });
  document.querySelectorAll('[data-resume]').forEach((btn) => {
    btn.addEventListener('click', () => setStatus(btn.dataset.resume, 'scheduled', 'Campaign resumed.'));
  });
}

function setStatus(campaignId, status, message) {
  const campaigns = db.campaigns();
  const c = campaigns.find((x) => x.id === campaignId);
  c.status = status;
  db.saveCampaigns(campaigns);
  toast(message);
  renderList();
}
