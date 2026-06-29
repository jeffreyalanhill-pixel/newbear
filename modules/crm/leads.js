// AutoBook — modules/crm/leads.js (§C.3/C.4, Phase 1)
// Manual CRM track for non-booked prospects (phone/walk-in/web-form/campaign).
// Public booking requests do NOT create leads — see util.convertLead's header
// comment for why. Converting a lead creates a real Customer via the same
// findOrCreateCustomer path booking confirmation uses.

import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast, confirmDialog } from '../../lib/nav.js';
import * as workflow from '../../lib/workflow.js';
import { openOutreachPanel } from './outreach.js';
import { isManagerView } from './crm-app.js';

const STATUS_BADGE = {
  new: 'badge-blue',
  contacted: 'badge-amber',
  waiting: 'badge-amber',
  estimate_needed: 'badge-purple',
  converted: 'badge-green',
  lost: 'badge-red',
  nurture: 'badge-gray',
};

export function renderLeads(mount) {
  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head">
        <div class="card-title">New Lead</div>
      </div>
      <div class="card-body grid-2">
        <div class="field"><label class="label">First name</label><input class="input" id="nl-first"></div>
        <div class="field"><label class="label">Last name</label><input class="input" id="nl-last"></div>
        <div class="field"><label class="label">Phone</label><input class="input" id="nl-phone"></div>
        <div class="field"><label class="label">Email</label><input class="input" id="nl-email"></div>
        <div class="field">
          <label class="label">Source</label>
          <select class="select" id="nl-source">
            <option value="phone">Phone</option>
            <option value="walk_in">Walk-in</option>
            <option value="website_form">Website form</option>
            <option value="facebook">Facebook</option>
            <option value="gbp">Google Business</option>
            <option value="referral">Referral</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div class="field"><label class="label">Service interest</label><input class="input" id="nl-interest" placeholder="e.g. Brakes"></div>
        <div class="field" style="grid-column:1/-1"><label class="label">Notes</label><textarea class="textarea" id="nl-notes"></textarea></div>
        <div style="grid-column:1/-1"><button class="btn btn-primary" id="add-lead-btn">Add Lead</button></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><div class="card-title">Leads</div></div>
      <div class="card-body" id="leads-list"></div>
    </div>
  `;

  document.getElementById('add-lead-btn').addEventListener('click', addLead);
  renderList();
}

function addLead() {
  const first = document.getElementById('nl-first').value.trim();
  const last = document.getElementById('nl-last').value.trim();
  const phone = document.getElementById('nl-phone').value.trim();
  if (!first || !phone) {
    toast('First name and phone are required.', 'error');
    return;
  }
  const leads = db.leads();
  leads.push({
    id: db.nextId('lead'),
    firstName: first,
    lastName: last,
    phone,
    email: document.getElementById('nl-email').value.trim(),
    source: document.getElementById('nl-source').value,
    status: 'new',
    serviceInterest: document.getElementById('nl-interest').value.split(',').map((s) => s.trim()).filter(Boolean),
    vehicle: {},
    notes: document.getElementById('nl-notes').value.trim(),
    assignedAdvisorId: null,
    createdAt: new Date().toISOString(),
    lastContactedAt: null,
    nextFollowUpAt: null,
    customerId: null,
    lostReason: null,
  });
  db.saveLeads(leads);
  toast('Lead added.', 'success');
  ['nl-first', 'nl-last', 'nl-phone', 'nl-email', 'nl-interest', 'nl-notes'].forEach((id) => (document.getElementById(id).value = ''));
  renderList();
}

function renderList() {
  const manager = isManagerView();
  const me = db.employeeById(db.settings().currentUserId);
  // Personal CRM: never show a peer's leads — see lib/workflow.js's
  // getMyLeads, the same filter the Personal Workspace view uses.
  // Personal view: my own leads PLUS unclaimed ones (so front desk/advisors
  // can still pick up an unassigned lead) — never a peer's already-assigned lead.
  let leads = manager ? db.leads() : db.leads().filter((l) => l.assignedAdvisorId === me?.id || !l.assignedAdvisorId);
  leads = leads.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const advisors = db.employees().filter((e) => !['technician', 'apprentice', 'parts'].includes(e.role));

  document.getElementById('leads-list').innerHTML = leads.length
    ? leads.map((l) => {
        const owner = l.assignedAdvisorId ? db.employeeById(l.assignedAdvisorId) : null;
        return `
      <div class="lead-card" data-lead-id="${l.id}">
        <div class="lc-head">
          <div>
            <div class="lc-name">${l.firstName} ${l.lastName}</div>
            <div class="lc-sub">${l.phone}${l.email ? ' · ' + l.email : ''}</div>
          </div>
          <span class="badge ${STATUS_BADGE[l.status] || 'badge-gray'}">${l.status.replace('_', ' ')}</span>
        </div>
        <div class="lc-sub">${l.vehicle?.make ? `${l.vehicle.year} ${l.vehicle.make} ${l.vehicle.model} · ` : ''}${(l.serviceInterest || []).join(', ') || 'No service interest noted'}</div>
        <div class="lc-meta">
          <span class="badge badge-gray">${sourceLabel(l.source)}</span>
          <span class="badge badge-gray">${util.timeAgo(l.createdAt)}</span>
          <span class="badge ${owner ? 'badge-blue' : 'badge-amber'}">${owner ? owner.firstName : 'Unassigned'}</span>
          ${l.lastContactedAt ? '' : '<span class="badge badge-amber">Not contacted</span>'}
        </div>
        ${l.notes ? `<div class="lc-sub" style="margin-top:var(--s2)">${l.notes}</div>` : ''}
        ${l.status !== 'converted' && l.status !== 'lost' ? `
          <div class="lc-actions">
            ${manager ? `<select class="select" data-assign="${l.id}" style="width:auto;font-size:var(--t-13)">
              <option value="">Unassigned</option>
              ${advisors.map((e) => `<option value="${e.id}" ${e.id === l.assignedAdvisorId ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
            </select>` : !l.assignedAdvisorId ? `<button class="btn btn-secondary btn-sm" data-claim="${l.id}">Assign to me</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-outreach="${l.id}">Outreach</button>
            <button class="btn btn-primary btn-sm" data-convert="${l.id}">Convert to Customer</button>
            <button class="btn btn-secondary btn-sm" data-lost="${l.id}">Mark Lost</button>
          </div>` : ''}
      </div>`;
      }).join('')
    : `<div class="empty"><div class="empty-title">No leads ${manager ? 'yet' : 'assigned to you'}</div><div class="empty-sub">${manager ? 'Add one above to start working it.' : 'Ask a manager to assign you one.'}</div></div>`;

  document.querySelectorAll('[data-convert]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Convert this lead into a customer record?', { confirmLabel: 'Convert', danger: false });
      if (!confirmed) return;
      try {
        const { customer } = util.convertLead(btn.dataset.convert);
        toast(`Converted to customer ${util.customerName(customer)}.`, 'success');
        renderList();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
  document.querySelectorAll('[data-lost]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmed = await confirmDialog('Mark this lead as lost?', { confirmLabel: 'Mark Lost' });
      if (!confirmed) return;
      const leads = db.leads();
      const lead = leads.find((l) => l.id === btn.dataset.lost);
      lead.status = 'lost';
      db.saveLeads(leads);
      toast('Lead marked lost.');
      renderList();
    });
  });
  document.querySelectorAll('[data-assign]').forEach((sel) => {
    sel.addEventListener('change', () => {
      workflow.assignLeadOwner(sel.dataset.assign, sel.value || null);
      toast('Lead owner updated.', 'success');
      renderList();
    });
  });
  document.querySelectorAll('[data-claim]').forEach((btn) => {
    btn.addEventListener('click', () => {
      workflow.assignLeadOwner(btn.dataset.claim, me?.id);
      toast('Lead assigned to you.', 'success');
      renderList();
    });
  });
  document.querySelectorAll('[data-outreach]').forEach((btn) => {
    btn.addEventListener('click', () => openOutreachPanel({ lead: db.leadById(btn.dataset.outreach) }));
  });
}

function sourceLabel(s) {
  return { phone: 'Phone', walk_in: 'Walk-in', website_form: 'Website form', facebook: 'Facebook', gbp: 'Google Business', referral: 'Referral', manual: 'Manual' }[s] || s;
}
