// AutoBook — modules/quotes/quotes-dashboard.js
// Quote status queue (purpose-built pill board, not a copied stat grid) +
// revenue metrics + follow-ups due + recent activity + most quoted/declined
// services. Clicking a queue pill filters the list below it.
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { openQuoteDetail } from './quote-detail.js?v=2';

const QUEUE = [
  { status: 'draft', label: 'Draft' },
  { status: 'sent', label: 'Sent', also: ['viewed'] },
  { status: 'approved', label: 'Approved', also: ['partially_approved'] },
  { status: 'declined', label: 'Declined' },
  { status: 'expired', label: 'Expired' },
  { status: 'converted', label: 'Converted' },
];

let activeFilter = null;
let searchText = '';
let sortBy = 'newest';

export function renderQuotesDashboard(mount) {
  const m = util.quoteMetrics();

  mount.innerHTML = `
    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head"><div class="card-title">Quote Queue</div><button class="btn btn-primary btn-sm" id="new-quote-btn">+ New Quote</button></div>
      <div class="card-body">
        <div class="quote-queue-grid" id="queue-pills"></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s4)">
      <div class="card-head" style="flex-wrap:wrap;gap:var(--s2)">
        <div class="card-title" id="quote-list-title">All Quotes</div>
        <div class="row" style="gap:var(--s2);flex-wrap:wrap">
          <input type="search" class="input" id="ql-search" placeholder="Search quote, customer, service…" style="width:220px;font-size:var(--t-13)">
          <select class="select" id="ql-sort" style="width:auto;font-size:var(--t-13)">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="value-desc">Highest value</option>
            <option value="value-asc">Lowest value</option>
            <option value="customer">Customer A–Z</option>
            <option value="status">Status</option>
          </select>
          <button class="btn btn-secondary btn-sm" id="ql-clear" style="display:none">✕ Clear filter</button>
        </div>
      </div>
      <div class="card-body" id="quote-list"></div>
    </div>

    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconDollar()}</span><span class="stat-label">Total Quoted Revenue</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(m.totalQuotedRevenue)}</div>
        <div class="stat-sub">${m.total} quotes all-time</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon green">${iconCheck()}</span><span class="stat-label">Approved Quoted Revenue</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(m.approvedQuotedRevenue)}</div>
        <div class="stat-sub">approved, partially approved, or converted</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon red">${iconX()}</span><span class="stat-label">Declined Quoted Revenue</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(m.declinedQuotedRevenue)}</div>
        <div class="stat-sub">${m.declined} declined quote${m.declined === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div class="grid-3" style="margin-bottom:var(--s4)">
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon amber">${iconClock()}</span><span class="stat-label">Pending Approval Revenue</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(m.pendingApprovalRevenue)}</div>
        <div class="stat-sub">${m.waitingApproval} sent or viewed</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon purple">${iconTrend()}</span><span class="stat-label">Average Quote Value</span></div>
        <div class="stat-value tnum">${util.fmtMoney0(m.avgQuoteValue)}</div>
        <div class="stat-sub">across all ${m.total} quotes</div>
      </div>
      <div class="stat-card">
        <div class="stat-head"><span class="stat-icon blue">${iconTarget()}</span><span class="stat-label">Close Rate <span class="badge badge-amber" style="font-size:10px;margin-left:4px">assumption</span></span></div>
        <div class="stat-value tnum">${m.closeRate}%</div>
        <div class="stat-sub">approved+converted ÷ all decided quotes</div>
      </div>
    </div>

    <div class="crm-grid">
      <div class="card">
        <div class="card-head"><div class="card-title">Quote Follow-Ups Due</div><span class="badge badge-gray">actions are placeholders</span></div>
        <div class="card-body" id="quote-followups"></div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">Most quoted / declined services</div></div>
        <div class="card-body">
          <div class="section-label" style="margin-bottom:6px">Most quoted</div>
          ${m.mostQuotedServices.map((s) => `<div class="row between" style="padding:4px 0"><span>${s.name}</span><span class="badge badge-blue">${s.count}</span></div>`).join('') || '<div class="empty-sub">No data yet.</div>'}
          <div class="section-label" style="margin:var(--s3) 0 6px">Most declined</div>
          ${m.mostDeclinedServices.map((s) => `<div class="row between" style="padding:4px 0"><span>${s.name}</span><span class="badge badge-red">${s.count}</span></div>`).join('') || '<div class="empty-sub">None declined yet.</div>'}
          <div class="section-label" style="margin:var(--s3) 0 6px">Quotes by source <span class="badge badge-gray" style="font-size:10px">real</span></div>
          ${m.bySource.map((s) => `<div class="row between" style="padding:4px 0"><span>${sourceLabel(s.source)}</span><span class="badge badge-gray">${s.count}</span></div>`).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('new-quote-btn').addEventListener('click', () => { location.hash = 'builder'; });
  document.getElementById('ql-search').value = searchText;
  document.getElementById('ql-sort').value = sortBy;
  document.getElementById('ql-search').addEventListener('input', (e) => { searchText = e.target.value; renderList(); });
  document.getElementById('ql-sort').addEventListener('change', (e) => { sortBy = e.target.value; renderList(); });
  document.getElementById('ql-clear').addEventListener('click', () => { activeFilter = null; searchText = ''; sortBy = 'newest'; renderQueuePills(); renderList(); });
  renderQueuePills();
  renderFollowUps();
  renderList();
}

function renderQueuePills() {
  const quotes = db.quotes();
  document.getElementById('queue-pills').innerHTML = QUEUE.map((s) => {
    const count = quotes.filter((q) => q.status === s.status || s.also?.includes(q.status)).length;
    return `<div class="queue-pill${activeFilter === s.status ? ' active' : ''}" data-filter="${s.status}"><div class="qp-count">${count}</div><div class="qp-label">${s.label}</div></div>`;
  }).join('');
  document.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener('click', () => {
      activeFilter = activeFilter === el.dataset.filter ? null : el.dataset.filter;
      renderQueuePills();
      renderList();
    });
  });
}

function nextAction(q) {
  if (q.status === 'draft') return 'Ready to send?';
  if (q.status === 'sent' || q.status === 'viewed') return 'Awaiting customer approval';
  if (q.status === 'approved' || q.status === 'partially_approved') return 'Convert to repair order';
  if (q.status === 'declined') return 'Win-back opportunity';
  if (q.status === 'expired') return 'Resend or archive';
  if (q.status === 'converted') return 'Converted to RO';
  return '';
}

function renderList() {
  const def = QUEUE.find((s) => s.status === activeFilter);
  let quotes = db.quotes().slice();

  if (def) quotes = quotes.filter((q) => q.status === def.status || def.also?.includes(q.status));

  const needle = searchText.trim().toLowerCase();
  if (needle) {
    quotes = quotes.filter((q) => {
      const c = db.customerById(q.customerId);
      const name = util.customerName(c).toLowerCase();
      const services = (q.lineItems || []).map((li) => (li.description || '').toLowerCase()).join(' ');
      return (q.quoteNumber || '').toLowerCase().includes(needle)
        || (q.title || '').toLowerCase().includes(needle)
        || name.includes(needle)
        || services.includes(needle);
    });
  }

  const sorters = {
    newest: (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    oldest: (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt),
    'value-desc': (a, b) => (b.total || 0) - (a.total || 0),
    'value-asc': (a, b) => (a.total || 0) - (b.total || 0),
    customer: (a, b) => util.customerName(db.customerById(a.customerId)).localeCompare(util.customerName(db.customerById(b.customerId))),
    status: (a, b) => (a.status || '').localeCompare(b.status || ''),
  };
  quotes.sort(sorters[sortBy] || sorters.newest);

  const label = def ? `${def.label} Quotes` : 'All Quotes';
  const countLabel = def
    ? `${quotes.length} ${def.label.toLowerCase()} quote${quotes.length === 1 ? '' : 's'}`
    : `${quotes.length} quote${quotes.length === 1 ? '' : 's'}`;
  document.getElementById('quote-list-title').innerHTML = `${label} <span class="badge badge-gray" style="font-weight:400;font-size:var(--t-13)">${countLabel}</span>`;

  const clearBtn = document.getElementById('ql-clear');
  if (clearBtn) clearBtn.style.display = (activeFilter || searchText) ? '' : 'none';
  document.getElementById('ql-search').value = searchText;
  document.getElementById('ql-sort').value = sortBy;

  document.getElementById('quote-list').innerHTML = quotes.length
    ? quotes.map((q) => {
        const c = db.customerById(q.customerId);
        const v = db.vehicleById(q.vehicleId);
        const meta = util.quoteStatusMeta(q.status);
        const vehicleLabel = v ? `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() : '';
        const action = nextAction(q);
        return `
        <div class="quote-row" data-quote-id="${q.id}" style="display:grid;grid-template-columns:1fr auto;gap:var(--s3);align-items:center">
          <div>
            <div class="row" style="gap:var(--s2);align-items:baseline;flex-wrap:wrap">
              <span class="strong" style="color:var(--ink)">${q.quoteNumber}</span>
              <span style="color:var(--ink)">${q.title || ''}</span>
              <span class="badge ${meta.badgeClass}">${meta.label}</span>
            </div>
            <div class="muted" style="font-size:var(--t-13);margin-top:2px">
              ${util.customerName(c)}${vehicleLabel ? ` · ${vehicleLabel}` : ''} · ${util.timeAgo(q.updatedAt)}
            </div>
            ${action ? `<div style="font-size:var(--t-13);color:var(--ink-3);margin-top:2px">→ ${action}</div>` : ''}
          </div>
          <div class="row" style="gap:var(--s3);align-items:center">
            <span class="tnum strong" style="color:var(--ink)">${util.fmtMoney(q.total)}</span>
            <button class="btn btn-secondary btn-sm" data-open-quote="${q.id}">Open</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty"><div class="empty-title">No quotes here</div><div class="empty-sub">Try a different filter, or create one in the Builder.</div></div>';

  document.querySelectorAll('[data-quote-id]').forEach((row) => row.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-quote]')) return;
    openQuoteDetail(row.dataset.quoteId);
  }));
  document.querySelectorAll('[data-open-quote]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openQuoteDetail(btn.dataset.openQuote);
  }));
}

// Real candidates (quotes the customer hasn't decided on yet, plus declined
// quotes as a CRM-style win-back opportunity); actions are placeholders —
// no auto-send pipeline exists, same caveat as Marketing's automations.
function renderFollowUps() {
  const rows = util.quotesNeedingFollowUp().slice(0, 6).map((q) => {
    const c = db.customerById(q.customerId);
    const reason = q.status === 'declined' ? 'Declined — win-back opportunity' : `Waiting on customer (${util.quoteStatusMeta(q.status).label.toLowerCase()})`;
    return { id: q.id, name: `${q.quoteNumber} — ${util.customerName(c)}`, reason };
  });
  document.getElementById('quote-followups').innerHTML = rows.length
    ? rows.map((r) => `
      <div class="followup-row">
        <div>
          <div class="strong" style="color:var(--ink)">${r.name}</div>
          <div class="muted" style="font-size:var(--t-13)">${r.reason}</div>
        </div>
        <button class="btn btn-secondary btn-sm" data-followup-open="${r.id}">Open</button>
      </div>`).join('')
    : '<div class="empty-sub">Nothing due right now.</div>';
  document.querySelectorAll('[data-followup-open]').forEach((b) => b.addEventListener('click', () => openQuoteDetail(b.dataset.followupOpen)));
}

function sourceLabel(s) {
  return { booking: 'Booking', crm: 'CRM', walk_in: 'Walk-in', phone_call: 'Phone call', inspection: 'Inspection', declined_service: 'Declined-service follow-up', manual: 'Manual' }[s] || s;
}

function iconDollar() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>'; }
function iconCheck() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'; }
function iconX() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'; }
function iconClock() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'; }
function iconTrend() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l6-6 4 4 8-8"/></svg>'; }
function iconTarget() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>'; }
