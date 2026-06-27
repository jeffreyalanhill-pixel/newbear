// AutoBook — modules/marketing/mkt-campaigns.js (§D, Phase 1)
// Build a campaign from a segment + template + optional coupon, preview the
// rendered merge-field copy, then send (util.sendCampaign logs a
// Communication per recipient onto their CRM timeline).

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';

export function renderCampaigns(mount) {
  const segments = db.segments();
  const templates = db.templates();
  const coupons = (db.settings().coupons || []).filter((c) => c.active);

  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">New Campaign</div></div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">Name</label><input class="input" id="nc-name" placeholder="e.g. Spring Service Reminder"></div>
        <div class="field">
          <label class="label">Segment</label>
          <select class="select" id="nc-segment">${segments.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label class="label">Template</label>
          <select class="select" id="nc-template">${templates.map((t) => `<option value="${t.id}">${t.name}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label class="label">Coupon (optional)</label>
          <select class="select" id="nc-coupon">
            <option value="">No coupon</option>
            ${coupons.map((c) => `<option value="${c.code}">${c.code}</option>`).join('')}
          </select>
        </div>
        <div style="grid-column:1/-1">
          <div class="muted" style="font-size:var(--t-13);margin-bottom:var(--s2)">Preview (merge fields resolved for the first matching customer):</div>
          <div class="card navy" style="padding:var(--s4)" id="nc-preview">
            <div class="empty-sub" style="color:var(--panel-txt)">Select a segment and template to preview.</div>
          </div>
        </div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-campaign-btn">Create Campaign</button></div>
      </div>
    </div>
    <div class="card"><div class="card-head"><div class="card-title">Campaigns</div></div><div class="card-body" id="campaigns-list"></div></div>
  `;

  const updatePreview = () => renderPreview();
  document.getElementById('nc-segment').addEventListener('change', updatePreview);
  document.getElementById('nc-template').addEventListener('change', updatePreview);
  document.getElementById('nc-coupon').addEventListener('change', updatePreview);
  document.getElementById('add-campaign-btn').addEventListener('click', addCampaign);
  updatePreview();
  renderList();
}

function renderPreview() {
  const segmentId = document.getElementById('nc-segment').value;
  const templateId = document.getElementById('nc-template').value;
  const couponCode = document.getElementById('nc-coupon').value;
  const previewEl = document.getElementById('nc-preview');
  if (!segmentId || !templateId) return;

  const audience = util.previewAudience(segmentId);
  const template = db.templateById(templateId);
  if (!audience.length) {
    previewEl.innerHTML = '<div class="empty-sub" style="color:var(--panel-txt)">No contactable customers in this segment yet.</div>';
    return;
  }
  const sample = audience[0];
  const vehicle = db.vehiclesForCustomer(sample.id)[0];
  const vars = { firstName: sample.firstName, lastName: sample.lastName, vehicleMake: vehicle?.make || 'vehicle', vehicleModel: vehicle?.model || '', couponCode };
  previewEl.innerHTML = `
    <div style="font-weight:700;color:#fff;margin-bottom:6px">${util.renderTemplate(template.subject, vars)}</div>
    <div style="color:var(--panel-txt);font-size:var(--t-13)">${util.renderTemplate(template.body, vars)}</div>
    <div style="color:var(--panel-txt);font-size:var(--t-xs);margin-top:var(--s2)">Previewing for ${util.customerName(sample)} · ${audience.length} recipient${audience.length === 1 ? '' : 's'} total</div>
  `;
}

function addCampaign() {
  const name = document.getElementById('nc-name').value.trim();
  const segmentId = document.getElementById('nc-segment').value;
  const templateId = document.getElementById('nc-template').value;
  if (!name || !segmentId || !templateId) {
    toast('Name, segment, and template are all required.', 'error');
    return;
  }
  const campaigns = db.campaigns();
  campaigns.push({
    id: db.nextId('camp'),
    name,
    segmentId,
    templateId,
    couponCode: document.getElementById('nc-coupon').value || '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    sentAt: null,
    metrics: {},
  });
  db.saveCampaigns(campaigns);
  toast('Campaign created as a draft.', 'success');
  document.getElementById('nc-name').value = '';
  renderList();
}

function renderList() {
  const campaigns = db.campaigns().slice().reverse();
  document.getElementById('campaigns-list').innerHTML = campaigns.length
    ? campaigns.map((c) => {
        const segment = db.segmentById(c.segmentId);
        const template = db.templateById(c.templateId);
        return `
        <div class="camp-card" data-campaign-id="${c.id}">
          <div class="row between">
            <div>
              <div class="strong" style="color:var(--ink)">${c.name}</div>
              <div class="muted" style="font-size:var(--t-13)">${segment?.name || ''} · ${template?.name || ''}${c.couponCode ? ' · ' + c.couponCode : ''}</div>
            </div>
            <span class="badge ${c.status === 'sent' ? 'badge-green' : 'badge-gray'}">${c.status}${c.status === 'sent' ? ' · ' + (c.metrics?.sent || 0) + ' sent' : ''}</span>
          </div>
          ${c.status === 'draft' ? `<div style="margin-top:var(--s3)"><button class="btn btn-primary btn-sm" data-send="${c.id}">Send Campaign</button></div>` : ''}
        </div>`;
      }).join('')
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
}
