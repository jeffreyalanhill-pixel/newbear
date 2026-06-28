// AutoBook — lib/export.js (Global Share/Export foundation)
// Reusable, page-agnostic export/share primitives: CSV, JSON, plain-text
// file, .ics calendar, clipboard copy, print, and a "Share / Export" dropdown
// menu component. No data logic lives here — every page passes in real data
// computed from db/util; this module only knows how to format/download/print
// whatever it's given. No real email/SMS/calendar-sync backend exists yet —
// see the TODOs at the bottom for what a real integration would replace.

import { db } from './data.js';
import { toast } from './nav.js';

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function escapeCsvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ key, label }]; rows: array of plain objects.
export function toCSV(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvField(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------
function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCSV(filename, rows, columns) {
  downloadBlob(filename.endsWith('.csv') ? filename : `${filename}.csv`, toCSV(rows, columns), 'text/csv;charset=utf-8');
}

export function downloadJSON(filename, data) {
  downloadBlob(filename.endsWith('.json') ? filename : `${filename}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

export function downloadText(filename, text) {
  downloadBlob(filename.endsWith('.txt') ? filename : `${filename}.txt`, text, 'text/plain;charset=utf-8');
}

export function downloadICS(filename, icsString) {
  downloadBlob(filename.endsWith('.ics') ? filename : `${filename}.ics`, icsString, 'text/calendar;charset=utf-8');
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard.', 'success');
    return true;
  } catch {
    toast('Could not copy automatically — select and copy manually.', 'error');
    return false;
  }
}

// ---------------------------------------------------------------------------
// Print — same window.open/document.write/print() pattern already proven in
// modules/repair-orders.js's printRO, generalized so any page can reuse it.
// ---------------------------------------------------------------------------
export function printHTML(title, bodyHtml) {
  const shop = db.settings();
  const win = window.open('', '_blank');
  if (!win) {
    toast('Allow pop-ups to print.', 'error');
    return;
  }
  win.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="UTF-8"><title>${title} — ${shop.name || 'My Shop'}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#15181E;padding:32px;max-width:900px;margin:0 auto}
      .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #071A3D;padding-bottom:16px;margin-bottom:20px}
      .brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px}
      h1{font-size:18px;margin:0 0 4px}
      .muted{color:#6B7280;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E5E7EB;font-size:13px}
      th{text-transform:uppercase;font-size:11px;color:#6B7280}
      .num{text-align:right}
    </style></head>
    <body>
      <div class="head">
        <div class="brand">
          <svg viewBox="0 0 256 256" width="30" height="30"><defs><linearGradient id="tb" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7DD3FC"/><stop offset="50%" stop-color="#1E88FF"/><stop offset="100%" stop-color="#2563EB"/></linearGradient></defs><circle cx="128" cy="132" r="62" fill="#071A3D"/><circle cx="128" cy="132" r="34" fill="#FFFFFF"/><path d="M 67 72 A 92 92 0 0 1 197 81" fill="none" stroke="url(#tb)" stroke-width="18"/><path d="M 120 144 L 205 59 L 143 158 Z" fill="url(#tb)"/><circle cx="128" cy="132" r="13" fill="#FFFFFF" stroke="#1E88FF" stroke-width="5"/></svg>
          Torklio
        </div>
        <div style="text-align:right">
          <h1>${title}</h1>
          <div class="muted">${shop.name || ''} · Generated ${new Date().toLocaleString()}</div>
        </div>
      </div>
      ${bodyHtml}
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

// ---------------------------------------------------------------------------
// .ics calendar — floating local time (no TZID/Z), valid per RFC 5545.
// events: [{ uid, title, description, location, date: 'YYYY-MM-DD',
//            start: 'HH:MM', end: 'HH:MM' }]
// ---------------------------------------------------------------------------
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function icsDateTime(date, time) {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

export function buildICS(events) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Torklio//Schedule//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@torklio.local`,
      `DTSTAMP:${icsDateTime(new Date().toISOString().slice(0, 10), new Date().toTimeString().slice(0, 5))}`,
      `DTSTART:${icsDateTime(e.date, e.start)}`,
      `DTEND:${icsDateTime(e.date, e.end)}`,
      `SUMMARY:${icsEscape(e.title)}`,
      e.description ? `DESCRIPTION:${icsEscape(e.description)}` : '',
      e.location ? `LOCATION:${icsEscape(e.location)}` : '',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}

// ---------------------------------------------------------------------------
// Email / Text preview modal — no real send pipeline exists. Same ad-hoc
// overlay+modal pattern used elsewhere (repair-orders.js/schedule.js).
// `onLog`, if provided, wires a "Log Preview" button using whatever
// activity-log pattern the calling page already has (e.g. util.logTeamActivity
// or util.logROEmail) — purely additive, never required.
// ---------------------------------------------------------------------------
export function showMessagePreview({ channel = 'email', to, subject, body, onLog }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px">
      <div class="modal-head">
        <div class="modal-title">${channel === 'sms' ? 'Text' : 'Email'} Preview <span class="badge badge-gray" style="margin-left:8px">Preview only — not sent</span></div>
        <button class="icon-btn" id="mp-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="modal-body">
        <div class="field"><label class="label">${channel === 'sms' ? 'Phone' : 'To'}</label><input class="input" value="${to || 'Not on file'}" disabled></div>
        ${channel === 'sms' ? '' : `<div class="field"><label class="label">Subject</label><input class="input" value="${subject || ''}" disabled></div>`}
        <div class="field"><label class="label">Message</label><textarea class="textarea" disabled>${body || ''}</textarea></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-secondary" id="mp-copy">Copy</button>
        ${onLog ? '<button class="btn btn-secondary" id="mp-log">Log Preview</button>' : ''}
        <button class="btn btn-primary" id="mp-close-2">Close</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = () => overlay.remove();
  overlay.querySelector('#mp-close').addEventListener('click', cleanup);
  overlay.querySelector('#mp-close-2').addEventListener('click', cleanup);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });
  overlay.querySelector('#mp-copy').addEventListener('click', () => copyToClipboard(`${channel === 'sms' ? '' : `Subject: ${subject}\n\n`}${body}`));
  overlay.querySelector('#mp-log')?.addEventListener('click', () => {
    onLog();
    toast('Logged (preview only — nothing was actually sent).', 'success');
    cleanup();
  });
}

// ---------------------------------------------------------------------------
// Share / Export dropdown menu — minimal reusable component (.share-menu-*
// styles live in style.css). `items`: [{ label, onClick }] or { divider: true }.
// ---------------------------------------------------------------------------
export function renderShareMenu(mount, items) {
  mount.innerHTML = `
    <div class="share-menu-wrap">
      <button class="btn btn-secondary btn-sm" data-share-toggle>Share / Export ▾</button>
      <div class="share-menu" data-share-menu>
        ${items.map((item, i) => item.divider ? '<div class="share-menu-divider"></div>' : `<button data-share-idx="${i}">${item.label}</button>`).join('')}
      </div>
    </div>`;
  const wrap = mount.querySelector('.share-menu-wrap');
  const menu = wrap.querySelector('[data-share-menu]');
  const toggle = wrap.querySelector('[data-share-toggle]');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  wrap.querySelectorAll('[data-share-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      menu.classList.remove('open');
      items[Number(btn.dataset.shareIdx)].onClick();
    });
  });
  document.addEventListener('click', () => menu.classList.remove('open'));
}

// ---------------------------------------------------------------------------
// Future integration notes (Phase 2+ — not built yet):
// - TODO: real email provider (e.g. Resend/SendGrid) to actually send the
//   email-preview content instead of just previewing it.
// - TODO: real SMS provider (e.g. Twilio) for the text-preview content.
// - TODO: Google Calendar / Outlook calendar sync (push, not just .ics
//   file download) — see Quotes/Signup modules' similar "Phase 2" notes.
// - TODO: QuickBooks export (referenced as a plan feature in Settings →
//   Subscription / signup.html's plan comparison).
// - TODO: real payroll export (Gusto/ADP/QuickBooks Payroll) — see the
//   Team Schedule "Payroll, Compliance & Integrations" placeholder cards.
// - TODO: Supabase storage/export jobs once this app moves off localStorage.
// ---------------------------------------------------------------------------
