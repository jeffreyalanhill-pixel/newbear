// AutoBook — modules/reports/rep-crm.js
// CRM & Marketing tab: Lead Sources, Lead Funnel, Campaign Performance
import { db } from '../../lib/data.js';
import { util } from '../../lib/util.js';
import { getRepState, inRange, safeNum, repLabel, repSection, repTable, repCsv, repPrint } from './reports-app.js';

export function renderRepCrm(mount) {
  const { start, end } = getRepState();
  const label = repLabel(start, end);

  const leads = db.leads ? db.leads() : [];
  const leadsInRange = leads.filter(l => inRange(l.createdAt, start, end));
  const campaigns = db.campaigns ? db.campaigns() : [];
  const events = db.activityEvents ? db.activityEvents() : [];

  mount.innerHTML = `
    ${renderLeadSummary(leadsInRange, label)}
    ${renderLeadSources(leadsInRange, label)}
    ${renderLeadFunnel(leadsInRange, label)}
    ${renderCampaignPerf(campaigns, events, start, end, label)}
  `;

  wireExports(mount, leadsInRange, campaigns, events, start, end, label);
}

// ---------------------------------------------------------------------------
// Lead Summary
// ---------------------------------------------------------------------------
function renderLeadSummary(leads, label) {
  const open = leads.filter(l => !['won','lost','dead'].includes(l.status)).length;
  const won = leads.filter(l => l.status === 'won').length;
  const lost = leads.filter(l => l.status === 'lost' || l.status === 'dead').length;
  const rate = leads.length > 0 ? Math.round(won / leads.length * 100) : 0;

  return `<div class="grid-4" style="margin-bottom:var(--s4)">
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Leads Received</span></div><div class="stat-value tnum">${leads.length}</div></div>
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Open</span></div><div class="stat-value tnum">${open}</div></div>
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Won</span></div><div class="stat-value tnum" style="color:var(--green)">${won}</div></div>
    <div class="stat-card"><div class="stat-head"><span class="stat-label">Win Rate</span></div><div class="stat-value tnum">${rate}%</div></div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Lead Sources
// ---------------------------------------------------------------------------
function renderLeadSources(leads, label) {
  const srcMap = {};
  leads.forEach(l => {
    const src = l.source || 'unknown';
    if (!srcMap[src]) srcMap[src] = { count: 0, won: 0 };
    srcMap[src].count++;
    if (l.status === 'won') srcMap[src].won++;
  });

  const total = leads.length;
  const rows = Object.entries(srcMap).sort((a,b) => b[1].count - a[1].count).map(([src, m]) => ({
    source: capitalize(src.replace(/_/g, ' ')),
    count: m.count,
    pct: total > 0 ? `${(m.count/total*100).toFixed(1)}%` : '0%',
    won: m.won,
    winRate: m.count > 0 ? `${Math.round(m.won/m.count*100)}%` : '—',
  }));

  const cols = [
    { key: 'source', label: 'Source' },
    { key: 'count', label: 'Leads', num: true },
    { key: 'pct', label: '% of Total', num: true },
    { key: 'won', label: 'Won', num: true },
    { key: 'winRate', label: 'Win Rate', num: true },
  ];

  if (!leads.length) {
    return repSection('Lead Sources', null, '<div class="empty-sub">No leads in this date range.</div>');
  }

  return repSection('Lead Sources', `${Object.keys(srcMap).length} sources`,
    repTable(cols, rows) + renderSourceBars(rows, total),
    `<button class="btn btn-sm btn-ghost" data-export="src-csv">CSV</button>`
  );
}

function renderSourceBars(rows, total) {
  if (!rows.length) return '';
  return `<div style="margin-top:var(--s4)">
    ${rows.map(r => `<div style="margin-bottom:var(--s3)">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px">
        <span style="font-size:var(--t-13);font-weight:600">${r.source}</span>
        <span style="font-size:var(--t-13);color:var(--ink-3)">${r.count} leads · ${r.pct}</span>
      </div>
      <div style="height:6px;background:var(--canvas);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${r.pct};background:var(--accent);border-radius:3px"></div>
      </div>
    </div>`).join('')}
  </div>`;
}

// ---------------------------------------------------------------------------
// Lead Funnel
// ---------------------------------------------------------------------------
function renderLeadFunnel(leads, label) {
  const stages = [
    { key: 'new', label: 'New' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'quoted', label: 'Quoted' },
    { key: 'won', label: 'Won' },
    { key: 'lost', label: 'Lost / Dead' },
  ];

  const statusMap = leads.reduce((acc, l) => {
    const s = l.status || 'new';
    acc[s] = (acc[s]||0)+1;
    return acc;
  }, {});

  // Group 'dead' into lost
  if (statusMap.dead) { statusMap.lost = (statusMap.lost||0)+statusMap.dead; delete statusMap.dead; }

  const rows = stages.map(s => ({
    stage: s.label,
    count: statusMap[s.key] || 0,
    pct: leads.length > 0 ? `${((statusMap[s.key]||0)/leads.length*100).toFixed(1)}%` : '0%',
  })).filter(r => r.count > 0);

  // Show all stages present plus any unknown
  const knownKeys = stages.map(s=>s.key).concat(['dead']);
  Object.entries(statusMap).forEach(([s,n]) => {
    if (!knownKeys.includes(s)) rows.push({ stage: capitalize(s), count: n, pct: leads.length>0?`${(n/leads.length*100).toFixed(1)}%`:'0%' });
  });

  const cols = [
    { key: 'stage', label: 'Stage' },
    { key: 'count', label: 'Count', num: true },
    { key: 'pct', label: '% of Total', num: true },
  ];

  return repSection('Lead Funnel', null, repTable(cols, rows));
}

// ---------------------------------------------------------------------------
// Campaign Performance
// ---------------------------------------------------------------------------
function renderCampaignPerf(campaigns, events, start, end, label) {
  if (!campaigns.length) {
    return repSection('Campaign Performance', null,
      '<div class="empty-sub">No campaigns have been created yet.</div>');
  }

  const rows = campaigns.map(c => {
    const camEvents = events.filter(e => e.entityType === 'campaign' && e.entityId === c.id && inRange(e.createdAt, start, end));
    const sent = camEvents.filter(e => e.type === 'email_sent' || e.type === 'sms_sent').length;
    const opened = camEvents.filter(e => e.type === 'email_opened').length;
    const clicked = camEvents.filter(e => e.type === 'link_clicked').length;
    const openRate = sent > 0 ? `${Math.round(opened/sent*100)}%` : '—';
    const clickRate = opened > 0 ? `${Math.round(clicked/opened*100)}%` : '—';
    return {
      name: c.name || c.title || '—',
      type: capitalize(c.type || c.channel || '—'),
      sent,
      opened,
      clicked,
      openRate,
      clickRate,
      status: c.status || '—',
    };
  }).filter(r => r.sent > 0 || r.status === 'active');

  const cols = [
    { key: 'name', label: 'Campaign' },
    { key: 'type', label: 'Type' },
    { key: 'sent', label: 'Sent', num: true },
    { key: 'opened', label: 'Opened', num: true },
    { key: 'openRate', label: 'Open Rate', num: true },
    { key: 'clicked', label: 'Clicked', num: true },
    { key: 'clickRate', label: 'CTR', num: true },
    { key: 'status', label: 'Status' },
  ];

  return repSection('Campaign Performance', `${rows.length} campaigns`, repTable(cols, rows),
    `<button class="btn btn-sm btn-ghost" data-export="camp-csv">CSV</button>`
  );
}

// ---------------------------------------------------------------------------
// Wire exports
// ---------------------------------------------------------------------------
function wireExports(mount, leads, campaigns, events, start, end, label) {
  mount.querySelectorAll('button[data-export]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.export;
      if (key === 'src-csv') {
        const srcMap = {};
        leads.forEach(l => { const src=l.source||'unknown'; if(!srcMap[src]) srcMap[src]={count:0,won:0}; srcMap[src].count++; if(l.status==='won') srcMap[src].won++; });
        const total=leads.length;
        const rows=[['Source','Leads','% of Total','Won','Win Rate']];
        Object.entries(srcMap).sort((a,b)=>b[1].count-a[1].count).forEach(([src,m]) => {
          rows.push([capitalize(src.replace(/_/g,' ')), m.count, total>0?(m.count/total*100).toFixed(1)+'%':'0%', m.won, m.count>0?Math.round(m.won/m.count*100)+'%':'']);
        });
        repCsv(rows,'lead-sources.csv');
      } else if (key === 'camp-csv') {
        const rows=[['Campaign','Type','Sent','Opened','Open Rate','Clicked','CTR','Status']];
        campaigns.forEach(c => {
          const camEvents=events.filter(e=>e.entityType==='campaign'&&e.entityId===c.id&&inRange(e.createdAt,start,end));
          const sent=camEvents.filter(e=>e.type==='email_sent'||e.type==='sms_sent').length;
          const opened=camEvents.filter(e=>e.type==='email_opened').length;
          const clicked=camEvents.filter(e=>e.type==='link_clicked').length;
          rows.push([c.name||c.title||'', c.type||c.channel||'', sent, opened, sent>0?Math.round(opened/sent*100)+'%':'', clicked, opened>0?Math.round(clicked/opened*100)+'%':'', c.status||'']);
        });
        repCsv(rows,'campaigns.csv');
      }
    };
  });
}

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
