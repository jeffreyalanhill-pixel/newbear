// AutoBook — modules/invoices/inv-accounting-export.js
// "Plug & Play" accounting/export placeholder cards — same pattern as
// modules/inventory/inv-suppliers-integrations.js's integration grid. No
// external APIs — nothing here connects to QuickBooks/Xero/Sage/etc.
const INTEGRATIONS = [
  { name: 'QuickBooks', desc: 'Sync invoices, payments, and expenses to QuickBooks Online.' },
  { name: 'Xero', desc: 'Sync invoices, payments, and expenses to Xero.' },
  { name: 'Sage', desc: 'Sync invoices, payments, and expenses to Sage.' },
  { name: 'CSV Export', desc: 'Already real — see the Share/Export menu on this page.', real: true },
  { name: 'Sales Tax Report', desc: 'Export collected tax by period for filing.' },
  { name: 'Receivables Aging Export', desc: 'Already real — see the Share/Export menu on this page.', real: true },
  { name: 'Payments Export', desc: 'Already real — see the Share/Export menu on this page.', real: true },
  { name: 'Expense Export', desc: 'Already real — see the Share/Export menu on this page.', real: true },
];

export function renderInvAccountingExport(mount) {
  mount.innerHTML = `
    <div class="card">
      <div class="card-head"><div class="card-title">Accounting &amp; Export</div><span class="badge badge-gray">most not connected — future integrations</span></div>
      <div class="card-body"><div class="grid-3">
        ${INTEGRATIONS.map((i) => `
          <div class="stat-card">
            <div class="stat-label">${i.name}</div>
            <div class="muted" style="font-size:var(--t-13);margin:6px 0">${i.desc}</div>
            <span class="badge ${i.real ? 'badge-green' : 'badge-gray'}">${i.real ? 'real — CSV today' : 'not connected'}</span>
          </div>`).join('')}
      </div></div>
    </div>
  `;
}
