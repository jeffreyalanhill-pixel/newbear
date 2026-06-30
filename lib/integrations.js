// AutoBook — lib/integrations.js
// Integration Center helpers — Phase 1: Zapier / Webhooks (localStorage-backed).
// No real HTTP requests are sent from this module in demo mode.
// Production path: swap sendZapierWebhook() for a Supabase Edge Function relay.

import { db } from './data.js';

// ── Default Zapier settings ───────────────────────────────────────────────────
const DEFAULT_ZAPIER_EVENTS = {
  bookingCreated: false,
  appointmentConfirmed: false,
  appointmentCanceled: false,
  repairOrderCreated: false,
  repairOrderStatusChanged: false,
  quoteCreated: false,
  quoteSent: false,
  quoteApproved: false,
  quoteDeclined: false,
  invoiceCreated: false,
  invoicePaid: false,
  paymentReceived: false,
  customerCreated: false,
  leadCreated: false,
  followUpOverdue: false,
  lowStockPart: false,
  rewardsMemberEnrolled: false,
};

const DEFAULT_ZAPIER = {
  zapierEnabled: false,
  zapierWebhookUrl: '',
  zapierSecretToken: '',
  zapierSendCustomerData: false,
  zapierEvents: { ...DEFAULT_ZAPIER_EVENTS },
  lastTestAt: null,
  lastTestStatus: null,
  updatedAt: null,
};

// ── Settings persistence ──────────────────────────────────────────────────────
export function getZapierSettings() {
  const s = db.settings();
  const saved = s.zapier || {};
  return {
    ...DEFAULT_ZAPIER,
    ...saved,
    zapierEvents: { ...DEFAULT_ZAPIER_EVENTS, ...(saved.zapierEvents || {}) },
  };
}

export function saveZapierSettings(z) {
  const s = db.settings();
  s.zapier = { ...z, updatedAt: new Date().toISOString() };
  db.saveSettings(s);
}

// ── Event catalog ─────────────────────────────────────────────────────────────
export const INTEGRATION_EVENTS = [
  { key: 'bookingCreated',           event: 'booking.created',            group: 'Appointments',  label: 'New booking request',     description: 'Customer submits a booking request from the public page.' },
  { key: 'appointmentConfirmed',     event: 'appointment.confirmed',      group: 'Appointments',  label: 'Appointment confirmed',   description: 'Shop confirms an appointment.' },
  { key: 'appointmentCanceled',      event: 'appointment.canceled',       group: 'Appointments',  label: 'Appointment canceled',    description: 'Appointment is canceled by shop or customer.' },
  { key: 'repairOrderCreated',       event: 'repair_order.created',       group: 'Repair Orders', label: 'Repair order created',    description: 'A new repair order is opened.' },
  { key: 'repairOrderStatusChanged', event: 'repair_order.status_changed',group: 'Repair Orders', label: 'RO status changed',       description: 'RO moves to a new status (waiting, in progress, ready, etc.).' },
  { key: 'quoteCreated',             event: 'quote.created',              group: 'Quotes',        label: 'Quote created',           description: 'A new quote is saved as a draft.' },
  { key: 'quoteSent',                event: 'quote.sent',                 group: 'Quotes',        label: 'Quote sent',              description: 'A quote is marked as sent to the customer.' },
  { key: 'quoteApproved',            event: 'quote.approved',             group: 'Quotes',        label: 'Quote approved',          description: 'Customer approves a quote (full or partial).' },
  { key: 'quoteDeclined',            event: 'quote.declined',             group: 'Quotes',        label: 'Quote declined',          description: 'Customer declines a quote.' },
  { key: 'invoiceCreated',           event: 'invoice.created',            group: 'Finance',       label: 'Invoice created',         description: 'Invoice is generated from a repair order or quote.' },
  { key: 'invoicePaid',              event: 'invoice.paid',               group: 'Finance',       label: 'Invoice paid',            description: 'Invoice is marked as paid.' },
  { key: 'paymentReceived',          event: 'payment.received',           group: 'Finance',       label: 'Payment received',        description: 'A payment is recorded on an invoice.' },
  { key: 'customerCreated',          event: 'customer.created',           group: 'CRM',           label: 'New customer',            description: 'A new customer record is created.' },
  { key: 'leadCreated',              event: 'lead.created',               group: 'CRM',           label: 'New lead',                description: 'A marketing lead is captured.' },
  { key: 'followUpOverdue',          event: 'followup.overdue',           group: 'CRM',           label: 'Follow-up overdue',       description: 'A CRM follow-up passes its due date without action.' },
  { key: 'lowStockPart',             event: 'inventory.low_stock',        group: 'Inventory',     label: 'Low stock part',          description: 'A part falls below its minimum stock threshold.' },
  { key: 'rewardsMemberEnrolled',    event: 'rewards.member_enrolled',    group: 'Rewards',       label: 'Rewards member enrolled', description: 'A customer enrolls in the rewards program.' },
];

export const EVENT_GROUPS = ['Appointments', 'Repair Orders', 'Quotes', 'Finance', 'CRM', 'Inventory', 'Rewards'];

export const PREVIEW_EVENTS = [
  { key: 'bookingCreated',        label: 'New booking request' },
  { key: 'quoteApproved',         label: 'Quote approved' },
  { key: 'invoicePaid',           label: 'Invoice paid' },
  { key: 'lowStockPart',          label: 'Low stock part' },
  { key: 'rewardsMemberEnrolled', label: 'Rewards member enrolled' },
];

// ── Payload building ──────────────────────────────────────────────────────────
function shopName() {
  const s = db.settings();
  return s.name || s.shopName || 'Torklio Demo Shop';
}

// Build a real payload for a given event + optional record context.
// Respects zapierSendCustomerData — omits phone/email when false.
export function buildZapierPayload(eventKey, ctx = {}) {
  const z = getZapierSettings();
  const ev = INTEGRATION_EVENTS.find((e) => e.key === eventKey);
  const payload = {
    event: ev?.event || eventKey,
    shopId: 'demo-shop',
    shopName: shopName(),
    occurredAt: new Date().toISOString(),
    recordId: ctx.recordId || null,
    summary: ctx.summary || null,
  };
  if (ctx.customer) {
    payload.customer = { id: ctx.customer.id || null, name: ctx.customer.name || null };
    if (z.zapierSendCustomerData) {
      if (ctx.customer.phone) payload.customer.phone = ctx.customer.phone;
      if (ctx.customer.email) payload.customer.email = ctx.customer.email;
    }
  }
  return payload;
}

// Build a representative preview payload using demo data (no real customer records).
export function previewZapierPayload(eventKey) {
  const z = getZapierSettings();
  const ev = INTEGRATION_EVENTS.find((e) => e.key === eventKey);
  const now = new Date().toISOString();
  const base = { event: ev?.event || eventKey, shopId: 'demo-shop', shopName: shopName(), occurredAt: now };
  const cBase = { id: 'c_demo_123', name: 'Chris B.' };
  const cFull = z.zapierSendCustomerData ? { ...cBase, phone: '555-867-5309', email: 'chris@example.com' } : cBase;

  switch (eventKey) {
    case 'bookingCreated':
      return { ...base, recordId: 'BK-4421', summary: { service: 'Oil Change', requestedDate: '2026-07-05', status: 'requested' }, customer: cFull };
    case 'quoteApproved':
      return { ...base, recordId: 'Q-5011', summary: { title: 'Front brake pad replacement', amount: 277.53, status: 'approved' }, customer: cFull };
    case 'invoicePaid':
      return { ...base, recordId: 'INV-3042', summary: { total: 412.00, method: 'credit_card', status: 'paid' }, customer: cFull };
    case 'lowStockPart':
      return { ...base, recordId: 'PART-0099', summary: { name: 'Oil Filter — Fram PH16', sku: 'OIL-FILTER-16', currentQty: 2, minQty: 5 } };
    case 'rewardsMemberEnrolled':
      return { ...base, recordId: 'c_demo_123', summary: { plan: 'Standard', enrolledAt: now }, customer: cFull };
    default:
      return { ...base, recordId: 'DEMO-001', summary: { note: 'Preview payload — ' + (ev?.event || eventKey) } };
  }
}

// Guarded send — never fires a real HTTP request in demo mode.
// ACTUALLY_SEND is always false here. To enable real delivery:
//   1. Build a Supabase Edge Function webhook relay
//   2. POST to the edge function, not directly to the Zapier URL
//   3. The edge function handles secrets, retries, and delivery logs
export async function sendZapierWebhook(eventKey, ctx = {}) {
  const z = getZapierSettings();
  if (!z.zapierEnabled)    return { sent: false, reason: 'Zapier not enabled.' };
  if (!z.zapierWebhookUrl) return { sent: false, reason: 'No webhook URL configured.' };

  const ACTUALLY_SEND = false; // always false in demo — see production path above
  if (!ACTUALLY_SEND) {
    return {
      sent: false,
      reason: 'Demo mode — webhook delivery is preview-only. Enable via a backend relay.',
      previewPayload: buildZapierPayload(eventKey, ctx),
    };
  }

  // Unreachable in demo. Production relay:
  const payload = buildZapierPayload(eventKey, ctx);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (z.zapierSecretToken) headers['X-Torklio-Token'] = z.zapierSecretToken;
    const res = await fetch(z.zapierWebhookUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    return { sent: true, status: res.status };
  } catch (err) {
    return { sent: false, reason: err.message };
  }
}

export function getIntegrationEvents() {
  return INTEGRATION_EVENTS;
}
