// AutoBook — modules/crm/outreach.js
// Shared "Customer Outreach Center" panel — one drawer used from both Leads
// and Customers (and the Personal Workspace). Built entirely on lib/export.js's
// existing showMessagePreview/printHTML/copyToClipboard (same pattern the
// Quotes module already uses) — no new preview/print plumbing, no real
// email/SMS send. Every action logs a real lib/workflow.js activity event.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { toast } from '../../lib/nav.js';
import * as workflow from '../../lib/workflow.js';
import { showMessagePreview, printHTML, copyToClipboard } from '../../lib/export.js';

const TEMPLATES = {
  quote_follow_up: {
    label: 'Quote follow-up', taskType: 'quote_follow_up',
    subject: (ctx) => `Following up on your estimate${ctx.quote ? ' ' + ctx.quote.quoteNumber : ''}`,
    body: (ctx) => `Hi ${ctx.firstName}, just checking in on the estimate we sent${ctx.quote ? ` (${ctx.quote.quoteNumber}, ${util.fmtMoney(ctx.quote.total)})` : ''}. Let us know if you have any questions or would like to get it scheduled.`,
  },
  declined_work: {
    label: 'Declined service follow-up', taskType: 'declined_work',
    subject: () => 'Still thinking about that recommended work?',
    body: (ctx) => `Hi ${ctx.firstName}, we wanted to follow up on the work we recommended for your vehicle. Safety and reliability matter — happy to answer questions or get it back on the schedule whenever you're ready.`,
  },
  oil_change_reminder: {
    label: 'Oil change reminder', taskType: 'service_reminder',
    subject: () => 'Time for an oil change?',
    body: (ctx) => `Hi ${ctx.firstName}, our records show your vehicle is due for an oil change. Reply or call us to get scheduled.`,
  },
  tire_rotation_reminder: {
    label: 'Tire rotation reminder', taskType: 'service_reminder',
    subject: () => 'Tire rotation due',
    body: (ctx) => `Hi ${ctx.firstName}, it looks like your vehicle is due for a tire rotation. Let's get it on the schedule to even out tread wear.`,
  },
  win_back: {
    label: 'Lapsed customer win-back', taskType: 'win_back',
    subject: () => "We'd love to see you again",
    body: (ctx) => `Hi ${ctx.firstName}, it's been a while since your last visit. We'd love to take care of your vehicle again — let us know if there's anything we can help with.`,
  },
  fleet_follow_up: {
    label: 'Fleet account follow-up', taskType: 'fleet_follow_up',
    subject: () => 'Checking in on your fleet account',
    body: (ctx) => `Hi ${ctx.firstName}, checking in on your fleet's service needs. Let us know if you'd like to schedule upcoming maintenance for any vehicles on the account.`,
  },
  review_request: {
    label: 'Review request', taskType: 'review_request',
    subject: () => 'How did we do?',
    body: (ctx) => `Hi ${ctx.firstName}, thanks for choosing us for your recent service. If you have a minute, we'd really appreciate a quick review — it helps a lot.`,
  },
  no_show_follow_up: {
    label: 'No-show follow-up', taskType: 'other',
    subject: () => 'We missed you',
    body: (ctx) => `Hi ${ctx.firstName}, we had you on the schedule but missed you — no worries! Let us know a better time and we'll get you rebooked.`,
  },
  appointment_reminder: {
    label: 'Appointment reminder', taskType: 'other',
    subject: (ctx) => `Reminder: your appointment${ctx.ro ? ' ' + ctx.ro.ro : ''}`,
    body: (ctx) => `Hi ${ctx.firstName}, just a reminder about your upcoming appointment${ctx.ro?.scheduledDate ? ` on ${util.fmtDate(ctx.ro.scheduledDate)}` : ''}. See you then!`,
  },
};

// Picks a sensible default template from real context/segment membership —
// same kind of rule-based logic as workflow.nextBestActionsForCustomer.
function suggestTemplate(ctx) {
  if (ctx.quote && ['sent', 'viewed'].includes(ctx.quote.status)) return 'quote_follow_up';
  if (ctx.customer && workflow.getDeclinedWorkCandidates().some((d) => d.customerId === ctx.customer.id)) return 'declined_work';
  if (ctx.customer && db.segmentMembers('seg_fleet').some((c) => c.id === ctx.customer.id)) return 'fleet_follow_up';
  if (ctx.customer && db.segmentMembers('seg_inactive').some((c) => c.id === ctx.customer.id)) return 'win_back';
  if (ctx.customer && db.segmentMembers('seg_due_oil').some((c) => c.id === ctx.customer.id)) return 'oil_change_reminder';
  if (ctx.customer && db.segmentMembers('seg_due_tire').some((c) => c.id === ctx.customer.id)) return 'tire_rotation_reminder';
  if (ctx.customer && db.jobsForCustomer(ctx.customer.id).some((j) => j.noShow)) return 'no_show_follow_up';
  return 'review_request';
}

// ctx: { customer, lead, quote, ro } — at least one of customer/lead.
export function openOutreachPanel(ctx) {
  const name = ctx.customer ? util.customerName(ctx.customer) : `${ctx.lead.firstName} ${ctx.lead.lastName}`;
  const firstName = ctx.customer ? ctx.customer.firstName : ctx.lead.firstName;
  const phone = ctx.customer ? ctx.customer.phone : ctx.lead.phone;
  const email = ctx.customer ? ctx.customer.email : ctx.lead.email;
  const doNotContact = !!ctx.customer?.doNotContact;
  const customerId = ctx.customer?.id || null;
  const leadId = ctx.lead?.id || null;
  let templateKey = suggestTemplate(ctx);

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:460px">
      <div class="modal-head">
        <div class="modal-title">Outreach — ${name}</div>
        <button class="icon-btn" data-close><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        ${doNotContact ? `<div class="alert alert-amber">This customer has opted out of marketing contact — outreach is disabled.</div>` : ''}
        <div class="field">
          <label class="label">Template</label>
          <select class="select" id="oc-template" ${doNotContact ? 'disabled' : ''}>
            ${Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${k === templateKey ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="row" style="gap:var(--s2);flex-wrap:wrap;margin-top:var(--s3)">
          <button class="btn btn-secondary btn-sm" id="oc-email" ${doNotContact ? 'disabled' : ''}>Email Preview</button>
          <button class="btn btn-secondary btn-sm" id="oc-sms" ${doNotContact ? 'disabled' : ''}>Text Preview</button>
          <button class="btn btn-secondary btn-sm" id="oc-print">Print Call Sheet</button>
          <button class="btn btn-secondary btn-sm" id="oc-call">Create Call Task</button>
        </div>
        ${customerId ? `<div class="row" style="margin-top:var(--s3)"><button class="btn btn-secondary btn-sm" id="oc-campaign">+ Add to Campaign</button></div>` : ''}
        <div id="oc-campaign-picker" style="display:none;margin-top:var(--s2)"></div>
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-close>Close</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', cleanup));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#oc-template').addEventListener('change', (e) => { templateKey = e.target.value; });

  function logOutreach(type, title, channel) {
    workflow.recordWorkflowEvent('customer', customerId || leadId, type, title, { customerId, leadId, quoteId: ctx.quote?.id || null, roId: ctx.ro?.id || null, channel });
  }

  overlay.querySelector('#oc-email').addEventListener('click', () => {
    const t = TEMPLATES[templateKey];
    showMessagePreview({
      channel: 'email', to: email, subject: t.subject({ ...ctx, firstName }), body: t.body({ ...ctx, firstName }),
      onLog: () => {
        logOutreach('email_preview_generated', `Email preview sent — ${t.label}`, 'email_preview');
        if (leadId) workflow.markLeadContacted(leadId);
        toast('Logged (preview only — nothing was actually sent).', 'success');
      },
    });
  });
  overlay.querySelector('#oc-sms').addEventListener('click', () => {
    const t = TEMPLATES[templateKey];
    showMessagePreview({
      channel: 'sms', to: phone, body: t.body({ ...ctx, firstName }),
      onLog: () => {
        logOutreach('text_preview_generated', `Text preview sent — ${t.label}`, 'sms_preview');
        if (leadId) workflow.markLeadContacted(leadId);
        toast('Logged (preview only — nothing was actually sent).', 'success');
      },
    });
  });
  overlay.querySelector('#oc-print').addEventListener('click', () => {
    const t = TEMPLATES[templateKey];
    printHTML(`Call Sheet — ${name}`, `
      <div class="muted" style="margin-bottom:10px"><b>${name}</b><br>${phone || 'No phone on file'}${email ? ' · ' + email : ''}</div>
      <div><b>${t.subject({ ...ctx, firstName })}</b></div>
      <p>${t.body({ ...ctx, firstName })}</p>
    `);
    logOutreach('call_sheet_printed', `Call sheet printed — ${t.label}`, 'print');
    cleanup();
  });
  overlay.querySelector('#oc-call').addEventListener('click', () => {
    workflow.createFollowUpTask({
      title: `Call ${name}`, taskType: 'call', customerId, leadId,
      relatedType: customerId ? 'customer' : 'lead', relatedId: customerId || leadId,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    logOutreach('followup_created', `Call task created for ${name}`, 'internal');
    toast('Call task created.', 'success');
    cleanup();
  });
  overlay.querySelector('#oc-campaign')?.addEventListener('click', () => {
    const picker = overlay.querySelector('#oc-campaign-picker');
    const campaigns = db.campaigns(); // any campaign — enrollment just links them for the next send
    picker.style.display = 'block';
    picker.innerHTML = `
      <select class="select" id="oc-campaign-select">
        <option value="">Choose a campaign…</option>
        ${campaigns.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" style="margin-top:var(--s2)" id="oc-campaign-confirm">Add</button>`;
    picker.querySelector('#oc-campaign-confirm').addEventListener('click', () => {
      const campaignId = picker.querySelector('#oc-campaign-select').value;
      if (!campaignId) { toast('Pick a campaign first.', 'error'); return; }
      const campaign = db.campaignById(campaignId);
      workflow.linkEntities('campaign', campaignId, 'customer', customerId || leadId, 'campaign_to_customer');
      logOutreach('campaign_enrolled', `Added to campaign — ${campaign?.name || campaignId}`, 'internal');
      toast(`Added to "${campaign?.name || 'campaign'}" (preview only — no real send pipeline yet).`, 'success');
      cleanup();
    });
  });
}
