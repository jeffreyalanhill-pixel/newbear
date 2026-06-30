// AutoBook — modules/crm/crm-drawers.js
// Shared CRM detail drawers for Follow-Up tasks and Quotes.
// Customer and Lead drawers live in customers.js and leads.js respectively.
// Importing from crm-app.js is intentional — circular refs work here because
// openCrmDrawer / closeCrmDrawer / isManagerView are function declarations
// (hoisted) and are never called at module-evaluation time.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import * as workflow from '../../lib/workflow.js';
import { openCrmDrawer, closeCrmDrawer, isManagerView } from './crm-app.js';
import { openOutreachPanel } from './outreach.js';

// ---------------------------------------------------------------------------
// Follow-Up Detail Drawer
// ---------------------------------------------------------------------------
export function openFollowUpDrawer(taskId) {
  const task = db.followUpTasks().find((t) => t.id === taskId);
  if (!task) { toast('Follow-up not found.', 'error'); return; }

  const owner = task.ownerId ? db.employeeById(task.ownerId) : null;
  const customer = task.customerId ? db.customerById(task.customerId) : null;
  const lead = (task.relatedType === 'lead' && task.relatedId) ? db.leadById(task.relatedId) : null;
  const isOverdue = task.status === 'open' && new Date(task.dueAt).getTime() < Date.now();
  const manager = isManagerView();
  const advisors = db.employees().filter((e) => !['technician', 'apprentice', 'parts'].includes(e.role));
  const relatedName = customer ? util.customerName(customer) : lead ? `${lead.firstName} ${lead.lastName}` : 'No linked record';

  openCrmDrawer(`
    <div class="modal-head" style="padding:var(--s5)">
      <div>
        <div class="modal-title">${task.title || 'Follow-up'}</div>
        <div class="muted" style="font-size:var(--t-13)">${(task.taskType || 'other').replace(/_/g, ' ')} · ${isOverdue ? '<span style="color:var(--red)">Overdue</span>' : 'Due ' + util.fmtDate(task.dueAt)}</div>
      </div>
      <button class="icon-btn" id="close-fu-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div style="padding:0 var(--s5) var(--s5)">

      <div class="grid-2" style="gap:var(--s3);margin-bottom:var(--s4)">
        <div><div class="section-label">Related to</div><div>${relatedName}</div></div>
        <div><div class="section-label">Assigned to</div><div>${owner ? owner.firstName + ' ' + owner.lastName : '<span class="badge badge-amber">Unassigned</span>'}</div></div>
        <div><div class="section-label">Due</div><div style="${isOverdue ? 'color:var(--red)' : ''}">${util.fmtDate(task.dueAt)}</div></div>
        <div><div class="section-label">Status</div><div><span class="badge ${task.status === 'open' ? 'badge-blue' : 'badge-green'}">${task.status}</span></div></div>
        ${task.reason ? `<div style="grid-column:1/-1"><div class="section-label">Reason / notes</div><div>${task.reason}</div></div>` : ''}
        ${task.outcome ? `<div style="grid-column:1/-1"><div class="section-label">Outcome</div><div>${task.outcome.replace(/_/g, ' ')}</div></div>` : ''}
        ${task.completedAt ? `<div><div class="section-label">Completed</div><div>${util.fmtDate(task.completedAt)}</div></div>` : ''}
      </div>

      ${task.status === 'open' ? `
      <div style="margin-bottom:var(--s4)">
        <div class="section-label" style="margin-bottom:var(--s2)">Actions</div>
        <div class="row" style="gap:var(--s2);flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" id="fu-mark-done">Mark done</button>
          <button class="btn btn-secondary btn-sm" id="fu-reschedule">Reschedule +1 day</button>
          ${customer || lead ? `<button class="btn btn-secondary btn-sm" id="fu-outreach">Outreach</button>` : ''}
          ${customer ? `<button class="btn btn-secondary btn-sm" id="fu-open-customer">Open Customer</button>` : ''}
          ${lead ? `<button class="btn btn-secondary btn-sm" id="fu-open-lead">Open Lead</button>` : ''}
        </div>
        ${manager ? `<div style="margin-top:var(--s3)">
          <select class="select" id="fu-reassign" style="width:auto;font-size:var(--t-13)">
            <option value="">Reassign to…</option>
            ${advisors.map((e) => `<option value="${e.id}" ${e.id === task.ownerId ? 'selected' : ''}>${e.firstName} ${e.lastName}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>` : ''}

    </div>
  `);

  document.getElementById('close-fu-drawer').addEventListener('click', closeCrmDrawer);

  if (task.status === 'open') {
    document.getElementById('fu-mark-done')?.addEventListener('click', () => _followUpOutcomeModal(taskId));
    document.getElementById('fu-reschedule')?.addEventListener('click', () => {
      const list = db.followUpTasks();
      const t = list.find((x) => x.id === taskId);
      if (t) { t.dueAt = new Date(new Date(t.dueAt).getTime() + 86400000).toISOString(); db.saveFollowUpTasks(list); }
      toast('Rescheduled +1 day.', 'success');
      openFollowUpDrawer(taskId);
    });
    document.getElementById('fu-outreach')?.addEventListener('click', () => {
      if (customer) openOutreachPanel({ customer });
      else if (lead) openOutreachPanel({ lead });
    });
    // Dynamic import breaks the circular chain at call-time
    document.getElementById('fu-open-customer')?.addEventListener('click', () => {
      import('./customers.js').then((m) => m.openCustomerDrawer(customer.id));
    });
    document.getElementById('fu-open-lead')?.addEventListener('click', () => {
      import('./leads.js').then((m) => m.openLeadDrawer(lead.id));
    });
    document.getElementById('fu-reassign')?.addEventListener('change', (e) => {
      const newOwner = e.target.value;
      if (!newOwner) return;
      const list = db.followUpTasks();
      const t = list.find((x) => x.id === taskId);
      if (t) { t.ownerId = newOwner; db.saveFollowUpTasks(list); toast('Reassigned.', 'success'); openFollowUpDrawer(taskId); }
    });
  }
}

function _followUpOutcomeModal(taskId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-head"><div class="modal-title">Mark follow-up done</div><button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <div class="field"><label class="label">Outcome</label>
          <select class="select" id="fu-outcome-select">
            ${workflow.FOLLOWUP_OUTCOMES.map((o) => `<option value="${o}">${o.replace(/_/g, ' ')}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" id="fu-outcome-save">Save</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => overlay.remove()));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#fu-outcome-save').addEventListener('click', () => {
    try {
      workflow.completeFollowUpTask(taskId, overlay.querySelector('#fu-outcome-select').value);
      toast('Follow-up marked done.', 'success');
      overlay.remove();
      closeCrmDrawer();
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ---------------------------------------------------------------------------
// Quote Detail Drawer (CRM context — not the full quotes editor)
// ---------------------------------------------------------------------------
export function openQuoteDrawer(quoteId) {
  const quote = db.quotes().find((q) => q.id === quoteId);
  if (!quote) { toast('Quote not found.', 'error'); return; }

  const customer = quote.customerId ? db.customerById(quote.customerId) : null;
  const vehicles = customer ? db.vehiclesForCustomer(customer.id) : [];
  const vehicle = vehicles.find((v) => v.id === quote.vehicleId) || vehicles[0] || null;
  const advisor = quote.advisorId ? db.employeeById(quote.advisorId) : null;
  const meta = util.quoteStatusMeta(quote.status);
  const openFUs = workflow.openFollowUpTasks().filter((t) => t.relatedId === quoteId || (t.customerId === quote.customerId && t.taskType === 'quote_follow_up'));

  openCrmDrawer(`
    <div class="modal-head" style="padding:var(--s5)">
      <div>
        <div class="modal-title">${quote.quoteNumber || 'Quote'}</div>
        <div class="muted" style="font-size:var(--t-13)">${customer ? util.customerName(customer) : 'No customer'} · <span class="badge ${meta.badgeClass}">${meta.label}</span></div>
      </div>
      <button class="icon-btn" id="close-qd-drawer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
    </div>
    <div style="padding:0 var(--s5) var(--s5)">

      <div class="grid-2" style="gap:var(--s3);margin-bottom:var(--s4)">
        <div><div class="section-label">Total</div><div class="tnum strong">${util.fmtMoney(quote.total)}</div></div>
        <div><div class="section-label">Vehicle</div><div>${vehicle ? util.vehicleLabel(vehicle) : 'Not linked'}</div></div>
        <div><div class="section-label">Advisor</div><div>${advisor ? advisor.firstName + ' ' + advisor.lastName : 'Unassigned'}</div></div>
        <div><div class="section-label">Sent</div><div>${quote.sentAt ? util.fmtDate(quote.sentAt) : 'Not sent yet'}</div></div>
        ${quote.title ? `<div style="grid-column:1/-1"><div class="section-label">Description</div><div>${quote.title}</div></div>` : ''}
      </div>

      ${(quote.lineItems || []).length ? `
      <div style="margin-bottom:var(--s4)">
        <div class="section-label" style="margin-bottom:var(--s2)">Line items <span class="muted" style="font-weight:400">(${quote.lineItems.length})</span></div>
        ${quote.lineItems.slice(0, 6).map((li) => `
          <div class="row between" style="padding:4px 0;border-bottom:1px solid var(--rule)">
            <span>${li.description || li.name || 'Item'}</span>
            <span class="row" style="gap:6px">
              <span class="tnum">${util.fmtMoney(li.total != null ? li.total : (li.price || 0))}</span>
              ${li.status ? `<span class="badge badge-gray" style="font-size:10px">${li.status}</span>` : ''}
            </span>
          </div>`).join('')}
        ${quote.lineItems.length > 6 ? `<div class="muted" style="font-size:var(--t-13);margin-top:4px">+${quote.lineItems.length - 6} more</div>` : ''}
      </div>` : ''}

      ${openFUs.length ? `
      <div style="margin-bottom:var(--s4)">
        <div class="section-label" style="margin-bottom:var(--s2)">Open follow-ups</div>
        ${openFUs.map((t) => `
          <div class="followup-row">
            <div><div class="strong" style="font-size:var(--t-13)">${t.title}</div><div class="muted" style="font-size:var(--t-13)">Due ${util.fmtDate(t.dueAt)}</div></div>
            <button class="btn btn-secondary btn-sm" data-qd-fu-done="${t.id}">Done</button>
          </div>`).join('')}
      </div>` : ''}

      <div style="margin-bottom:var(--s4)">
        <div class="section-label" style="margin-bottom:var(--s2)">Actions</div>
        <div class="row" style="gap:var(--s2);flex-wrap:wrap">
          ${customer ? `<button class="btn btn-secondary btn-sm" id="qd-outreach">Outreach</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="qd-add-followup">+ Add follow-up</button>
          ${customer ? `<button class="btn btn-secondary btn-sm" id="qd-open-customer">Open Customer</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="qd-to-quotes">Go to Quotes</button>
        </div>
      </div>

    </div>
  `);

  document.getElementById('close-qd-drawer').addEventListener('click', closeCrmDrawer);
  document.getElementById('qd-outreach')?.addEventListener('click', () => {
    if (customer) openOutreachPanel({ customer, quote });
  });
  document.getElementById('qd-add-followup')?.addEventListener('click', () => {
    workflow.createFollowUpTask({
      title: `Quote follow-up — ${quote.quoteNumber}`, taskType: 'quote_follow_up',
      customerId: quote.customerId, relatedType: 'quote', relatedId: quoteId,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    toast('Follow-up created.', 'success');
    openQuoteDrawer(quoteId);
  });
  document.getElementById('qd-open-customer')?.addEventListener('click', () => {
    if (customer) import('./customers.js').then((m) => m.openCustomerDrawer(customer.id));
  });
  document.getElementById('qd-to-quotes')?.addEventListener('click', () => {
    closeCrmDrawer();
    window.location.href = 'quotes.html';
  });
  document.querySelectorAll('[data-qd-fu-done]').forEach((btn) => btn.addEventListener('click', () => {
    try { workflow.completeFollowUpTask(btn.dataset.qdFuDone, 'contacted'); toast('Done.', 'success'); openQuoteDrawer(quoteId); } catch (e) { toast(e.message, 'error'); }
  }));
}
