// AutoBook — lib/data.js
// THE single data-access source (Part A scope: shop settings, customers, vehicles,
// services, parts, techs/bays, bookings, repair orders, invoices).
// Pages/modules NEVER touch localStorage or JSON.parse storage directly — only
// the functions in this file do. Everything else calls `db.*`.
//
// Not yet built here (later steps per the build spec): CRM (leads/opportunities/
// accounts), TeamOps (timecards/PTO/payroll), Marketing (campaigns/segments),
// Platform (multi-tenant workspaces). `employees`/`techs` below are the Part A
// minimal Employee shape only.

const PREFIX = 'ab_';

// Node-safe storage shim so this module is testable outside a browser; in the
// browser it's just window.localStorage.
const STORAGE = (typeof localStorage !== 'undefined')
  ? localStorage
  : (() => {
      const m = new Map();
      return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      };
    })();

const KEYS = {
  settings: 'settings',
  customers: 'customers',
  vehicles: 'vehicles',
  services: 'services',
  parts: 'parts',
  employees: 'employees',
  bays: 'bays',
  bookings: 'bookings',
  jobs: 'jobs',
  invoices: 'invoices',
  registers: 'registers',
  sales: 'sales',
  leads: 'leads',
  segments: 'segments',
  templates: 'templates',
  campaigns: 'campaigns',
  communications: 'communications',
  roles: 'roles',
  shifts: 'shifts',
  auditLogs: 'auditLogs',
  automations: 'automations',
  quotes: 'quotes',
  // ---- Platform / Phase E (SaaS signup foundation) ----
  // Separate from everything above: `settings`/`customers`/`jobs`/etc. remain
  // the ONE operational shop this whole app runs on (no multi-tenant scoping
  // exists yet). These platform keys are an additive layer of real records
  // for the signup/billing/admin demo — see lib/util.js's createSignupAccount
  // for the one place that writes to all of them together.
  accounts: 'pf_accounts',
  shops: 'pf_shops',
  subscriptions: 'pf_subscriptions',
  plans: 'pf_plans',
  users: 'pf_users',
  memberships: 'pf_memberships',
  onboardingProgress: 'pf_onboardingProgress',
  // ---- TeamOps Phase 2 ----
  ptoRequests: 'ptoRequests',
  teamActivity: 'teamActivity',
  employeeDocuments: 'employeeDocuments',
  // ---- TeamOps Scheduling Phase 2 ----
  timeClockEntries: 'timeClockEntries',
  teamMessages: 'teamMessages',
  scheduleWeeks: 'scheduleWeeks',
  availability: 'availability',
  // Added late (was referenced by lib/util.js/modules/team/schedule.js from
  // an earlier task but never actually landed here — fixing that regression
  // alongside this task's additions).
  shiftTradeRequests: 'shiftTradeRequests',
  // ---- InvoiceOps finance dashboard ----
  invoiceItems: 'invoiceItems',
  expenses: 'expenses',
  creditNotes: 'creditNotes',
  scheduleTemplates: 'scheduleTemplates',
  // ---- InventoryOps (multi-location inventory / order management foundation) ----
  inventoryLocations: 'inventoryLocations',
  inventoryLocationStock: 'inventoryLocationStock',
  purchaseOrders: 'purchaseOrders',
  purchaseOrderItems: 'purchaseOrderItems',
  inventoryTransfers: 'inventoryTransfers',
  returns: 'returns',
  cycleCounts: 'cycleCounts',
  cycleCountItems: 'cycleCountItems',
  inventoryTransactions: 'inventoryTransactions',
  suppliers: 'suppliers',
  inventoryChannels: 'inventoryChannels',
  // ---- Cross-module workflow layer (lib/workflow.js) ----
  entityLinks: 'entityLinks',
  activityEvents: 'activityEvents',
  followUpTasks: 'followUpTasks',
};

export const db = {
  // ---- raw get/set (the only functions that touch storage) ----
  get(key) {
    const raw = STORAGE.getItem(PREFIX + key);
    return raw == null ? null : JSON.parse(raw);
  },
  set(key, value) {
    STORAGE.setItem(PREFIX + key, JSON.stringify(value));
    return value;
  },

  // ---- collection getters (never null) ----
  customers() { return db.get(KEYS.customers) || []; },
  vehicles() { return db.get(KEYS.vehicles) || []; },
  services() { return db.get(KEYS.services) || []; },
  parts() { return db.get(KEYS.parts) || []; },
  employees() { return db.get(KEYS.employees) || []; },
  bays() { return db.get(KEYS.bays) || []; },
  bookings() { return db.get(KEYS.bookings) || []; },
  jobs() { return db.get(KEYS.jobs) || []; },
  invoices() { return db.get(KEYS.invoices) || []; },
  registers() { return db.get(KEYS.registers) || []; },
  sales() { return db.get(KEYS.sales) || []; },
  leads() { return db.get(KEYS.leads) || []; },
  segments() { return db.get(KEYS.segments) || []; },
  templates() { return db.get(KEYS.templates) || []; },
  campaigns() { return db.get(KEYS.campaigns) || []; },
  communications() { return db.get(KEYS.communications) || []; },
  roles() { return db.get(KEYS.roles) || []; },
  automations() { return db.get(KEYS.automations) || []; },
  shifts() { return db.get(KEYS.shifts) || []; },
  auditLogs() { return db.get(KEYS.auditLogs) || []; },
  quotes() { return db.get(KEYS.quotes) || []; },
  accounts() { return db.get(KEYS.accounts) || []; },
  shops() { return db.get(KEYS.shops) || []; },
  subscriptions() { return db.get(KEYS.subscriptions) || []; },
  plans() { return db.get(KEYS.plans) || []; },
  users() { return db.get(KEYS.users) || []; },
  memberships() { return db.get(KEYS.memberships) || []; },
  onboardingProgress() { return db.get(KEYS.onboardingProgress) || []; },
  ptoRequests() { return db.get(KEYS.ptoRequests) || []; },
  teamActivity() { return db.get(KEYS.teamActivity) || []; },
  employeeDocuments() { return db.get(KEYS.employeeDocuments) || []; },
  timeClockEntries() { return db.get(KEYS.timeClockEntries) || []; },
  teamMessages() { return db.get(KEYS.teamMessages) || []; },
  scheduleWeeks() { return db.get(KEYS.scheduleWeeks) || []; },
  availability() { return db.get(KEYS.availability) || []; },
  scheduleTemplates() { return db.get(KEYS.scheduleTemplates) || []; },
  shiftTradeRequests() { return db.get(KEYS.shiftTradeRequests) || []; },
  invoiceItems() { return db.get(KEYS.invoiceItems) || []; },
  expenses() { return db.get(KEYS.expenses) || []; },
  creditNotes() { return db.get(KEYS.creditNotes) || []; },
  inventoryLocations() { return db.get(KEYS.inventoryLocations) || []; },
  inventoryLocationStock() { return db.get(KEYS.inventoryLocationStock) || []; },
  purchaseOrders() { return db.get(KEYS.purchaseOrders) || []; },
  purchaseOrderItems() { return db.get(KEYS.purchaseOrderItems) || []; },
  inventoryTransfers() { return db.get(KEYS.inventoryTransfers) || []; },
  returns() { return db.get(KEYS.returns) || []; },
  cycleCounts() { return db.get(KEYS.cycleCounts) || []; },
  cycleCountItems() { return db.get(KEYS.cycleCountItems) || []; },
  inventoryTransactions() { return db.get(KEYS.inventoryTransactions) || []; },
  suppliers() { return db.get(KEYS.suppliers) || []; },
  inventoryChannels() { return db.get(KEYS.inventoryChannels) || []; },
  entityLinks() { return db.get(KEYS.entityLinks) || []; },
  activityEvents() { return db.get(KEYS.activityEvents) || []; },
  followUpTasks() { return db.get(KEYS.followUpTasks) || []; },
  settings() { return db.get(KEYS.settings) || {}; },
  techs() { return db.employees().filter(e => e.isTech); },

  // ---- collection setters ----
  saveCustomers(a) { return db.set(KEYS.customers, a); },
  saveVehicles(a) { return db.set(KEYS.vehicles, a); },
  saveServices(a) { return db.set(KEYS.services, a); },
  saveParts(a) { return db.set(KEYS.parts, a); },
  saveEmployees(a) { return db.set(KEYS.employees, a); },
  saveBays(a) { return db.set(KEYS.bays, a); },
  saveBookings(a) { return db.set(KEYS.bookings, a); },
  saveJobs(a) { return db.set(KEYS.jobs, a); },
  saveInvoices(a) { return db.set(KEYS.invoices, a); },
  saveRegisters(a) { return db.set(KEYS.registers, a); },
  saveSales(a) { return db.set(KEYS.sales, a); },
  saveLeads(a) { return db.set(KEYS.leads, a); },
  saveSegments(a) { return db.set(KEYS.segments, a); },
  saveTemplates(a) { return db.set(KEYS.templates, a); },
  saveCampaigns(a) { return db.set(KEYS.campaigns, a); },
  saveCommunications(a) { return db.set(KEYS.communications, a); },
  saveRoles(a) { return db.set(KEYS.roles, a); },
  saveAutomations(a) { return db.set(KEYS.automations, a); },
  saveQuotes(a) { return db.set(KEYS.quotes, a); },
  saveAccounts(a) { return db.set(KEYS.accounts, a); },
  saveShops(a) { return db.set(KEYS.shops, a); },
  saveSubscriptions(a) { return db.set(KEYS.subscriptions, a); },
  savePlans(a) { return db.set(KEYS.plans, a); },
  saveUsers(a) { return db.set(KEYS.users, a); },
  saveMemberships(a) { return db.set(KEYS.memberships, a); },
  saveOnboardingProgress(a) { return db.set(KEYS.onboardingProgress, a); },
  savePtoRequests(a) { return db.set(KEYS.ptoRequests, a); },
  saveTeamActivity(a) { return db.set(KEYS.teamActivity, a); },
  saveEmployeeDocuments(a) { return db.set(KEYS.employeeDocuments, a); },
  saveTimeClockEntries(a) { return db.set(KEYS.timeClockEntries, a); },
  saveTeamMessages(a) { return db.set(KEYS.teamMessages, a); },
  saveScheduleWeeks(a) { return db.set(KEYS.scheduleWeeks, a); },
  saveAvailability(a) { return db.set(KEYS.availability, a); },
  saveShiftTradeRequests(a) { return db.set(KEYS.shiftTradeRequests, a); },
  saveInvoiceItems(a) { return db.set(KEYS.invoiceItems, a); },
  saveExpenses(a) { return db.set(KEYS.expenses, a); },
  saveCreditNotes(a) { return db.set(KEYS.creditNotes, a); },
  saveScheduleTemplates(a) { return db.set(KEYS.scheduleTemplates, a); },
  saveInventoryLocations(a) { return db.set(KEYS.inventoryLocations, a); },
  saveInventoryLocationStock(a) { return db.set(KEYS.inventoryLocationStock, a); },
  savePurchaseOrders(a) { return db.set(KEYS.purchaseOrders, a); },
  savePurchaseOrderItems(a) { return db.set(KEYS.purchaseOrderItems, a); },
  saveInventoryTransfers(a) { return db.set(KEYS.inventoryTransfers, a); },
  saveReturns(a) { return db.set(KEYS.returns, a); },
  saveCycleCounts(a) { return db.set(KEYS.cycleCounts, a); },
  saveCycleCountItems(a) { return db.set(KEYS.cycleCountItems, a); },
  saveInventoryTransactions(a) { return db.set(KEYS.inventoryTransactions, a); },
  saveSuppliers(a) { return db.set(KEYS.suppliers, a); },
  saveInventoryChannels(a) { return db.set(KEYS.inventoryChannels, a); },
  saveEntityLinks(a) { return db.set(KEYS.entityLinks, a); },
  saveActivityEvents(a) { return db.set(KEYS.activityEvents, a); },
  saveFollowUpTasks(a) { return db.set(KEYS.followUpTasks, a); },
  saveShifts(a) { return db.set(KEYS.shifts, a); },
  saveAuditLogs(a) { return db.set(KEYS.auditLogs, a); },
  saveSettings(o) { return db.set(KEYS.settings, o); },
  saveTechs(a) {
    // techs are a filtered view of employees; merge back by id
    const byId = new Map(a.map(t => [t.id, t]));
    const merged = db.employees().map(e => byId.get(e.id) || e);
    return db.saveEmployees(merged);
  },

  // ---- by-id lookups ----
  customerById(id) { return db.customers().find(c => c.id === id); },
  vehicleById(id) { return db.vehicles().find(v => v.id === id); },
  serviceById(id) { return db.services().find(s => s.id === id); },
  partById(id) { return db.parts().find(p => p.id === id); },
  employeeById(id) { return db.employees().find(e => e.id === id); },
  techById(id) { return db.employeeById(id); },
  bayById(id) { return db.bays().find(b => b.id === id); },
  bookingById(id) { return db.bookings().find(b => b.id === id); },
  jobById(id) { return db.jobs().find(j => j.id === id); },
  invoiceById(id) { return db.invoices().find(i => i.id === id); },
  shiftTradeRequestById(id) { return db.shiftTradeRequests().find(r => r.id === id); },
  shiftTradeRequestsForShift(shiftId) { return db.shiftTradeRequests().filter(r => r.originalShiftId === shiftId || r.targetShiftId === shiftId); },
  pendingShiftTradeRequests() { return db.shiftTradeRequests().filter(r => r.status === 'pending'); },
  invoiceItemById(id) { return db.invoiceItems().find(i => i.id === id); },
  expenseById(id) { return db.expenses().find(e => e.id === id); },
  creditNoteById(id) { return db.creditNotes().find(c => c.id === id); },
  creditNotesForCustomer(customerId) { return db.creditNotes().filter(c => c.customerId === customerId); },
  registerById(id) { return db.registers().find(r => r.id === id); },
  saleById(id) { return db.sales().find(s => s.id === id); },
  leadById(id) { return db.leads().find(l => l.id === id); },
  segmentById(id) { return db.segments().find(s => s.id === id); },
  templateById(id) { return db.templates().find(t => t.id === id); },
  campaignById(id) { return db.campaigns().find(c => c.id === id); },
  roleById(id) { return db.roles().find(r => r.id === id); },
  automationById(id) { return db.automations().find(a => a.id === id); },
  inventoryLocationById(id) { return db.inventoryLocations().find(l => l.id === id); },
  purchaseOrderById(id) { return db.purchaseOrders().find(p => p.id === id); },
  inventoryTransferById(id) { return db.inventoryTransfers().find(t => t.id === id); },
  returnById(id) { return db.returns().find(r => r.id === id); },
  cycleCountById(id) { return db.cycleCounts().find(c => c.id === id); },
  supplierById(id) { return db.suppliers().find(s => s.id === id); },
  quoteById(id) { return db.quotes().find(q => q.id === id); },
  accountById(id) { return db.accounts().find(a => a.id === id); },
  shopById(id) { return db.shops().find(s => s.id === id); },
  planById(id) { return db.plans().find(p => p.id === id); },
  subscriptionById(id) { return db.subscriptions().find(s => s.id === id); },
  userById(id) { return db.users().find(u => u.id === id); },

  // ---- derived/relationship helpers ----
  vehiclesForCustomer(customerId) { return db.vehicles().filter(v => v.customerId === customerId); },
  jobsForVehicle(vehicleId) { return db.jobs().filter(j => j.vehicleId === vehicleId); },
  jobsForCustomer(customerId) { return db.jobs().filter(j => j.customerId === customerId); },
  openJobs() {
    const open = new Set(['scheduled', 'waiting', 'in_progress', 'on_hold']);
    return db.jobs().filter(j => open.has(j.status));
  },
  activeJobs() {
    const active = new Set(['waiting', 'in_progress', 'on_hold']);
    return db.jobs().filter(j => active.has(j.status));
  },
  pendingBookings() { return db.bookings().filter(b => b.status === 'pending'); },
  lowStockParts() { return db.parts().filter(p => p.qtyOnHand <= p.reorderPoint); },
  openRegister() { return db.registers().find(r => r.status === 'open'); },
  salesForRegister(sessionId) { return db.sales().filter(s => s.registerSessionId === sessionId); },
  leadsFor(advisorId) { return db.leads().filter(l => l.assignedAdvisorId === advisorId); },
  commsForCustomer(customerId) { return db.communications().filter(c => c.customerId === customerId); },
  quotesForCustomer(customerId) { return db.quotes().filter(q => q.customerId === customerId); },
  // §InventoryOps
  locationStockRow(partId, locationId) { return db.inventoryLocationStock().find(s => s.partId === partId && s.locationId === locationId); },
  stockForLocation(locationId) { return db.inventoryLocationStock().filter(s => s.locationId === locationId); },
  itemsForPO(poId) { return db.purchaseOrderItems().filter(i => i.poId === poId); },
  transactionsForPart(partId) { return db.inventoryTransactions().filter(t => t.partId === partId); },
  itemsForCycleCount(countId) { return db.cycleCountItems().filter(i => i.countId === countId); },
  subscriptionForShop(shopId) { return db.subscriptions().find(s => s.shopId === shopId); },
  shopsForAccount(accountId) { return db.shops().filter(s => s.accountId === accountId); },
  membershipsForShop(shopId) { return db.memberships().filter(m => m.shopId === shopId); },
  membershipsForUser(userId) { return db.memberships().filter(m => m.userId === userId); },
  shiftsForWeek(weekStartIso) {
    const start = new Date(weekStartIso + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return db.shifts().filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= start && d < end;
    });
  },
  // §TeamOps Phase 2 — per-employee schedule/PTO/document/activity views.
  // All filter the same top-level collections shiftsForWeek/etc. already use.
  shiftsForEmployee(employeeId) { return db.shifts().filter(s => s.employeeId === employeeId); },
  ptoForEmployee(employeeId) { return db.ptoRequests().filter(p => p.employeeId === employeeId); },
  documentsForEmployee(employeeId) { return db.employeeDocuments().filter(d => d.employeeId === employeeId); },
  teamActivityFor(employeeId) { return db.teamActivity().filter(a => a.employeeId === employeeId); },
  // §TeamOps Scheduling Phase 2
  timeClockEntriesForDate(dateIso) { return db.timeClockEntries().filter(t => t.date === dateIso); },
  timeClockEntryFor(employeeId, dateIso) { return db.timeClockEntries().find(t => t.employeeId === employeeId && t.date === dateIso); },
  shiftsForDate(dateIso) { return db.shifts().filter(s => s.date === dateIso); },
  ptoForDate(dateIso) {
    return db.ptoRequests().filter(p => p.status !== 'denied' && p.status !== 'canceled' && p.startDate <= dateIso && p.endDate >= dateIso);
  },
  weekStatusByStart(weekStart) { return db.scheduleWeeks().find(w => w.weekStart === weekStart); },
  availabilityForEmployee(employeeId) { return db.availability().filter(a => a.employeeId === employeeId); },
  // §B.4.3 employee activity feed: every RO they were the tech or advisor on.
  employeeActivity(employeeId) {
    return db.jobs()
      .filter(j => j.techId === employeeId || j.advisorId === employeeId)
      .map(j => ({ ro: j.ro, id: j.id, at: j.createdAt, status: j.status, total: j.total, role: j.techId === employeeId ? 'tech' : 'advisor' }))
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  },
  // §D — segment membership. Always excludes do-not-contact customers, per
  // the spec's audience-preview rule. `criteria.kind` selects one of the
  // named AutoBook segment types (see segments.js for the canonical list);
  // `criteria.vehicleMake` is the original free-form make filter and can
  // combine with a kind. Two kinds are documented heuristics rather than
  // exact computations because the underlying entity doesn't exist yet —
  // see the inline notes on 'fleet' and 'high_value' below.
  segmentMembers(segmentId) {
    const segment = db.segmentById(segmentId);
    if (!segment) return [];
    const criteria = segment.criteria || {};
    let customers = db.customers().filter(c => !c.doNotContact);

    if (criteria.vehicleMake) {
      const make = criteria.vehicleMake.toLowerCase();
      customers = customers.filter(c => db.vehiclesForCustomer(c.id).some(v => (v.make || '').toLowerCase() === make));
    }

    const DAY = 86400000;
    const now = Date.now();

    switch (criteria.kind) {
      case 'new':
        // Real: Customer.createdAt (set at first booking/job intake) within 30 days.
        customers = customers.filter(c => (now - new Date(c.createdAt).getTime()) / DAY <= 30);
        break;
      case 'returning':
        // Real: 2+ repair orders on file.
        customers = customers.filter(c => db.jobsForCustomer(c.id).length >= 2);
        break;
      case 'inactive':
        // Real: has prior RO history, but none in the last 90 days. (A
        // customer with zero history is "new"/unknown, not "inactive".)
        customers = customers.filter(c => {
          const jobs = db.jobsForCustomer(c.id);
          if (!jobs.length) return false;
          const last = Math.max(...jobs.map(j => new Date(j.createdAt).getTime()));
          return (now - last) / DAY > 90;
        });
        break;
      case 'due_oil_change':
        // Real: any vehicle whose most recent Oil Change line item (refId
        // 's_oil') is >150 days old, or has never had one.
        customers = customers.filter(c => db.vehiclesForCustomer(c.id).some(v => isDueForService(v.id, 's_oil', 150)));
        break;
      case 'due_tire_rotation':
        // Real: same logic, Tire Rotation (refId 's_rotate'), 180-day interval.
        customers = customers.filter(c => db.vehiclesForCustomer(c.id).some(v => isDueForService(v.id, 's_rotate', 180)));
        break;
      case 'declined_services':
        // Real: any RO with approvalStatus === 'declined' (set by
        // util.resolveApproval), OR any Quote that was declined (in whole
        // or in part) tied to this customer.
        customers = customers.filter(c =>
          db.jobsForCustomer(c.id).some(j => j.approvalStatus === 'declined') ||
          db.quotesForCustomer(c.id).some(q => q.status === 'declined' || (q.lineItems || []).some(l => l.status === 'declined')));
        break;
      case 'high_value':
        // ASSUMPTION: no lifetime-value threshold is defined anywhere else
        // in the app. Using $400+ in lifetime invoiced total as a documented
        // MVP cutoff for "high value" — real, but the threshold is a guess.
        customers = customers.filter(c => {
          const total = db.invoices().filter(i => i.customerId === c.id).reduce((s, i) => s + i.total, 0);
          return total >= 400;
        });
        break;
      case 'fleet':
        // ASSUMPTION: there is no Account/fleet entity yet (that's a later
        // CRM phase — see Part C). Heuristic stand-in: a customer with 3+
        // vehicles on file is treated as fleet/commercial-like. This will
        // be replaced once Accounts exist.
        customers = customers.filter(c => db.vehiclesForCustomer(c.id).length >= 3);
        break;
      case 'upcoming_appointments':
        // Real: a scheduled/waiting RO with a scheduledDate today or later.
        customers = customers.filter(c => db.jobsForCustomer(c.id).some(j => j.scheduledDate && j.scheduledDate >= new Date().toISOString().slice(0, 10) && ['scheduled', 'waiting'].includes(j.status)));
        break;
      case 'missing_contact':
        // Real: no email on file, or no phone on file.
        customers = customers.filter(c => !c.email || !c.phone);
        break;
      case 'no_show':
        // Real: any RO marked noShow (set by the Appointments scheduler's
        // "Mark No-Show" action).
        customers = customers.filter(c => db.jobsForCustomer(c.id).some(j => j.noShow));
        break;
      case 'unpaid_invoices':
        // Real: any invoice with a positive balance.
        customers = customers.filter(c => db.invoices().some(i => i.customerId === c.id && i.balance > 0));
        break;
      default:
        break; // 'all' / no kind — no further filtering
    }

    return customers;
  },
  // Merged activity feed for a customer's CRM profile (§C.10): every booking
  // request, repair order, and invoice tied to them, newest first. Estimates
  // and declined-work aren't modeled yet (later CRM phase) — omitted, not faked.
  customerTimeline(customerId) {
    const events = [];
    db.bookings().filter(b => b.customerId === customerId).forEach(b => {
      events.push({ type: 'booking', at: b.submittedAt, label: 'Booking request', status: b.status, refId: b.id });
    });
    db.jobsForCustomer(customerId).forEach(j => {
      events.push({ type: 'repair_order', at: j.createdAt, label: j.ro, status: j.status, total: j.total, refId: j.id });
    });
    db.invoices().filter(i => i.customerId === customerId).forEach(i => {
      events.push({ type: 'invoice', at: i.issuedAt, label: i.number, status: i.status, total: i.total, refId: i.id });
    });
    db.commsForCustomer(customerId).forEach(c => {
      events.push({ type: 'communication', at: c.at, label: c.subject || 'Message sent', status: c.channel, refId: c.id });
    });
    db.quotesForCustomer(customerId).forEach(q => {
      events.push({ type: 'quote', at: q.updatedAt || q.createdAt, label: `${q.quoteNumber} — ${q.title}`, status: q.status, total: q.total, refId: q.id });
    });
    // Cross-module workflow events (lib/workflow.js) — finer-grained moments
    // (checked in, DVI/RO findings, quote sent/viewed/approved/declined,
    // payments, follow-ups) that aren't derivable from a single entity field.
    db.activityEvents().filter(e => e.customerId === customerId).forEach(e => {
      events.push({ type: e.type, at: e.createdAt, label: e.title, status: e.status, refId: e.entityId });
    });
    return events.sort((a, b) => new Date(b.at) - new Date(a.at));
  },

  // ---- ID / number generators ----
  nextId(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  },
  nextRO() {
    const nums = db.jobs()
      .map(j => parseInt(String(j.ro || '').replace('RO-', ''), 10))
      .filter(n => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 2044;
    return 'RO-' + (max + 1);
  },
  nextInvoiceNumber() {
    const nums = db.invoices()
      .map(i => parseInt(String(i.number || '').replace('INV-', ''), 10))
      .filter(n => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 1000;
    return 'INV-' + (max + 1);
  },
  nextSaleNumber() {
    const nums = db.sales()
      .map(s => parseInt(String(s.number || '').replace('S-', ''), 10))
      .filter(n => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 3000;
    return 'S-' + (max + 1);
  },
  nextQuoteNumber() {
    const nums = db.quotes()
      .map(q => parseInt(String(q.quoteNumber || '').replace('Q-', ''), 10))
      .filter(n => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 5000;
    return 'Q-' + (max + 1);
  },

  // ---- inventory mutation ----
  adjustPartQty(partId, delta) {
    const parts = db.parts();
    const p = parts.find(x => x.id === partId);
    if (!p) return;
    p.qtyOnHand = Math.max(0, (p.qtyOnHand || 0) + delta);
    db.saveParts(parts);
    return p;
  },

  // ---- lifecycle ----
  init() {
    _migrateCustomerNames();
    if (db.get(KEYS.settings) != null) return; // seed only if empty
    seed();
  },
  reset() {
    Object.values(KEYS).forEach(k => STORAGE.removeItem(PREFIX + k));
    seed();
  },
};

// §D marketing segment helper — true if this vehicle's most recent line item
// referencing `serviceId` is older than `intervalDays`, or it has never had
// that service. Used by the due_oil_change/due_tire_rotation segment kinds.
function isDueForService(vehicleId, serviceId, intervalDays) {
  const jobs = db.jobsForVehicle(vehicleId).filter(j => (j.lineItems || []).some(l => l.refId === serviceId));
  if (!jobs.length) return true;
  const lastServiced = Math.max(...jobs.map(j => new Date(j.createdAt).getTime()));
  return (Date.now() - lastServiced) / 86400000 > intervalDays;
}

// ---------------------------------------------------------------------------
// Migration: backfill firstName/lastName from name on legacy customer records.
// Runs on every init() so existing localStorage data from old seeds is fixed
// without requiring a demo reset. Safe: never overwrites a field that already
// has a value.
// ---------------------------------------------------------------------------
function _migrateCustomerNames() {
  const raw = db.get(KEYS.customers);
  if (!raw) return;
  let dirty = false;
  const customers = raw.map(c => {
    if (!c.firstName && !c.lastName && c.name) {
      const parts = c.name.trim().split(' ');
      dirty = true;
      return { ...c, firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '' };
    }
    return c;
  });
  if (dirty) db.set(KEYS.customers, customers);
}

// ---------------------------------------------------------------------------
// Seed data (§12, Part A scope) — reproduces the dashboard mockup approximately.
// ---------------------------------------------------------------------------
function seed() {
  const todayISO = (h, m) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const daysAgoISO = (n, h = 9, m = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  db.saveSettings({
    name: 'AutoBook Demo Shop',
    owner: 'Jeff',
    phone: '(555) 240-1900',
    email: 'shop@autobookdemo.com',
    address: '418 Industrial Pkwy, Springfield',
    hours: {
      mon: { open: '08:00', close: '17:30' },
      tue: { open: '08:00', close: '17:30' },
      wed: { open: '08:00', close: '17:30' },
      thu: { open: '08:00', close: '17:30' },
      fri: { open: '08:00', close: '17:30' },
      sat: { open: '08:00', close: '13:00' },
      sun: { closed: true },
    },
    capacityHours: 32,
    aroTarget: 425,
    laborRate: 120,
    taxRate: 0.0675,
    coupons: [{ code: 'WELCOME10', type: 'percent', value: 10, active: true }],
    currentUserId: 'e_jeff', // TeamOps (Part B): light auth — who's "logged in" in this demo
  });

  // ---- Bays ----
  const bays = [
    { id: 'b_1', name: 'Bay 1', type: 'general', techId: 't_devon' },
    { id: 'b_2', name: 'Bay 2', type: 'general', techId: 't_tyler' },
    { id: 'b_3', name: 'Bay 3', type: 'lift', techId: 't_marcus' },
    { id: 'b_4', name: 'Bay 4', type: 'diag', techId: 't_chris' },
  ];
  db.saveBays(bays);

  // ---- Employees (Part A base shape + Part B/TeamOps fields) ----
  // `role` is the Role id (see Roles below); `employmentStatus`/jobTitle/
  // phone/email/hireDate/permissionOverrides are the Phase-1 TeamOps fields.
  // TeamOps Phase 2 adds department/managerId/emergencyContact*/employmentType/
  // accountStatus/accountEmail/ptoBalanceHours/sickBalanceHours/skillLevel/
  // certifications/notes — purely additive, no Phase-1 field renamed.
  const employees = [
    { id: 't_marcus', firstName: 'Marcus', lastName: 'Johnson', avatar: 'MJ', isTech: true, bayId: 'b_3', role: 'technician', jobTitle: 'Senior Technician', payType: 'flat_rate', payRate: 32, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1001', email: 'marcus.j@autobookdemo.com', hireDate: daysAgoISO(900).slice(0, 10), permissionOverrides: {},
      department: 'Service', managerId: 'e_jeff', emergencyContactName: 'Lena Johnson', emergencyContactPhone: '555-501-9001', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'marcus.j@autobookdemo.com', lastLoginAt: daysAgoISO(0, 7, 45), inviteSentAt: daysAgoISO(900), ptoBalanceHours: 36, sickBalanceHours: 24, skillLevel: 'Master Tech', certifications: ['ASE Master', 'A/C Certified'], notes: '',
      jobRole: 'technician', permissionRole: 'technician', shiftDefaultRole: 'technician', canLogin: true, inviteStatus: 'accepted' },
    { id: 't_devon', firstName: 'Devon', lastName: 'Carter', avatar: 'DC', isTech: true, bayId: 'b_1', role: 'technician', jobTitle: 'Technician', payType: 'flat_rate', payRate: 30, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1002', email: 'devon.c@autobookdemo.com', hireDate: daysAgoISO(540).slice(0, 10), permissionOverrides: {},
      department: 'Service', managerId: 'e_jeff', emergencyContactName: 'Pat Carter', emergencyContactPhone: '555-501-9002', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'devon.c@autobookdemo.com', lastLoginAt: daysAgoISO(0, 8, 2), inviteSentAt: daysAgoISO(540), ptoBalanceHours: 18, sickBalanceHours: 16, skillLevel: 'Journeyman', certifications: ['ASE Brakes'], notes: '',
      jobRole: 'technician', permissionRole: 'technician', shiftDefaultRole: 'technician', canLogin: true, inviteStatus: 'accepted' },
    { id: 't_chris', firstName: 'Chris', lastName: 'Bell', avatar: 'CB', isTech: true, bayId: 'b_4', role: 'technician', jobTitle: 'Technician', payType: 'hourly', payRate: 26, clockStatus: 'in', workStatus: 'idle', employmentStatus: 'active', phone: '555-501-1003', email: 'chris.b@autobookdemo.com', hireDate: daysAgoISO(300).slice(0, 10), permissionOverrides: {},
      department: 'Service', managerId: 'e_jeff', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'full_time', accountStatus: 'invited', accountEmail: 'chris.b@autobookdemo.com', lastLoginAt: null, inviteSentAt: daysAgoISO(5), ptoBalanceHours: 8, sickBalanceHours: 8, skillLevel: 'Journeyman', certifications: [], notes: '',
      jobRole: 'technician', permissionRole: 'technician', shiftDefaultRole: 'technician', canLogin: false, inviteStatus: 'invited' },
    { id: 't_tyler', firstName: 'Tyler', lastName: 'Nguyen', avatar: 'TN', isTech: true, bayId: 'b_2', role: 'apprentice', jobTitle: 'Apprentice Technician', payType: 'hourly', payRate: 24, clockStatus: 'in', workStatus: 'waiting', employmentStatus: 'active', phone: '555-501-1004', email: 'tyler.n@autobookdemo.com', hireDate: daysAgoISO(120).slice(0, 10), permissionOverrides: {},
      department: 'Service', managerId: 't_marcus', emergencyContactName: 'Mai Nguyen', emergencyContactPhone: '555-501-9004', employmentType: 'part_time', accountStatus: 'active', accountEmail: 'tyler.n@autobookdemo.com', lastLoginAt: daysAgoISO(1, 9, 0), inviteSentAt: daysAgoISO(120), ptoBalanceHours: 4, sickBalanceHours: 4, skillLevel: 'Apprentice', certifications: [], notes: 'Working toward ASE certification.',
      jobRole: 'apprentice_technician', permissionRole: 'apprentice', shiftDefaultRole: 'technician', canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_sara', firstName: 'Sara', lastName: 'Diaz', avatar: 'SD', isTech: false, role: 'advisor', jobTitle: 'Service Advisor', payType: 'hourly', payRate: 24, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1005', email: 'sara.d@autobookdemo.com', hireDate: daysAgoISO(700).slice(0, 10), permissionOverrides: {},
      department: 'Front Office', managerId: 'e_jeff', emergencyContactName: 'Luis Diaz', emergencyContactPhone: '555-501-9005', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'sara.d@autobookdemo.com', lastLoginAt: daysAgoISO(0, 7, 30), inviteSentAt: daysAgoISO(700), ptoBalanceHours: 40, sickBalanceHours: 32, skillLevel: '', certifications: [], notes: '',
      jobRole: 'service_advisor', permissionRole: 'advisor', shiftDefaultRole: 'service_advisor', canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_jeff', firstName: 'Jeff', lastName: 'Hill', avatar: 'JH', isTech: false, role: 'owner', jobTitle: 'Owner', payType: 'salary', payRate: 95000, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1000', email: 'jeff@autobookdemo.com', hireDate: daysAgoISO(1500).slice(0, 10), permissionOverrides: {},
      department: 'Management', managerId: null, emergencyContactName: '', emergencyContactPhone: '', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'jeff@autobookdemo.com', lastLoginAt: daysAgoISO(0, 6, 50), inviteSentAt: daysAgoISO(1500), ptoBalanceHours: 80, sickBalanceHours: 40, skillLevel: '', certifications: [], notes: '',
      jobRole: 'owner', permissionRole: 'owner', shiftDefaultRole: 'manager_on_duty', canLogin: true, inviteStatus: 'accepted' },
    // Added for the role/permissions foundation (Phase 1 of the role+permissions
    // task) — gives the "View app as" demo switcher a Manager and Front Desk
    // employee to switch to, alongside the existing owner/advisor/technician.
    { id: 'e_priya', firstName: 'Priya', lastName: 'Shah', avatar: 'PS', isTech: false, role: 'general_manager', jobTitle: 'General Manager', payType: 'salary', payRate: 68000, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1006', email: 'priya.s@autobookdemo.com', hireDate: daysAgoISO(620).slice(0, 10), permissionOverrides: {},
      department: 'Management', managerId: 'e_jeff', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'priya.s@autobookdemo.com', lastLoginAt: daysAgoISO(0, 7, 10), inviteSentAt: daysAgoISO(620), ptoBalanceHours: 60, sickBalanceHours: 32, skillLevel: '', certifications: [], notes: '',
      jobRole: 'general_manager', permissionRole: 'general_manager', shiftDefaultRole: 'manager_on_duty', canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_robin', firstName: 'Robin', lastName: 'Park', avatar: 'RP', isTech: false, role: 'front_desk', jobTitle: 'Front Desk', payType: 'hourly', payRate: 19, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1007', email: 'robin.p@autobookdemo.com', hireDate: daysAgoISO(200).slice(0, 10), permissionOverrides: {},
      department: 'Front Office', managerId: 'e_sara', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'part_time', accountStatus: 'active', accountEmail: 'robin.p@autobookdemo.com', lastLoginAt: daysAgoISO(0, 8, 15), inviteSentAt: daysAgoISO(200), ptoBalanceHours: 10, sickBalanceHours: 6, skillLevel: '', certifications: [], notes: '',
      jobRole: 'front_desk', permissionRole: 'front_desk', shiftDefaultRole: 'front_desk', canLogin: true, inviteStatus: 'accepted' },
    // Added for the role-presets task — gives the "View app as" demo switcher
    // a target employee for every one of the 11 normal app permission roles.
    { id: 'e_omar', firstName: 'Omar', lastName: 'Reyes', avatar: 'OR', isTech: false, role: 'service_manager', jobTitle: 'Service Manager', payType: 'salary', payRate: 58000, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1008', email: 'omar.r@autobookdemo.com', hireDate: daysAgoISO(400).slice(0, 10), permissionOverrides: {},
      department: 'Service', managerId: 'e_priya', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'omar.r@autobookdemo.com', lastLoginAt: daysAgoISO(0, 7, 20), inviteSentAt: daysAgoISO(400), ptoBalanceHours: 48, sickBalanceHours: 24, skillLevel: '', certifications: [], notes: '',
      jobRole: 'service_manager', permissionRole: 'service_manager', shiftDefaultRole: 'manager_on_duty', canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_dana', firstName: 'Dana', lastName: 'Kim', avatar: 'DK', isTech: false, role: 'parts', jobTitle: 'Parts Specialist', payType: 'hourly', payRate: 21, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1009', email: 'dana.k@autobookdemo.com', hireDate: daysAgoISO(260).slice(0, 10), permissionOverrides: {},
      department: 'Parts', managerId: 'e_jeff', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'full_time', accountStatus: 'active', accountEmail: 'dana.k@autobookdemo.com', lastLoginAt: daysAgoISO(0, 8, 0), inviteSentAt: daysAgoISO(260), ptoBalanceHours: 20, sickBalanceHours: 12, skillLevel: '', certifications: [], notes: '',
      jobRole: 'parts_inventory', permissionRole: 'parts', shiftDefaultRole: 'inventory', canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_felix', firstName: 'Felix', lastName: 'Ortiz', avatar: 'FO', isTech: false, role: 'bookkeeper', jobTitle: 'Bookkeeper', payType: 'salary', payRate: 52000, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1010', email: 'felix.o@autobookdemo.com', hireDate: daysAgoISO(500).slice(0, 10), permissionOverrides: {},
      department: 'Finance', managerId: 'e_jeff', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'part_time', accountStatus: 'active', accountEmail: 'felix.o@autobookdemo.com', lastLoginAt: daysAgoISO(1, 9, 0), inviteSentAt: daysAgoISO(500), ptoBalanceHours: 16, sickBalanceHours: 8, skillLevel: '', certifications: [], notes: '',
      jobRole: 'bookkeeper_finance', permissionRole: 'bookkeeper', shiftDefaultRole: null, canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_nina', firstName: 'Nina', lastName: 'Brooks', avatar: 'NB', isTech: false, role: 'marketing', jobTitle: 'Marketing Coordinator', payType: 'salary', payRate: 46000, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1011', email: 'nina.b@autobookdemo.com', hireDate: daysAgoISO(150).slice(0, 10), permissionOverrides: {},
      department: 'Marketing', managerId: 'e_jeff', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'part_time', accountStatus: 'active', accountEmail: 'nina.b@autobookdemo.com', lastLoginAt: daysAgoISO(2, 9, 0), inviteSentAt: daysAgoISO(150), ptoBalanceHours: 12, sickBalanceHours: 8, skillLevel: '', certifications: [], notes: '',
      jobRole: 'marketing_crm', permissionRole: 'marketing', shiftDefaultRole: null, canLogin: true, inviteStatus: 'accepted' },
    { id: 'e_walt', firstName: 'Walt', lastName: 'Greene', avatar: 'WG', isTech: false, role: 'viewer', jobTitle: 'Accountant (external)', payType: 'salary', payRate: 0, clockStatus: 'out', workStatus: 'idle', employmentStatus: 'active', phone: '555-501-1012', email: 'walt.g@autobookdemo.com', hireDate: daysAgoISO(60).slice(0, 10), permissionOverrides: {},
      department: '', managerId: 'e_jeff', emergencyContactName: '', emergencyContactPhone: '', employmentType: 'contractor', accountStatus: 'active', accountEmail: 'walt.g@autobookdemo.com', lastLoginAt: daysAgoISO(3, 10, 0), inviteSentAt: daysAgoISO(60), ptoBalanceHours: 0, sickBalanceHours: 0, skillLevel: '', certifications: [], notes: 'Read-only — reviews reports for the owner\'s CPA.',
      jobRole: 'viewer', permissionRole: 'viewer', shiftDefaultRole: null, canLogin: true, inviteStatus: 'accepted' },
  ];
  db.saveEmployees(employees);

  // ---- Roles & Permissions (§B.2, Phase 1) ----
  // Permission catalog kept to what Part A/CRM/Marketing/POS actually gate;
  // the full §B.2 catalog (payroll, HR fields, etc.) grows in later phases.
  const ALL_PERMS = {
    'customers.view': true, 'customers.edit': true, 'vehicles.view': true, 'vehicles.edit': true,
    'appointments.view': true, 'appointments.edit': true, 'bookings.confirm': true, 'appointments.assign': true,
    'invoices.view': true, 'payments.manage': true, 'employees.view': true, 'employees.edit': true,
    'schedules.manage': true, 'services.manage': true, 'settings.manage': true, 'crm.view': true,
    'leads.convert': true, 'campaigns.manage': true, 'reports.export': true, 'records.delete': true,
    'inventory.view': true, 'inventory.manage': true, 'billing.manage': true,
  };
  // Roles below are the App Permission Role (what auth.can() enforces — see
  // lib/auth.js). This is a distinct concept from an employee's Job Role
  // (job title/category, e.g. "Apprentice Technician") and Shift Role (which
  // role they're covering on a given shift, e.g. "Front Desk") — an employee
  // can have a Technician job role but be scheduled as Manager on Duty for a
  // shift. See employee.jobRole / employee.permissionRole / employee.shiftDefaultRole.
  // `description` and `color` are the only fields the role-presets task
  // added directly to the role record — defaultLandingPage/visibleNav are
  // deliberately NOT duplicated here (they'd just go stale); they're
  // computed live from `permissions`/module-access by lib/auth.js's
  // getDefaultLandingPageForRole()/getVisibleNavForRole() instead.
  db.saveRoles([
    { id: 'owner', name: 'Owner / Admin', color: 'blue', isSystem: true,
      description: 'Full access to everything — billing/subscription, users & roles, settings, exports, and every financial report.',
      permissions: { ...ALL_PERMS } },
    { id: 'general_manager', name: 'General Manager', color: 'blue', isSystem: true,
      description: 'Full day-to-day shop access — appointments, CRM, quotes, repair orders, inspections, invoices, POS, inventory, team schedule, PTO approvals, and reports. Limited settings; no subscription/billing ownership unless the owner grants it.',
      permissions: { ...ALL_PERMS, 'settings.manage': false, 'records.delete': false, 'billing.manage': false } },
    { id: 'service_manager', name: 'Service Manager', color: 'blue', isSystem: true,
      description: 'Shop floor & production access — repair orders, live monitor, inspections, tech/bay assignments, schedule, parts requests, and technician performance reports. No billing or deep finance settings.',
      permissions: {
        'customers.view': true, 'vehicles.view': true, 'vehicles.edit': true, 'appointments.view': true, 'appointments.edit': true,
        'appointments.assign': true, 'schedules.manage': true, 'inventory.view': true, 'employees.view': true,
      } },
    { id: 'advisor', name: 'Service Advisor', color: 'green', isSystem: true,
      description: 'Customer-facing workflow — appointments, CRM, intake, quotes, inspections, repair orders, and invoice create/view. No team admin, employee pay, billing, or deep financial reports.',
      permissions: {
        'customers.view': true, 'customers.edit': true, 'vehicles.view': true, 'vehicles.edit': true,
        'appointments.view': true, 'appointments.edit': true, 'bookings.confirm': true, 'appointments.assign': true,
        'invoices.view': true, 'payments.manage': true, 'crm.view': true, 'leads.convert': true, 'inventory.view': true,
      } },
    { id: 'front_desk', name: 'Front Desk', color: 'green', isSystem: true,
      description: 'Intake and basic customer workflow — appointments, booking requests, customer/vehicle intake, basic CRM, check-in/out, and limited invoice view. No reports, team admin, inventory admin, settings, or billing.',
      permissions: {
        'customers.view': true, 'customers.edit': true, 'vehicles.view': true, 'appointments.view': true,
        'appointments.edit': true, 'bookings.confirm': true, 'crm.view': true, 'invoices.view': true,
      } },
    { id: 'technician', name: 'Technician / Mechanic', color: 'amber', isSystem: true,
      description: 'Assigned work only — repair orders, inspections, job notes, parts requests, time clock, and own schedule/PTO. No invoices, payments, financial reports, marketing, team admin, settings, or billing.',
      permissions: {
        'customers.view': true, 'vehicles.view': true, 'appointments.view': true, 'inventory.view': true,
      } },
    { id: 'apprentice', name: 'Apprentice Technician', color: 'amber', isSystem: true,
      description: 'A more limited Technician — assigned jobs, inspection checklists, notes, time clock, own schedule. No final inspection approval, pricing changes, estimate approval, financial reports, or team admin.',
      permissions: {
        'vehicles.view': true, 'appointments.view': true,
      } },
    { id: 'parts', name: 'Parts / Inventory', color: 'amber', isSystem: true,
      description: 'Inventory & supplier workflow — inventory, suppliers, purchase orders, parts requests, transfers, returns, cycle counts, and stock reports. Limited RO view. No team admin, marketing, or billing.',
      permissions: {
        'inventory.view': true, 'inventory.manage': true, 'vehicles.view': true, 'appointments.view': true,
      } },
    { id: 'bookkeeper', name: 'Bookkeeper / Finance', color: 'gray', isSystem: true,
      description: 'Finance workflow — invoices, payments, refunds, financial reports, accounting/export and sales-tax placeholders. Limited customer/RO view. No technician workflow editing, marketing, scheduling admin, or subscription billing unless the owner allows it.',
      permissions: {
        'invoices.view': true, 'payments.manage': true, 'reports.export': true, 'customers.view': true, 'appointments.view': true,
      } },
    { id: 'marketing', name: 'Marketing / CRM', color: 'green', isSystem: true,
      description: 'Customer retention & campaigns — CRM segments, campaigns, review requests, declined-work follow-ups, email/SMS preview, and marketing reports. No invoices, payments, employee records, inventory admin, settings, or billing.',
      permissions: {
        'crm.view': true, 'leads.convert': true, 'campaigns.manage': true,
      } },
    { id: 'viewer', name: 'Viewer / Read Only', color: 'gray', isSystem: true,
      description: 'View-only — dashboard, reports, schedule, and selected records. Cannot create, edit, delete, approve, or export unless the owner allows it.',
      permissions: {
        'customers.view': true, 'vehicles.view': true, 'appointments.view': true, 'invoices.view': true, 'inventory.view': true,
      } },
    // Inactive for normal shops — reserved for Torklio's own internal support
    // staff once a real backend/multi-tenant admin exists. Not assignable from
    // the regular employee role picker (filtered out in modules/team/employees.js).
    // TODO (future, real backend only): this role is the seam for cross-tenant
    // support tooling — tenant switching/impersonation, diagnostics, and an
    // audit log distinct from the per-shop auditLogs() used today. None of
    // that exists yet; this row is a placeholder marker only.
    { id: 'platform_admin', name: 'Platform Admin (Torklio internal — placeholder)', color: 'red', isSystem: true, isPlatformInternal: true, active: false,
      description: 'Reserved for Torklio’s own internal support staff once a real multi-tenant backend exists. Not for normal shop employees. Not active yet.',
      permissions: { ...ALL_PERMS } },
  ]);

  // ---- Shifts — current week, next week, one future week (all key staff) ----
  // Covers Mon-Fri for each week. All employees get realistic shifts:
  //   Techs → Bay tech · assigned bay · 08:00–17:00 (Marcus/Devon/Chris)
  //   Chris → late shift 10:00–18:00 on Wed/Thu/Fri
  //   Tyler (apprentice) → 09:00–16:00, Bay 2
  //   Sara (advisor) → 07:30–17:30, front counter
  //   Robin (front desk) → 08:00–16:00, check-in
  //   Omar (service manager) → 07:30–17:00, service mgmt
  //   Dana (parts) → 08:00–17:00, parts desk
  //   Felix (bookkeeper) → Mon/Wed/Fri only
  //   Nina (marketing) → Tue/Thu only
  //   Open shift → Wednesday of current week, Bay tech role, no employee
  //   Shift trade request (Tyler, Thu this week) seeded below

  const today = new Date().toISOString().slice(0, 10);

  // Helper: ISO date string for a day offset from the Monday of a given week offset
  // weekOffset 0 = current week, 1 = next week, 2 = week after that
  function weekMonday(weekOffset) {
    const d = new Date();
    // Monday of current week
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7);
    return d;
  }

  function shiftDate(weekOffset, dayIndex) { // dayIndex 0=Mon..4=Fri
    const m = weekMonday(weekOffset);
    m.setDate(m.getDate() + dayIndex);
    return m.toISOString().slice(0, 10);
  }

  function weekStart(weekOffset) {
    return weekMonday(weekOffset).toISOString().slice(0, 10);
  }

  // Returns true for shift dates in the past
  function isPast(dateStr) { return dateStr < today; }
  function shiftStatus(dateStr) { return isPast(dateStr) ? 'completed' : 'scheduled'; }

  const shifts = [];
  function addShift(employeeId, weekOffset, dayIndex, start, end, roleForShift, bayId, note, statusOverride) {
    const date = shiftDate(weekOffset, dayIndex);
    shifts.push({
      id: db.nextId('shift'), employeeId, date,
      weekStart: weekStart(weekOffset),
      start, end, note: note || '', published: weekOffset <= 1,
      bayId: bayId || null, roleForShift: roleForShift || '',
      status: statusOverride || shiftStatus(date), breakMinutes: 30,
    });
    return shifts[shifts.length - 1].id;
  }

  // --- Current week (weekOffset 0) ---
  for (let d = 0; d < 5; d++) {
    // Marcus — Bay 3, Senior Tech, 08:00–17:00
    addShift('t_marcus', 0, d, '08:00', '17:00', 'Bay tech', 'b_3');
    // Devon — Bay 1, Tech, 08:00–17:00
    addShift('t_devon', 0, d, '08:00', '17:00', 'Bay tech', 'b_1');
    // Chris — Bay 4, late shift Mon–Tue early, Wed–Fri late
    addShift('t_chris', 0, d, d < 2 ? '08:00' : '10:00', d < 2 ? '17:00' : '18:00', 'Bay tech', 'b_4');
    // Tyler — Bay 2, Apprentice, 09:00–16:00 (not Tuesday — has PTO pending)
    if (d !== 1) addShift('t_tyler', 0, d, '09:00', '16:00', 'Bay tech', 'b_2', 'Apprentice — supervised by Marcus');
    // Sara — Service Advisor, front counter, 07:30–17:30
    addShift('e_sara', 0, d, '07:30', '17:30', 'Service advisor', null, 'Front counter');
    // Robin — Front Desk, check-in, 08:00–16:00
    addShift('e_robin', 0, d, '08:00', '16:00', 'Front desk', null, 'Check-in');
    // Omar — Service Manager, 07:30–17:00
    addShift('e_omar', 0, d, '07:30', '17:00', 'Manager on duty', null);
    // Dana — Parts desk, 08:00–17:00
    addShift('e_dana', 0, d, '08:00', '17:00', 'Inventory', null, 'Parts desk');
    // Felix — Bookkeeper, Mon/Wed/Fri only
    if (d % 2 === 0) addShift('e_felix', 0, d, '09:00', '15:00', 'Bookkeeper', null);
    // Nina — Marketing, Tue/Thu only
    if (d === 1 || d === 3) addShift('e_nina', 0, d, '09:00', '17:00', 'Marketing', null);
  }
  // Open shift — Wednesday of current week (Bay tech, no employee)
  shifts.push({
    id: db.nextId('shift'), employeeId: null, date: shiftDate(0, 2),
    weekStart: weekStart(0), start: '10:00', end: '18:00', note: 'Afternoon coverage needed — Bay 5',
    published: true, bayId: null, roleForShift: 'Bay tech',
    status: 'open', breakMinutes: 30,
  });

  // --- Next week (weekOffset 1) — published schedule ---
  for (let d = 0; d < 5; d++) {
    addShift('t_marcus', 1, d, '08:00', '17:00', 'Bay tech', 'b_3');
    addShift('t_devon',  1, d, '08:00', '17:00', 'Bay tech', 'b_1');
    addShift('t_chris',  1, d, d < 2 ? '08:00' : '10:00', d < 2 ? '17:00' : '18:00', 'Bay tech', 'b_4');
    if (d < 4) addShift('t_tyler', 1, d, '09:00', '16:00', 'Bay tech', 'b_2');
    addShift('e_sara',   1, d, '07:30', '17:30', 'Service advisor', null, 'Front counter');
    addShift('e_robin',  1, d, '08:00', '16:00', 'Front desk', null, 'Check-in');
    addShift('e_omar',   1, d, '07:30', '17:00', 'Manager on duty', null);
    addShift('e_dana',   1, d, '08:00', '17:00', 'Inventory', null, 'Parts desk');
    if (d % 2 === 0) addShift('e_felix', 1, d, '09:00', '15:00', 'Bookkeeper', null);
    if (d === 1 || d === 3) addShift('e_nina', 1, d, '09:00', '17:00', 'Marketing', null);
  }
  // Open shift next week — Monday, any tech
  shifts.push({
    id: db.nextId('shift'), employeeId: null, date: shiftDate(1, 0),
    weekStart: weekStart(1), start: '08:00', end: '17:00', note: 'Need coverage — Bay 5',
    published: true, bayId: null, roleForShift: 'Bay tech',
    status: 'open', breakMinutes: 30,
  });

  // --- Future week (weekOffset 2) — draft schedule, techs + key staff ---
  for (let d = 0; d < 5; d++) {
    addShift('t_marcus', 2, d, '08:00', '17:00', 'Bay tech', 'b_3', '', 'scheduled');
    addShift('t_devon',  2, d, '08:00', '17:00', 'Bay tech', 'b_1', '', 'scheduled');
    addShift('t_chris',  2, d, '08:00', '17:00', 'Bay tech', 'b_4', '', 'scheduled');
    addShift('t_tyler',  2, d, '09:00', '16:00', 'Bay tech', 'b_2', '', 'scheduled');
    addShift('e_sara',   2, d, '07:30', '17:30', 'Service advisor', null, '', 'scheduled');
    addShift('e_omar',   2, d, '07:30', '17:00', 'Manager on duty', null, '', 'scheduled');
    addShift('e_dana',   2, d, '08:00', '17:00', 'Inventory', null, '', 'scheduled');
  }

  db.saveShifts(shifts);

  // Shift trade request — Tyler wants to trade his Thu this week with Devon
  const tylerThuShift = shifts.find((s) => s.employeeId === 't_tyler' && s.date === shiftDate(0, 3));
  const devonThuShift = shifts.find((s) => s.employeeId === 't_devon' && s.date === shiftDate(0, 3));
  db.saveShiftTradeRequests([
    {
      id: 'str_1', type: 'trade', status: 'pending',
      requesterEmployeeId: 't_tyler',
      originalShiftId: tylerThuShift?.id || null,
      requestedWithEmployeeId: 't_devon',
      targetShiftId: devonThuShift?.id || null,
      offeredToEmployeeId: null,
      reason: 'Dentist appointment — need to swap Thursday shifts with Devon.',
      managerNote: '', createdAt: daysAgoISO(1),
    },
  ]);

  // Mark current and next week as published so the status badge shows green
  db.saveScheduleWeeks([
    { weekStart: weekStart(0), status: 'published', publishedAt: daysAgoISO(3), lockedAt: null, reopenedAt: null },
    { weekStart: weekStart(1), status: 'published', publishedAt: daysAgoISO(1), lockedAt: null, reopenedAt: null },
  ]);

  // ---- PTO / time-off requests (TeamOps Phase 2) ----
  db.savePtoRequests([
    // Tyler: pending — Tuesday of current week (no shift seeded for that day)
    { id: 'pto_1', employeeId: 't_tyler', type: 'pto', status: 'pending', startDate: shiftDate(0, 1), endDate: shiftDate(0, 1), hours: 8, reason: 'Doctor appointment', managerNote: '', createdAt: daysAgoISO(2) },
    // Devon: approved sick day — last week Wednesday
    { id: 'pto_2', employeeId: 't_devon', type: 'sick', status: 'approved', startDate: shiftDate(-1, 2), endDate: shiftDate(-1, 2), hours: 8, reason: 'Flu', managerNote: 'Feel better.', createdAt: daysAgoISO(9) },
    // Marcus: approved PTO — next week Friday
    { id: 'pto_3', employeeId: 't_marcus', type: 'pto', status: 'approved', startDate: shiftDate(1, 4), endDate: shiftDate(1, 4), hours: 8, reason: 'Family event', managerNote: 'Approved — coverage confirmed.', createdAt: daysAgoISO(5) },
    // Chris: denied unpaid — yesterday
    { id: 'pto_4', employeeId: 't_chris', type: 'unpaid', status: 'denied', startDate: daysAgoISO(1).slice(0, 10), endDate: daysAgoISO(1).slice(0, 10), hours: 8, reason: 'Personal', managerNote: 'Too short notice — let\'s find another day.', createdAt: daysAgoISO(2) },
    // Robin: pending PTO — next week Thursday
    { id: 'pto_5', employeeId: 'e_robin', type: 'pto', status: 'pending', startDate: shiftDate(1, 3), endDate: shiftDate(1, 3), hours: 8, reason: 'Wedding', managerNote: '', createdAt: daysAgoISO(3) },
  ]);

  // ---- Employee documents placeholder (TeamOps Phase 2) — records only,
  // no real file storage/upload exists yet. ----
  db.saveEmployeeDocuments([
    { id: 'doc_1', employeeId: 't_marcus', name: 'Employment Agreement', type: 'employment_agreement', status: 'on_file', expiresAt: null, uploadedAt: daysAgoISO(900) },
    { id: 'doc_2', employeeId: 't_marcus', name: 'ASE Master Certification', type: 'certification', status: 'on_file', expiresAt: daysAgoISO(-200).slice(0, 10), uploadedAt: daysAgoISO(400) },
    { id: 'doc_3', employeeId: 't_devon', name: 'Employee Handbook Acknowledgement', type: 'handbook_acknowledgement', status: 'on_file', expiresAt: null, uploadedAt: daysAgoISO(540) },
    { id: 'doc_4', employeeId: 't_tyler', name: "Driver's License", type: 'drivers_license', status: 'expiring_soon', expiresAt: daysAgoISO(-25).slice(0, 10), uploadedAt: daysAgoISO(120) },
  ]);

  // ---- Team activity log (TeamOps Phase 2) — employee-lifecycle events,
  // separate from db.employeeActivity()'s RO-derived feed. ----
  db.saveTeamActivity([
    { id: 'tact_1', employeeId: 't_tyler', type: 'pto_requested', at: daysAgoISO(2), detail: 'Requested 16 hrs PTO' },
    { id: 'tact_2', employeeId: 't_devon', type: 'pto_approved', at: daysAgoISO(20), detail: 'Sick time approved' },
    { id: 'tact_3', employeeId: 't_chris', type: 'invite_sent', at: daysAgoISO(5), detail: 'Account invite sent to chris.b@autobookdemo.com' },
    { id: 'tact_4', employeeId: 't_marcus', type: 'role_changed', at: daysAgoISO(900), detail: 'Hired as Senior Technician' },
  ]);

  // ---- Time clock (TeamOps Scheduling Phase 2) — demo/placeholder punches
  // for today only; no real time-tracking compliance exists yet. ----
  db.saveTimeClockEntries([
    { id: 'tc_1', employeeId: 't_marcus', date: today, clockIn: todayISO(7, 58), breakStart: null, breakEnd: null, clockOut: null, status: 'clocked_in', totalHours: null },
    { id: 'tc_2', employeeId: 't_devon', date: today, clockIn: todayISO(8, 3), breakStart: todayISO(12, 0), breakEnd: null, clockOut: null, status: 'on_break', totalHours: null },
    { id: 'tc_3', employeeId: 't_tyler', date: today, clockIn: todayISO(7, 50), breakStart: todayISO(11, 30), breakEnd: todayISO(12, 0), clockOut: todayISO(16, 0), status: 'clocked_out', totalHours: 7.5 },
  ]);

  // ---- Team messaging placeholder (TeamOps Scheduling Phase 2) — logged
  // only, no real SMS/email/chat backend exists yet. ----
  db.saveTeamMessages([
    { id: 'tmsg_1', scope: 'all_scheduled', employeeId: null, subject: 'Reminder: shop closes early Friday', body: 'Heads up — we\'re closing at 3pm this Friday for the team meeting.', at: daysAgoISO(1), loggedOnly: true },
  ]);

  // ---- Weekly availability (TeamOps Scheduling Phase 2) — separate from
  // PTO: this is an employee's standing "I generally can't work this day"
  // pattern, not a dated time-off request. dayOfWeek: 0=Sun..6=Sat. Only
  // unavailable days are seeded — any day not listed here is assumed
  // available (so most employees need zero rows).
  db.saveAvailability([
    { id: 'avail_1', employeeId: 't_tyler', dayOfWeek: 0, available: false, note: 'Part-time — weekends off' },
    { id: 'avail_2', employeeId: 't_tyler', dayOfWeek: 6, available: false, note: 'Part-time — weekends off' },
    { id: 'avail_3', employeeId: 'e_sara', dayOfWeek: 1, available: false, note: 'School pickup Mondays' },
  ]);

  // ---- Shift templates placeholder (TeamOps Scheduling Phase 2) — real
  // records, applied by the Shift Editor's "Apply Template" picker; saving
  // one from an existing shift is also real. No recurrence engine yet. ----
  db.saveScheduleTemplates([
    { id: 'tpl_bay_open', name: 'Bay Tech — Open', roleForShift: 'Bay tech', start: '08:00', end: '17:00', breakMinutes: 30, bayId: null },
    { id: 'tpl_front_desk', name: 'Front Desk — Full Day', roleForShift: 'Front desk', start: '08:00', end: '17:00', breakMinutes: 30, bayId: null },
    { id: 'tpl_half_day', name: 'Half-Day Shift', roleForShift: 'Bay tech', start: '08:00', end: '13:00', breakMinutes: 0, bayId: null },
  ]);

  // ---- InventoryOps (multi-location inventory / order management
  // foundation). `loc_main` is intentionally NOT a stock-holding row in
  // inventoryLocationStock — it's a read-through alias for the existing
  // part.qtyOnHand/db.adjustPartQty system (Phase-1 single-location
  // behavior), so nothing about POS/RO part usage changes. Every OTHER
  // location holds its own real stock rows. ----
  db.saveInventoryLocations([
    { id: 'loc_main', name: 'Main Shop', type: 'shop', isPlaceholder: false },
    { id: 'loc_parts_room', name: 'Parts Room', type: 'stockroom', isPlaceholder: false },
    { id: 'loc_bay1', name: 'Bay 1 Cart', type: 'bay_cart', isPlaceholder: false },
    { id: 'loc_bay2', name: 'Bay 2 Cart', type: 'bay_cart', isPlaceholder: false },
    { id: 'loc_truck', name: 'Service Truck', type: 'mobile', isPlaceholder: false },
    { id: 'loc_warehouse', name: 'Warehouse', type: 'warehouse', isPlaceholder: false },
    { id: 'loc_3pl', name: '3PL Fulfillment', type: '3pl', isPlaceholder: true },
    { id: 'loc_dropship', name: 'Dropship', type: 'dropship', isPlaceholder: true },
    { id: 'loc_fba', name: 'FBA / Marketplace', type: 'marketplace', isPlaceholder: true },
  ]);

  db.saveInventoryLocationStock([
    { id: 'stk_1', partId: 'p_5qtsyn', locationId: 'loc_warehouse', availableQty: 24, reservedQty: 0, onOrderQty: 0, damagedQty: 0, quarantinedQty: 0 },
    { id: 'stk_2', partId: 'p_oilfilter', locationId: 'loc_warehouse', availableQty: 30, reservedQty: 0, onOrderQty: 0, damagedQty: 0, quarantinedQty: 0 },
    { id: 'stk_3', partId: 'p_pads_front', locationId: 'loc_warehouse', availableQty: 6, reservedQty: 0, onOrderQty: 12, damagedQty: 0, quarantinedQty: 0 },
    { id: 'stk_4', partId: 'p_wipers', locationId: 'loc_parts_room', availableQty: 8, reservedQty: 0, onOrderQty: 0, damagedQty: 0, quarantinedQty: 0 },
    { id: 'stk_5', partId: 'p_oilfilter', locationId: 'loc_bay1', availableQty: 4, reservedQty: 0, onOrderQty: 0, damagedQty: 0, quarantinedQty: 0 },
    { id: 'stk_6', partId: 'p_battery', locationId: 'loc_truck', availableQty: 1, reservedQty: 0, onOrderQty: 0, damagedQty: 0, quarantinedQty: 1 },
  ]);

  db.saveSuppliers([
    { id: 'sup_napa', name: 'NAPA', contact: 'Will Reyes', email: 'orders@napa-demo.com', phone: '555-700-1001', leadTimeDays: 2, minimumOrder: 100, paymentTerms: 'Net 30', preferred: true, partsSupplied: ['p_oilfilter', 'p_5qtsyn', 'p_cabinfilter', 'p_engfilter', 'p_coolant', 'p_thermostat', 'p_brakefluid', 'p_transfluid'] },
    { id: 'sup_oreilly', name: "O'Reilly", contact: 'Dana Pruitt', email: 'shop-orders@oreilly-demo.com', phone: '555-700-1002', leadTimeDays: 1, minimumOrder: 50, paymentTerms: 'Net 15', preferred: true, partsSupplied: ['p_pads_front', 'p_pads_rear', 'p_rotors', 'p_serpentine', 'p_lugnuts', 'p_tirevalve'] },
    { id: 'sup_autozone', name: 'AutoZone', contact: 'Marcus Lee', email: 'commercial@autozone-demo.com', phone: '555-700-1003', leadTimeDays: 1, minimumOrder: 0, paymentTerms: 'Net 15', preferred: false, partsSupplied: ['p_refrigerant', 'p_sparkplugs', 'p_oxsensor', 'p_headlight'] },
    { id: 'sup_interstate', name: 'Interstate', contact: 'Robin Cho', email: 'fleet@interstate-demo.com', phone: '555-700-1004', leadTimeDays: 3, minimumOrder: 200, paymentTerms: 'Net 30', preferred: false, partsSupplied: ['p_battery'] },
  ]);

  // Real channels (computed from existing RO/POS/Quote data elsewhere) +
  // explicit future-channel placeholders, per CLAUDE.md "no external
  // marketplace APIs yet."
  db.saveInventoryChannels([
    { id: 'chan_ro', name: 'Repair Orders', isPlaceholder: false },
    { id: 'chan_pos', name: 'POS / Counter Sales', isPlaceholder: false },
    { id: 'chan_quotes', name: 'Quotes', isPlaceholder: false },
    { id: 'chan_online', name: 'Online Store', isPlaceholder: true },
    { id: 'chan_marketplace', name: 'Marketplace', isPlaceholder: true },
    { id: 'chan_wholesale', name: 'Wholesale / Fleet', isPlaceholder: true },
    { id: 'chan_dropship', name: 'Supplier Dropship', isPlaceholder: true },
  ]);

  db.savePurchaseOrders([
    { id: 'po_1', number: 'PO-1001', supplierId: 'sup_oreilly', status: 'open', destinationLocationId: 'loc_warehouse', expectedDate: daysAgoISO(-3).slice(0, 10), notes: 'Restocking front brake pads — running low.', createdAt: daysAgoISO(2) },
    { id: 'po_2', number: 'PO-1000', supplierId: 'sup_napa', status: 'closed', destinationLocationId: 'loc_warehouse', expectedDate: daysAgoISO(5).slice(0, 10), notes: '', createdAt: daysAgoISO(10) },
  ]);
  db.savePurchaseOrderItems([
    { id: 'poi_1', poId: 'po_1', partId: 'p_pads_front', qtyOrdered: 12, qtyReceived: 0, unitCost: 28, backordered: 0 },
    { id: 'poi_2', poId: 'po_1', partId: 'p_rotors', qtyOrdered: 6, qtyReceived: 0, unitCost: 45, backordered: 0 },
    { id: 'poi_3', poId: 'po_2', partId: 'p_5qtsyn', qtyOrdered: 12, qtyReceived: 12, unitCost: 18, backordered: 0 },
    { id: 'poi_4', poId: 'po_2', partId: 'p_oilfilter', qtyOrdered: 20, qtyReceived: 20, unitCost: 4.5, backordered: 0 },
  ]);

  db.saveInventoryTransfers([
    { id: 'xfer_1', number: 'XFER-1', sourceLocationId: 'loc_warehouse', destinationLocationId: 'loc_bay1', status: 'received', notes: 'Restocked Bay 1 cart.', createdAt: daysAgoISO(4), receivedAt: daysAgoISO(3),
      items: [{ partId: 'p_oilfilter', qty: 4 }] },
  ]);

  db.saveReturns([
    { id: 'ret_1', number: 'RET-1', type: 'customer_return', status: 'posted', partId: 'p_wipers', qty: 1, locationId: 'loc_parts_room', disposition: 'return_to_stock', reason: 'Wrong size purchased at counter.', customerId: 'c_steve', createdAt: daysAgoISO(6) },
  ]);

  db.saveCycleCounts([
    { id: 'cc_1', number: 'CC-1', locationId: 'loc_warehouse', status: 'posted', createdAt: daysAgoISO(14), postedAt: daysAgoISO(14) },
  ]);
  db.saveCycleCountItems([
    { id: 'cci_1', countId: 'cc_1', partId: 'p_5qtsyn', expectedQty: 26, countedQty: 24, varianceReason: 'Two units used off-ledger during a rush job.' },
  ]);

  // Seed transaction history explaining the above (and a couple of ordinary
  // RO/POS usage entries) — the ledger should always explain *why* a number
  // moved, never leave a silent gap.
  db.saveInventoryTransactions([
    { id: 'itx_1', date: daysAgoISO(10), partId: 'p_5qtsyn', locationId: 'loc_warehouse', type: 'receive_po', quantityChange: 12, source: 'purchase_order', referenceId: 'po_2', notes: 'Received PO-1000' },
    { id: 'itx_2', date: daysAgoISO(10), partId: 'p_oilfilter', locationId: 'loc_warehouse', type: 'receive_po', quantityChange: 20, source: 'purchase_order', referenceId: 'po_2', notes: 'Received PO-1000' },
    { id: 'itx_3', date: daysAgoISO(4), partId: 'p_oilfilter', locationId: 'loc_warehouse', type: 'transfer_out', quantityChange: -4, source: 'transfer', referenceId: 'xfer_1', notes: 'Transfer to Bay 1 Cart' },
    { id: 'itx_4', date: daysAgoISO(3), partId: 'p_oilfilter', locationId: 'loc_bay1', type: 'transfer_in', quantityChange: 4, source: 'transfer', referenceId: 'xfer_1', notes: 'Received from Warehouse' },
    { id: 'itx_5', date: daysAgoISO(6), partId: 'p_wipers', locationId: 'loc_parts_room', type: 'return_to_stock', quantityChange: 1, source: 'return', referenceId: 'ret_1', notes: 'Customer return — wrong size' },
    { id: 'itx_6', date: daysAgoISO(14), partId: 'p_5qtsyn', locationId: 'loc_warehouse', type: 'cycle_count_adjustment', quantityChange: -2, source: 'cycle_count', referenceId: 'cc_1', notes: 'Cycle count variance posted' },
  ]);

  // ---- Services (§12, 15+) ----
  const services = [
    { id: 's_oil', name: 'Oil Change', category: 'Maintenance', basePrice: 59.99, baseHours: 0.5, durationMin: 45 },
    { id: 's_rotate', name: 'Tire Rotation', category: 'Tires', basePrice: 29.99, baseHours: 0.5, durationMin: 30 },
    { id: 's_brake_insp', name: 'Brake Inspection', category: 'Brakes', basePrice: 0, baseHours: 0.5, durationMin: 30 },
    { id: 's_brake_pad', name: 'Brake Pad Replacement', category: 'Brakes', basePrice: 199.99, baseHours: 1.5, durationMin: 90 },
    { id: 's_brake_full', name: 'Full Brake Service', category: 'Brakes', basePrice: 389.99, baseHours: 3, durationMin: 180 },
    { id: 's_ac_diag', name: 'AC Diagnostic/Repair', category: 'AC', basePrice: 89.99, baseHours: 1, durationMin: 60 },
    { id: 's_ac_recharge', name: 'AC Recharge', category: 'AC', basePrice: 149.99, baseHours: 1.5, durationMin: 90 },
    { id: 's_tuneup', name: 'Tune-up', category: 'Maintenance', basePrice: 189.99, baseHours: 1.5, durationMin: 90 },
    { id: 's_trans', name: 'Transmission Service', category: 'Drivetrain', basePrice: 249.99, baseHours: 2, durationMin: 120 },
    { id: 's_eng_diag', name: 'Engine Diagnostic', category: 'Diagnostic', basePrice: 99.99, baseHours: 1, durationMin: 60 },
    { id: 's_timing', name: 'Timing Belt', category: 'Drivetrain', basePrice: 599.99, baseHours: 4, durationMin: 240 },
    { id: 's_battery', name: 'Battery', category: 'Electrical', basePrice: 179.99, baseHours: 0.5, durationMin: 30 },
    { id: 's_align', name: 'Alignment', category: 'Tires', basePrice: 89.99, baseHours: 1, durationMin: 60 },
    { id: 's_mpi', name: 'Multi-Point Inspection', category: 'Inspection', basePrice: 0, baseHours: 0.75, durationMin: 45 },
    { id: 's_coolant', name: 'Coolant Flush', category: 'Maintenance', basePrice: 119.99, baseHours: 1, durationMin: 60 },
    { id: 's_plugs', name: 'Spark Plugs', category: 'Engine', basePrice: 159.99, baseHours: 1.5, durationMin: 90 },
    { id: 's_tires', name: 'Tires (mount/balance)', category: 'Tires', basePrice: 129.99, baseHours: 1, durationMin: 60 },
  ];
  db.saveServices(services);

  // ---- Parts (~22, 3 below/at reorder, 1 out-of-stock, 1 discontinued) ----
  const _now = new Date().toISOString();
  const _d = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const parts = [
    { id: 'p_oilfilter',   name: 'Oil Filter',               sku: 'OF-100',       category: 'Filters',     brand: 'Wix',          cost: 4.5,  price: 12.99,  qtyOnHand: 40, reorderPoint: 10, vendor: 'NAPA',      notes: 'Change with every oil service.',            status: 'active', updatedAt: _d(2), primaryLocation: 'loc_main' },
    { id: 'p_5qtsyn',      name: '5qt Synthetic Oil',         sku: 'OIL-5QT-SYN', category: 'Fluids',      brand: 'Mobil 1',      cost: 18,   price: 39.99,  qtyOnHand: 30, reorderPoint:  8, vendor: 'NAPA',      notes: '5W-30 synthetic — best seller.',             status: 'active', updatedAt: _d(1), primaryLocation: 'loc_main' },
    { id: 'p_pads_front',  name: 'Brake Pads — Front Set',    sku: 'BP-FRT-01',   category: 'Brakes',      brand: 'Monroe',       cost: 28,   price: 59.99,  qtyOnHand:  2, reorderPoint:  6, vendor: "O'Reilly",  notes: 'Semi-metallic — good for daily drivers.',   status: 'active', updatedAt: _d(0), primaryLocation: 'loc_main' },
    { id: 'p_pads_rear',   name: 'Brake Pads — Rear Set',     sku: 'BP-RR-01',    category: 'Brakes',      brand: 'Monroe',       cost: 24,   price: 54.99,  qtyOnHand:  9, reorderPoint:  6, vendor: "O'Reilly",  notes: '',                                          status: 'active', updatedAt: _d(5), primaryLocation: 'loc_main' },
    { id: 'p_rotors',      name: 'Rotors (pair)',              sku: 'ROT-02',      category: 'Brakes',      brand: 'ACDelco',      cost: 45,   price: 99.99,  qtyOnHand:  8, reorderPoint:  4, vendor: "O'Reilly",  notes: '',                                          status: 'active', updatedAt: _d(7), primaryLocation: 'loc_main' },
    { id: 'p_refrigerant', name: 'AC Refrigerant (R134a)',     sku: 'AC-R134',     category: 'AC',          brand: 'Interdynamics',cost: 12,   price: 29.99,  qtyOnHand: 15, reorderPoint:  5, vendor: 'AutoZone',  notes: 'R-134a only — do not mix refrigerants.',    status: 'active', updatedAt: _d(3), primaryLocation: 'loc_main' },
    { id: 'p_cabinfilter', name: 'Cabin Air Filter',           sku: 'CF-200',      category: 'Filters',     brand: 'Bosch',        cost: 8,    price: 24.99,  qtyOnHand: 20, reorderPoint:  6, vendor: 'NAPA',      notes: '',                                          status: 'active', updatedAt: _d(4), primaryLocation: 'loc_main' },
    { id: 'p_engfilter',   name: 'Engine Air Filter',          sku: 'EF-300',      category: 'Filters',     brand: 'Fram',         cost: 9,    price: 27.99,  qtyOnHand: 18, reorderPoint:  6, vendor: 'NAPA',      notes: '',                                          status: 'active', updatedAt: _d(6), primaryLocation: 'loc_main' },
    { id: 'p_sparkplugs',  name: 'Spark Plugs (set of 4)',     sku: 'SP-400',      category: 'Engine',      brand: 'Denso',        cost: 16,   price: 44.99,  qtyOnHand: 12, reorderPoint:  4, vendor: 'AutoZone',  notes: 'Replace every 30k mi per OEM spec.',        status: 'active', updatedAt: _d(8), primaryLocation: 'loc_main' },
    { id: 'p_battery',     name: 'Battery (Group 35)',          sku: 'BAT-35',      category: 'Electrical',  brand: 'Interstate',   cost: 70,   price: 139.99, qtyOnHand:  7, reorderPoint:  3, vendor: 'Interstate',notes: 'Core charge $18 — return old battery.',     status: 'active', updatedAt: _d(2), primaryLocation: 'loc_main' },
    { id: 'p_coolant',     name: 'Coolant (1gal)',              sku: 'CO-500',      category: 'Fluids',      brand: 'Prestone',     cost: 9,    price: 21.99,  qtyOnHand: 25, reorderPoint:  6, vendor: 'NAPA',      notes: 'Green universal — check compatibility.',    status: 'active', updatedAt: _d(3), primaryLocation: 'loc_main' },
    { id: 'p_serpentine',  name: 'Serpentine Belt',             sku: 'BLT-600',     category: 'Engine',      brand: 'Gates',        cost: 14,   price: 39.99,  qtyOnHand:  1, reorderPoint:  4, vendor: "O'Reilly",  notes: '⚠ Critical — inspect every 60k mi.',       status: 'active', updatedAt: _d(0), primaryLocation: 'loc_main' },
    { id: 'p_wipers',      name: 'Wiper Blades (pair)',         sku: 'WB-700',      category: 'Exterior',    brand: 'Rain-X',       cost: 6,    price: 19.99,  qtyOnHand: 22, reorderPoint:  8, vendor: 'AutoZone',  notes: '',                                          status: 'active', updatedAt: _d(5), primaryLocation: 'loc_main' },
    { id: 'p_transfluid',  name: 'Transmission Fluid (qt)',     sku: 'TF-800',      category: 'Fluids',      brand: 'Valvoline',    cost: 7,    price: 16.99,  qtyOnHand: 16, reorderPoint:  6, vendor: 'NAPA',      notes: 'Multi-vehicle ATF.',                        status: 'active', updatedAt: _d(4), primaryLocation: 'loc_main' },
    { id: 'p_oxsensor',    name: 'O2 Sensor',                   sku: 'OX-900',      category: 'Electrical',  brand: 'Bosch',        cost: 32,   price: 79.99,  qtyOnHand:  6, reorderPoint:  3, vendor: 'AutoZone',  notes: 'Downstream sensor — fits most models.',     status: 'active', updatedAt: _d(9), primaryLocation: 'loc_main' },
    { id: 'p_brakefluid',  name: 'Brake Fluid (qt)',             sku: 'BF-1000',     category: 'Fluids',      brand: 'Prestone',     cost: 5,    price: 13.99,  qtyOnHand: 14, reorderPoint:  5, vendor: 'NAPA',      notes: 'DOT 3 — check compatibility before use.',  status: 'active', updatedAt: _d(6), primaryLocation: 'loc_main' },
    { id: 'p_lugnuts',     name: 'Lug Nuts (set)',               sku: 'LN-1100',     category: 'Tires',       brand: 'Dorman',       cost: 6,    price: 14.99,  qtyOnHand: 20, reorderPoint:  6, vendor: "O'Reilly",  notes: '',                                          status: 'active', updatedAt: _d(7), primaryLocation: 'loc_main' },
    { id: 'p_thermostat',  name: 'Thermostat',                   sku: 'TH-1200',     category: 'Engine',      brand: 'Gates',        cost: 11,   price: 29.99,  qtyOnHand:  9, reorderPoint:  4, vendor: 'NAPA',      notes: '',                                          status: 'active', updatedAt: _d(8), primaryLocation: 'loc_main' },
    { id: 'p_headlight',   name: 'Headlight Bulb',               sku: 'HL-1300',     category: 'Electrical',  brand: 'Sylvania',     cost: 5,    price: 14.99,  qtyOnHand: 17, reorderPoint:  5, vendor: 'AutoZone',  notes: '',                                          status: 'active', updatedAt: _d(3), primaryLocation: 'loc_main' },
    { id: 'p_tirevalve',   name: 'Tire Valve Stems (set)',        sku: 'TV-1400',     category: 'Tires',       brand: 'JACO',         cost: 3,    price: 8.99,   qtyOnHand: 30, reorderPoint:  8, vendor: "O'Reilly",  notes: '',                                          status: 'active', updatedAt: _d(5), primaryLocation: 'loc_main' },
    // Out-of-stock demo part
    { id: 'p_startermotor',name: 'Starter Motor',                sku: 'SM-2000',     category: 'Electrical',  brand: 'ACDelco',      cost: 85,   price: 189.99, qtyOnHand:  0, reorderPoint:  2, vendor: 'ACDelco',   notes: 'High demand — keep 2 on hand.',             status: 'active', updatedAt: _d(1), primaryLocation: 'loc_main' },
    // Discontinued demo part
    { id: 'p_fuelpump',    name: 'Fuel Pump (universal)',         sku: 'FP-2100',     category: 'Fuel System', brand: 'Delphi',       cost: 55,   price: 129.99, qtyOnHand:  3, reorderPoint:  2, vendor: 'Delphi',    notes: 'Discontinued — use updated PN when available.', status: 'discontinued', updatedAt: _d(14), primaryLocation: 'loc_main' },
  ];
  // reorderQty (InventoryOps) — additive, no existing field renamed/removed.
  parts.forEach((p) => { if (p.reorderQty == null) p.reorderQty = Math.max(p.reorderPoint * 3, 4); });
  db.saveParts(parts);
  // p_pads_front (2 ≤ 6) and p_serpentine (1 ≤ 4) are below reorder.

  // ---- Customers + Vehicles ----
  const customers = [
    { id: 'c_maria', firstName: 'Maria', lastName: 'J.', phone: '555-201-1001', email: 'maria.j@example.com', createdAt: daysAgoISO(40) },
    { id: 'c_david', firstName: 'David', lastName: 'M.', phone: '555-201-1002', email: 'david.m@example.com', createdAt: daysAgoISO(60) },
    { id: 'c_james', firstName: 'James', lastName: 'M.', phone: '555-201-1003', email: 'james.m@example.com', createdAt: daysAgoISO(30) },
    { id: 'c_chrisb', firstName: 'Chris', lastName: 'B.', phone: '555-201-1004', email: 'chris.b@example.com', createdAt: daysAgoISO(90) },
    { id: 'c_amanda', firstName: 'Amanda', lastName: 'L.', phone: '555-201-1005', email: 'amanda.l@example.com', createdAt: daysAgoISO(20) },
    { id: 'c_robert', firstName: 'Robert', lastName: 'K.', phone: '555-201-1006', email: 'robert.k@example.com', createdAt: daysAgoISO(75) },
    { id: 'c_tom', firstName: 'Tom', lastName: 'W.', phone: '555-201-1007', email: 'tom.w@example.com', createdAt: daysAgoISO(120) },
    { id: 'c_patricia', firstName: 'Patricia', lastName: 'G.', phone: '555-201-1008', email: 'patricia.g@example.com', createdAt: daysAgoISO(15) },
    { id: 'c_linda', firstName: 'Linda', lastName: 'P.', phone: '555-201-1009', email: 'linda.p@example.com', createdAt: daysAgoISO(200), doNotContact: true },
    { id: 'c_steve', firstName: 'Steve', lastName: 'H.', phone: '555-201-1010', email: 'steve.h@example.com', createdAt: daysAgoISO(10) },
    { id: 'c_nina', firstName: 'Nina', lastName: 'F.', phone: '555-201-1011', email: 'nina.f@example.com', createdAt: daysAgoISO(5) },
  ];
  db.saveCustomers(customers);

  const vehicles = [
    { id: 'v_civic', customerId: 'c_maria', year: 2020, make: 'Honda', model: 'Civic', mileage: 38500, vin: '1HGCM82633A004352', color: 'Blue' },
    { id: 'v_camry', customerId: 'c_david', year: 2019, make: 'Toyota', model: 'Camry', mileage: 51200, vin: '4T1BF1FK5HU123456', color: 'Silver' },
    { id: 'v_f150', customerId: 'c_james', year: 2019, make: 'Ford', model: 'F-150', mileage: 62400, vin: '1FTEW1EP3KFA12345', color: 'White' },
    { id: 'v_tahoe', customerId: 'c_chrisb', year: 2018, make: 'Chevy', model: 'Tahoe', mileage: 77100, vin: '1GNSKBKC8JR123456', color: 'Black' },
    { id: 'v_330i', customerId: 'c_amanda', year: 2021, make: 'BMW', model: '330i', mileage: 22300, vin: 'WBA5R1C50LFH12345', color: 'Gray' },
    { id: 'v_ram', customerId: 'c_robert', year: 2020, make: 'Dodge', model: 'Ram', mileage: 44800, vin: '1C6RR7LT0LS123456', color: 'Red' },
    { id: 'v_accord', customerId: 'c_tom', year: 2018, make: 'Honda', model: 'Accord', mileage: 81200, vin: '1HGCV1F34JA123456', color: 'Silver' },
    { id: 'v_altima', customerId: 'c_patricia', year: 2017, make: 'Nissan', model: 'Altima', mileage: 92100, vin: '1N4AL3AP8HC123456', color: 'White' },
    { id: 'v_subaru', customerId: 'c_linda', year: 2016, make: 'Subaru', model: 'Outback', mileage: 105300, vin: '4S4BSANC0G3123456', color: 'Green' },
    { id: 'v_wrangler', customerId: 'c_steve', year: 2019, make: 'Jeep', model: 'Wrangler', mileage: 39900, vin: '1C4HJXDG3KW123456', color: 'Orange' },
    { id: 'v_elantra', customerId: 'c_nina', year: 2020, make: 'Hyundai', model: 'Elantra', mileage: 28700, vin: '5NPD84LF0LH123456', color: 'Black' },
  ];
  db.saveVehicles(vehicles);

  // ---- Repair Orders ----
  // Helper to build line items + recalc totals (mirrors util.recalcRO's formula
  // inline since lib/util.js doesn't exist yet — recomputed here for seed accuracy).
  const taxRate = 0.0675;
  const laborRate = 120;
  function lineTotal(line) {
    if (line.type === 'labor') return round2(line.hours * laborRate);
    return round2(line.qty * line.unitPrice);
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function buildRO(base, lines, discount = 0) {
    const lineItems = lines.map((l, i) => ({ id: `${base.id}_li${i}`, ...l, total: lineTotal(l) }));
    const subtotal = round2(lineItems.reduce((s, l) => s + l.total, 0));
    const taxable = Math.max(subtotal - discount, 0);
    const tax = round2(taxable * taxRate);
    const total = round2(taxable + tax);
    const estHours = lineItems.filter(l => l.type === 'service' || l.type === 'labor').reduce((s, l) => s + (l.hours || 0), 0);
    return {
      ...base,
      lineItems,
      discount,
      subtotal,
      tax,
      total,
      estHours,
      billedHours: base.billedHours != null ? base.billedHours : estHours,
      laborRate,
    };
  }

  const jobs = [
    // 1) RO-1040 — Maria J., Honda Civic, Oil Change — waiting, Bay 2 / Tyler
    buildRO({
      id: 'j_1040', ro: 'RO-1040', customerId: 'c_maria', vehicleId: 'v_civic',
      status: 'waiting', source: 'booking', techId: 't_tyler', bayId: 'b_2',
      advisorId: 'e_sara', createdById: 'e_sara', confirmedById: 'e_jeff',
      scheduledDate: new Date().toISOString().slice(0, 10), scheduledTime: '08:00',
      visitType: 'wait', checkedInAt: todayISO(8, 0), createdAt: todayISO(7, 45),
    }, [
      { type: 'service', refId: 's_oil', name: 'Oil Change', qty: 1, unitPrice: 59.99, hours: 0.5 },
    ]),

    // 2) RO-1041 — David M., Toyota Camry, Tune-up — in_progress, Bay 3 / Marcus, late 40m
    buildRO({
      id: 'j_1041', ro: 'RO-1041', customerId: 'c_david', vehicleId: 'v_camry',
      status: 'in_progress', stage: 'repair', source: 'booking', techId: 't_marcus', bayId: 'b_3',
      scheduledDate: new Date().toISOString().slice(0, 10), scheduledTime: '09:30',
      visitType: 'drop_off', checkedInAt: todayISO(9, 30), startedAt: todayISO(9, 40),
      createdAt: todayISO(9, 15), billedHours: 2.17,
    }, [
      { type: 'service', refId: 's_tuneup', name: 'Tune-up', qty: 1, unitPrice: 189.99, hours: 1.5 },
      { type: 'part', refId: 'p_sparkplugs', name: 'Spark Plugs (set of 4)', qty: 1, unitPrice: 44.99 },
    ]),

    // 3) RO-1042 — James M., Ford F-150, Brake Pad Replacement — on_hold (parts), approval pending
    buildRO({
      id: 'j_1042', ro: 'RO-1042', customerId: 'c_james', vehicleId: 'v_f150',
      status: 'on_hold', holdReason: 'parts_ordered', approvalStatus: 'pending',
      source: 'booking', techId: null, bayId: null,
      scheduledDate: new Date().toISOString().slice(0, 10), scheduledTime: '11:00',
      visitType: 'drop_off', checkedInAt: todayISO(11, 0), createdAt: todayISO(10, 50),
      billedHours: 0.8, internalNotes: 'Waiting on front brake pads — backordered.',
    }, [
      { type: 'service', refId: 's_brake_pad', name: 'Brake Pad Replacement', qty: 1, unitPrice: 199.99, hours: 1.5 },
      { type: 'part', refId: 'p_pads_front', name: 'Brake Pads — Front Set', qty: 1, unitPrice: 59.99 },
    ]),

    // 4) RO-1043 — Chris B., Chevy Tahoe, AC Diagnostic/Repair — in_progress, Bay 1 / Devon
    buildRO({
      id: 'j_1043', ro: 'RO-1043', customerId: 'c_chrisb', vehicleId: 'v_tahoe',
      status: 'in_progress', stage: 'inspection', source: 'walk_in', techId: 't_devon', bayId: 'b_1',
      scheduledDate: new Date().toISOString().slice(0, 10), scheduledTime: '13:30',
      visitType: 'drop_off', checkedInAt: todayISO(13, 30), startedAt: todayISO(13, 35),
      createdAt: todayISO(13, 20), billedHours: 1.0,
    }, [
      { type: 'service', refId: 's_ac_diag', name: 'AC Diagnostic/Repair', qty: 1, unitPrice: 89.99, hours: 1 },
      { type: 'part', refId: 'p_refrigerant', name: 'AC Refrigerant (R134a)', qty: 1, unitPrice: 29.99 },
    ]),

    // 5) ready — Amanda L., BMW 330i, Inspection — not invoiced
    buildRO({
      id: 'j_1044', ro: 'RO-1044', customerId: 'c_amanda', vehicleId: 'v_330i',
      status: 'ready', source: 'booking', techId: 't_marcus', bayId: 'b_3',
      visitType: 'drop_off', checkedInAt: todayISO(9, 0), startedAt: todayISO(9, 5),
      completedAt: todayISO(13, 35), createdAt: todayISO(8, 50), billedHours: 2.75,
    }, [
      { type: 'service', refId: 's_mpi', name: 'Multi-Point Inspection', qty: 1, unitPrice: 0, hours: 0.75 },
      { type: 'labor', name: 'Diagnostic labor', qty: 1, unitPrice: 0, hours: 2 },
      { type: 'part', refId: 'p_cabinfilter', name: 'Cabin Air Filter', qty: 1, unitPrice: 24.99 },
    ]),

    // 6) ready — Robert K., Dodge Ram, Tires — not invoiced
    buildRO({
      id: 'j_1045', ro: 'RO-1045', customerId: 'c_robert', vehicleId: 'v_ram',
      status: 'ready', source: 'walk_in', techId: 't_devon', bayId: 'b_1',
      visitType: 'wait', checkedInAt: todayISO(10, 0), startedAt: todayISO(10, 5),
      completedAt: todayISO(13, 55), createdAt: todayISO(9, 55), billedHours: 1.0,
    }, [
      { type: 'service', refId: 's_tires', name: 'Tires (mount/balance, 4)', qty: 4, unitPrice: 129.99, hours: 1 },
    ]),

    // 7) comeback — Tom W., 2018 Honda Accord, opened today, status scheduled
    {
      id: 'j_1038', ro: 'RO-1038', customerId: 'c_tom', vehicleId: 'v_accord',
      status: 'scheduled', source: 'phone', techId: null, bayId: null,
      scheduledDate: new Date().toISOString().slice(0, 10), scheduledTime: '15:00',
      visitType: 'drop_off', createdAt: todayISO(8, 5), isComeback: true,
      lineItems: [], discount: 0, subtotal: 0, tax: 0, total: 0, estHours: 0, billedHours: 0, laborRate,
      notes: 'Same noise as last visit — possible comeback.',
    },
    // prior closed RO on the same Accord, 20 days ago, that makes #7 a comeback
    buildRO({
      id: 'j_0998', ro: 'RO-0998', customerId: 'c_tom', vehicleId: 'v_accord',
      status: 'closed', source: 'booking', techId: 't_tyler', bayId: 'b_2',
      visitType: 'drop_off', completedAt: daysAgoISO(9, 11, 0), createdAt: daysAgoISO(9, 9, 0),
      billedHours: 0.5,
    }, [
      { type: 'service', refId: 's_oil', name: 'Oil Change', qty: 1, unitPrice: 59.99, hours: 0.5 },
    ]),

    // 8) closed + invoiced + paid today — Patricia G., Nissan Altima, Timing Belt
    buildRO({
      id: 'j_1046', ro: 'RO-1046', customerId: 'c_patricia', vehicleId: 'v_altima',
      status: 'closed', source: 'booking', techId: 't_marcus', bayId: 'b_3',
      visitType: 'drop_off', completedAt: todayISO(11, 30), createdAt: todayISO(8, 0),
      billedHours: 4.0,
    }, [
      { type: 'service', refId: 's_timing', name: 'Timing Belt', qty: 1, unitPrice: 599.99, hours: 4 },
      { type: 'part', refId: 'p_serpentine', name: 'Serpentine Belt', qty: 1, unitPrice: 39.99 },
    ]),

    // 9) closed + invoiced + paid today — Linda P., Subaru Outback, Full Brake + AC Recharge
    buildRO({
      id: 'j_1047', ro: 'RO-1047', customerId: 'c_linda', vehicleId: 'v_subaru',
      status: 'closed', source: 'walk_in', techId: 't_devon', bayId: 'b_1',
      visitType: 'drop_off', completedAt: todayISO(12, 10), createdAt: todayISO(8, 30),
      billedHours: 4.5,
    }, [
      { type: 'service', refId: 's_brake_full', name: 'Full Brake Service', qty: 1, unitPrice: 389.99, hours: 3 },
      { type: 'service', refId: 's_ac_recharge', name: 'AC Recharge', qty: 1, unitPrice: 149.99, hours: 1.5 },
    ]),

    // 10) extra active job (created yesterday, still on premises today) — fills out WIP
    buildRO({
      id: 'j_1048', ro: 'RO-1048', customerId: 'c_steve', vehicleId: 'v_wrangler',
      status: 'waiting', source: 'walk_in', techId: null, bayId: null,
      visitType: 'drop_off', checkedInAt: daysAgoISO(1, 16, 0), createdAt: daysAgoISO(1, 15, 30),
    }, [
      { type: 'service', refId: 's_battery', name: 'Battery', qty: 1, unitPrice: 179.99, hours: 0.5 },
      { type: 'part', refId: 'p_battery', name: 'Battery (Group 35)', qty: 1, unitPrice: 139.99 },
    ]),

    // 11) extra active job (created yesterday, still in_progress today, also "late") — fills out WIP
    buildRO({
      id: 'j_1049', ro: 'RO-1049', customerId: 'c_nina', vehicleId: 'v_elantra',
      status: 'in_progress', stage: 'dvi', source: 'booking', techId: null, bayId: null,
      visitType: 'drop_off', checkedInAt: daysAgoISO(1, 14, 0), startedAt: daysAgoISO(1, 14, 10),
      createdAt: daysAgoISO(1, 13, 45), billedHours: 1.9,
    }, [
      { type: 'service', refId: 's_eng_diag', name: 'Engine Diagnostic', qty: 1, unitPrice: 99.99, hours: 1 },
    ]),
  ];

  // Tomorrow's bookings (§12: ~10 appts, ~39.5h estimated vs 32h capacity → over-capacity
  // alert + flag). Reuses existing customers/vehicles; hours-only labor lines are enough
  // to exercise tomorrowPreview()/the capacity flag without inventing new entities.
  const tomorrowDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();
  const tomorrowHours = [4, 4, 4, 4, 4, 4, 4, 4, 4, 3.5];
  const tomorrowCustomers = ['c_maria', 'c_david', 'c_james', 'c_chrisb', 'c_amanda', 'c_robert', 'c_tom', 'c_patricia', 'c_linda', 'c_steve'];
  const tomorrowVehicles = ['v_civic', 'v_camry', 'v_f150', 'v_tahoe', 'v_330i', 'v_ram', 'v_accord', 'v_altima', 'v_subaru', 'v_wrangler'];
  tomorrowHours.forEach((hours, i) => {
    jobs.push(buildRO({
      id: `j_tmrw_${i}`, ro: `RO-${2000 + i}`, customerId: tomorrowCustomers[i], vehicleId: tomorrowVehicles[i],
      status: 'scheduled', source: 'booking', techId: null, bayId: null,
      scheduledDate: tomorrowDate, scheduledTime: `${String(8 + i).padStart(2, '0')}:00`,
      visitType: 'drop_off', createdAt: daysAgoISO(2, 9, 0), billedHours: 0,
    }, [
      { type: 'labor', name: 'Scheduled labor', qty: 1, unitPrice: 0, hours },
    ]));
  });

  db.saveJobs(jobs);

  // ---- Invoices (4 today) ----
  const invoices = [
    {
      id: 'inv_1001', number: 'INV-1001', roId: 'j_1046', customerId: 'c_patricia', vehicleId: 'v_altima',
      lineItems: jobs.find(j => j.id === 'j_1046').lineItems,
      discount: 0, subtotal: jobs.find(j => j.id === 'j_1046').subtotal,
      tax: jobs.find(j => j.id === 'j_1046').tax, total: jobs.find(j => j.id === 'j_1046').total,
      status: 'paid',
      payments: [{ id: 'pay_1', amount: jobs.find(j => j.id === 'j_1046').total, method: 'card', date: todayISO(11, 35) }],
      amountPaid: jobs.find(j => j.id === 'j_1046').total, balance: 0,
      issuedAt: todayISO(11, 30), paidAt: todayISO(11, 35),
    },
    {
      id: 'inv_1002', number: 'INV-1002', roId: 'j_1047', customerId: 'c_linda', vehicleId: 'v_subaru',
      lineItems: jobs.find(j => j.id === 'j_1047').lineItems,
      discount: 0, subtotal: jobs.find(j => j.id === 'j_1047').subtotal,
      tax: jobs.find(j => j.id === 'j_1047').tax, total: jobs.find(j => j.id === 'j_1047').total,
      status: 'paid',
      payments: [{ id: 'pay_2', amount: jobs.find(j => j.id === 'j_1047').total, method: 'cash', date: todayISO(12, 15) }],
      amountPaid: jobs.find(j => j.id === 'j_1047').total, balance: 0,
      issuedAt: todayISO(12, 10), paidAt: todayISO(12, 15),
    },
    {
      id: 'inv_1003', number: 'INV-1003', roId: null, customerId: 'c_nina', vehicleId: 'v_elantra',
      lineItems: [
        { id: 'li_3a', type: 'service', refId: 's_tuneup', name: 'Tune-up', qty: 1, unitPrice: 189.99, hours: 1.5, total: 189.99 },
        { id: 'li_3b', type: 'service', refId: 's_align', name: 'Alignment', qty: 1, unitPrice: 89.99, hours: 1, total: 89.99 },
      ],
      discount: 0, subtotal: 279.98, tax: round2(279.98 * taxRate), total: round2(279.98 * (1 + taxRate)),
      status: 'sent', payments: [], amountPaid: 0, balance: round2(279.98 * (1 + taxRate)),
      issuedAt: todayISO(9, 0), dueAt: daysAgoISO(-14, 9, 0),
    },
    {
      id: 'inv_1004', number: 'INV-1004', roId: null, customerId: 'c_steve', vehicleId: 'v_wrangler',
      lineItems: [
        { id: 'li_4a', type: 'service', refId: 's_trans', name: 'Transmission Service', qty: 1, unitPrice: 249.99, hours: 2, total: 249.99 },
        { id: 'li_4b', type: 'service', refId: 's_coolant', name: 'Coolant Flush', qty: 1, unitPrice: 119.99, hours: 1, total: 119.99 },
      ],
      discount: 0, subtotal: 369.98, tax: round2(369.98 * taxRate), total: round2(369.98 * (1 + taxRate)),
      status: 'partial', payments: [{ id: 'pay_4', amount: 150, method: 'card', date: todayISO(10, 0) }],
      amountPaid: 150, balance: round2(round2(369.98 * (1 + taxRate)) - 150),
      issuedAt: todayISO(9, 30), dueAt: daysAgoISO(-14, 9, 30),
    },
    // Three intentionally overdue invoices (past due dates) so InvoiceOps's
    // receivables-aging buckets have real, non-zero data to show.
    {
      id: 'inv_1005', number: 'INV-1005', roId: null, customerId: 'c_maria', vehicleId: 'v_civic',
      lineItems: [{ id: 'li_5a', type: 'service', refId: 's_brakes', name: 'Brake Pad Replacement', qty: 1, unitPrice: 219.99, hours: 1.5, total: 219.99 }],
      discount: 0, subtotal: 219.99, tax: round2(219.99 * taxRate), total: round2(219.99 * (1 + taxRate)),
      status: 'sent', payments: [], amountPaid: 0, balance: round2(219.99 * (1 + taxRate)),
      issuedAt: daysAgoISO(10, 9, 0), dueAt: daysAgoISO(8, 9, 0),
    },
    {
      id: 'inv_1006', number: 'INV-1006', roId: null, customerId: 'c_david', vehicleId: 'v_camry',
      lineItems: [{ id: 'li_6a', type: 'service', refId: 's_tuneup', name: 'Tune-up', qty: 1, unitPrice: 189.99, hours: 1.5, total: 189.99 }],
      discount: 0, subtotal: 189.99, tax: round2(189.99 * taxRate), total: round2(189.99 * (1 + taxRate)),
      status: 'sent', payments: [], amountPaid: 0, balance: round2(189.99 * (1 + taxRate)),
      issuedAt: daysAgoISO(35, 9, 0), dueAt: daysAgoISO(21, 9, 0),
    },
    {
      id: 'inv_1007', number: 'INV-1007', roId: null, customerId: 'c_james', vehicleId: 'v_f150',
      lineItems: [{ id: 'li_7a', type: 'service', refId: 's_brakes', name: 'Brake Pad Replacement', qty: 1, unitPrice: 219.99, hours: 1.5, total: 219.99 }],
      discount: 0, subtotal: 219.99, tax: round2(219.99 * taxRate), total: round2(219.99 * (1 + taxRate)),
      status: 'sent', payments: [], amountPaid: 0, balance: round2(219.99 * (1 + taxRate)),
      issuedAt: daysAgoISO(70, 9, 0), dueAt: daysAgoISO(56, 9, 0),
    },
  ];
  db.saveInvoices(invoices);

  // link invoiceId back onto the closed/invoiced ROs
  jobs.find(j => j.id === 'j_1046').invoiceId = 'inv_1001';
  jobs.find(j => j.id === 'j_1047').invoiceId = 'inv_1002';
  db.saveJobs(jobs);

  // ---- InvoiceOps foundation (Items/Services catalog, Expenses, Credit
  // Notes/Refunds) — additive, separate from db.services() (the RO-specific
  // catalog) and from db.invoices() (never mutated by any of this). ----
  db.saveInvoiceItems([
    { id: 'fi_oil', name: 'Oil Change', type: 'labor', sku: 'LAB-OIL', defaultPrice: 59.99, defaultCost: 18, taxable: true, active: true, linkedInventoryItemId: null },
    { id: 'fi_brakepads', name: 'Brake Pad Set — Front', type: 'part', sku: 'p_pads_front', defaultPrice: 79.99, defaultCost: 38, taxable: true, active: true, linkedInventoryItemId: 'p_pads_front' },
    { id: 'fi_tire', name: 'Tire Mount & Balance', type: 'tire', sku: 'LAB-TIRE', defaultPrice: 24.99, defaultCost: 6, taxable: true, active: true, linkedInventoryItemId: null },
    { id: 'fi_coolant', name: 'Coolant Flush', type: 'fluid', sku: 'LAB-COOL', defaultPrice: 119.99, defaultCost: 32, taxable: true, active: true, linkedInventoryItemId: null },
    { id: 'fi_shopsupplies', name: 'Shop Supplies Fee', type: 'fee', sku: 'FEE-SHOP', defaultPrice: 12.95, defaultCost: 0, taxable: false, active: true, linkedInventoryItemId: null },
    { id: 'fi_loyalty10', name: 'Loyalty Discount 10%', type: 'discount', sku: 'DISC-LOY10', defaultPrice: 0, defaultCost: 0, taxable: false, active: true, linkedInventoryItemId: null },
    { id: 'fi_diagfee', name: 'Diagnostic Fee', type: 'misc_charge', sku: 'FEE-DIAG', defaultPrice: 49.99, defaultCost: 0, taxable: true, active: true, linkedInventoryItemId: null },
  ]);

  db.saveExpenses([
    { id: 'exp_1', date: daysAgoISO(3).slice(0, 10), vendor: 'NAPA Auto Parts', category: 'parts_purchase', amount: 612.40, paymentMethod: 'card', linkedPoId: 'po_1', linkedInventoryItemId: null, notes: 'Brake pad restock', status: 'recorded' },
    { id: 'exp_2', date: daysAgoISO(6).slice(0, 10), vendor: 'Uline', category: 'shop_supplies', amount: 184.20, paymentMethod: 'card', linkedPoId: null, linkedInventoryItemId: null, notes: 'Shop rags, gloves, degreaser', status: 'recorded' },
    { id: 'exp_3', date: daysAgoISO(15).slice(0, 10), vendor: 'City Power & Light', category: 'utilities', amount: 410.00, paymentMethod: 'ach', linkedPoId: null, linkedInventoryItemId: null, notes: '', status: 'recorded' },
    { id: 'exp_4', date: daysAgoISO(28).slice(0, 10), vendor: 'Westside Properties', category: 'rent', amount: 3200.00, paymentMethod: 'check', linkedPoId: null, linkedInventoryItemId: null, notes: 'Monthly rent', status: 'recorded' },
    { id: 'exp_5', date: daysAgoISO(1).slice(0, 10), vendor: 'Snap-on', category: 'tools_equipment', amount: 289.00, paymentMethod: 'card', linkedPoId: null, linkedInventoryItemId: null, notes: 'Replacement torque wrench', status: 'draft' },
    { id: 'exp_6', date: daysAgoISO(40).slice(0, 10), vendor: 'QuickBooks Online', category: 'software', amount: 45.00, paymentMethod: 'card', linkedPoId: null, linkedInventoryItemId: null, notes: 'Monthly subscription — accounting export placeholder, not actually connected', status: 'recorded' },
  ]);

  db.saveCreditNotes([
    { id: 'cn_1', customerId: 'c_linda', invoiceId: 'inv_1002', amount: 25.00, reason: 'goodwill', status: 'issued', createdAt: daysAgoISO(2), appliedAt: null, notes: 'Goodwill credit for wait time.' },
  ]);

  // ---- Register + Sales (§12: one open drawer, a few completed sales today) ----
  db.saveRegisters([
    { id: 'reg_1', openedBy: 'e_sara', openedAt: todayISO(7, 30), openingFloat: 200, closedBy: null, closedAt: null, status: 'open', expectedCash: null, countedCash: null, overShort: null, saleIds: ['sale_1', 'sale_2', 'sale_3'] },
  ]);
  db.saveSales([
    {
      id: 'sale_1', number: 'S-3001', type: 'ro_payment', invoiceId: 'inv_1001', roId: 'j_1046',
      cashierId: 'e_sara', registerSessionId: 'reg_1',
      lineItems: [{ type: 'service', name: 'Invoice INV-1001 payment', qty: 1, unitPrice: 683.18, total: 683.18 }],
      discount: 0, subtotal: 683.18, tax: 0, total: 683.18,
      tenders: [{ method: 'card', amount: 683.18 }], amountTendered: 683.18, changeDue: 0, balance: 0,
      status: 'completed', receiptEmail: '', createdAt: todayISO(11, 35), refundOfSaleId: null,
    },
    {
      id: 'sale_2', number: 'S-3002', type: 'ro_payment', invoiceId: 'inv_1002', roId: 'j_1047',
      cashierId: 'e_sara', registerSessionId: 'reg_1',
      lineItems: [{ type: 'service', name: 'Invoice INV-1002 payment', qty: 1, unitPrice: 576.43, total: 576.43 }],
      discount: 0, subtotal: 576.43, tax: 0, total: 576.43,
      tenders: [{ method: 'cash', amount: 600 }], amountTendered: 600, changeDue: 23.57, balance: 0,
      status: 'completed', receiptEmail: '', createdAt: todayISO(12, 15), refundOfSaleId: null,
    },
    {
      id: 'sale_3', number: 'S-3003', type: 'counter_sale', invoiceId: null, roId: null,
      cashierId: 'e_sara', registerSessionId: 'reg_1',
      lineItems: [{ type: 'part', refId: 'p_wipers', name: 'Wiper Blades (pair)', qty: 1, unitPrice: 19.99, total: 19.99 }],
      discount: 0, subtotal: 19.99, tax: round2(19.99 * taxRate), total: round2(19.99 * (1 + taxRate)),
      tenders: [{ method: 'cash', amount: 25 }], amountTendered: 25, changeDue: round2(25 - 19.99 * (1 + taxRate)), balance: 0,
      status: 'completed', receiptEmail: '', createdAt: todayISO(13, 5), refundOfSaleId: null,
    },
  ]);

  // ---- Bookings (3 pending) ----
  db.saveBookings([
    {
      id: 'bk_1', status: 'pending',
      customer: { name: 'Karen Sims', phone: '555-301-2001', email: 'karen.sims@example.com' },
      vehicle: { year: 2017, make: 'Mazda', model: '3', mileage: 67000, vin: '', visitType: 'drop_off' },
      serviceIds: ['s_rotate', 's_align'], preferredDate: daysAgoISO(-1).slice(0, 10), preferredSlot: 'morning',
      couponCode: '', notes: 'Pulling slightly to the left.', submittedAt: todayISO(7, 0), roId: null,
    },
    {
      id: 'bk_2', status: 'pending',
      customer: { name: 'Brian Tran', phone: '555-301-2002', email: 'brian.tran@example.com' },
      vehicle: { year: 2016, make: 'Jeep', model: 'Cherokee', mileage: 88000, vin: '', visitType: 'wait' },
      serviceIds: ['s_ac_recharge'], preferredDate: daysAgoISO(-1).slice(0, 10), preferredSlot: 'afternoon',
      couponCode: '', notes: 'AC blowing warm.', submittedAt: todayISO(7, 20), roId: null,
    },
    {
      id: 'bk_3', status: 'pending',
      customer: { name: 'Olivia Park', phone: '555-301-2003', email: 'olivia.park@example.com' },
      vehicle: { year: 2021, make: 'Kia', model: 'Forte', mileage: 19500, vin: '', visitType: 'drop_off' },
      serviceIds: ['s_oil', 's_rotate'], preferredDate: daysAgoISO(-2).slice(0, 10), preferredSlot: '09:00',
      couponCode: 'WELCOME10', notes: '', submittedAt: todayISO(8, 10), roId: null,
    },
  ]);

  // ---- Leads (CRM, Part C Phase 1) ----
  // MVP simplification: public booking requests are direct customer/vehicle
  // intake (see util.submitBooking) and never pass through here. Leads are
  // reserved for non-booked prospects — phone calls, walk-ins, web inquiries,
  // campaign responses — that an advisor is manually working toward a first visit.
  db.saveLeads([
    {
      id: 'lead_1', firstName: 'Derek', lastName: 'Nguyen', phone: '555-401-3001', email: 'derek.n@example.com',
      source: 'phone', status: 'new', serviceInterest: ['Brakes'], vehicle: { year: 2017, make: 'Mazda', model: '6', mileage: 71000 },
      notes: 'Called about a grinding noise when braking.', assignedAdvisorId: 'e_sara',
      createdAt: daysAgoISO(1, 14, 0), lastContactedAt: null, nextFollowUpAt: null, customerId: null, lostReason: null,
    },
    {
      id: 'lead_2', firstName: 'Priya', lastName: 'Shah', phone: '555-401-3002', email: 'priya.shah@example.com',
      source: 'walk_in', status: 'contacted', serviceInterest: ['Tires'], vehicle: { year: 2019, make: 'Subaru', model: 'Forester', mileage: 48000 },
      notes: 'Stopped by asking about tire pricing; said she\'d call back.', assignedAdvisorId: 'e_sara',
      createdAt: daysAgoISO(3, 11, 0), lastContactedAt: daysAgoISO(2, 9, 0), nextFollowUpAt: null, customerId: null, lostReason: null,
    },
    {
      id: 'lead_3', firstName: 'Marcus', lastName: 'Webb', phone: '555-401-3003', email: 'marcus.webb@example.com',
      source: 'website_form', status: 'nurture', serviceInterest: ['Diagnostic'], vehicle: { year: 2015, make: 'Honda', model: 'Pilot', mileage: 102000 },
      notes: 'Submitted a contact form about a check-engine light; not ready to book yet.', assignedAdvisorId: null,
      createdAt: daysAgoISO(6, 16, 0), lastContactedAt: daysAgoISO(5, 10, 0), nextFollowUpAt: null, customerId: null, lostReason: null,
    },
    // lead_4 — unassigned, stale (no contact, 10 days old)
    {
      id: 'lead_4', firstName: 'Tamara', lastName: 'Osei', phone: '555-401-3004', email: 'tamara.o@example.com',
      source: 'gbp', status: 'new', serviceInterest: ['Oil Change', 'Inspection'], vehicle: { year: 2020, make: 'Toyota', model: 'RAV4', mileage: 38000 },
      notes: 'Found us on Google — interested in a full inspection.', assignedAdvisorId: null,
      createdAt: daysAgoISO(10, 9, 0), lastContactedAt: null, nextFollowUpAt: null, customerId: null, lostReason: null, priority: 'normal',
    },
    // lead_5 — high-value opportunity, assigned to e_mike
    {
      id: 'lead_5', firstName: 'Riverside', lastName: 'Fleet Co.', phone: '555-401-3005', email: 'fleet@riverside.example.com',
      source: 'referral', status: 'estimate_needed', serviceInterest: ['Fleet Maintenance', 'Brakes', 'Oil Change'],
      vehicle: { year: 2022, make: 'Ford', model: 'Transit', mileage: 28000 },
      notes: 'Fleet account — 12 vehicles. Referred by existing customer. High-value opportunity; wants a service contract quote.', assignedAdvisorId: 'e_omar',
      createdAt: daysAgoISO(4, 10, 0), lastContactedAt: daysAgoISO(3, 15, 0), nextFollowUpAt: daysAgoISO(-1, 9, 0), customerId: null, lostReason: null, priority: 'high', estimatedValue: 8400,
    },
    // lead_6 — campaign-generated, contacted, follow-up overdue
    {
      id: 'lead_6', firstName: 'Kenji', lastName: 'Nakamura', phone: '555-401-3006', email: 'kenji.n@example.com',
      source: 'campaign', status: 'contacted', serviceInterest: ['Tires'], vehicle: { year: 2018, make: 'Subaru', model: 'Outback', mileage: 67000 },
      notes: 'Responded to the tire rotation campaign email. Contacted once — needs a follow-up call to book.', assignedAdvisorId: 'e_sara',
      createdAt: daysAgoISO(9, 11, 0), lastContactedAt: daysAgoISO(8, 10, 0), nextFollowUpAt: daysAgoISO(5, 9, 0), customerId: null, lostReason: null, priority: 'normal', campaignId: 'camp_tire',
    },
    // lead_7 — lost, declined work follow-up candidate
    {
      id: 'lead_7', firstName: 'Angela', lastName: 'Voss', phone: '555-401-3007', email: 'angela.v@example.com',
      source: 'walk_in', status: 'lost', serviceInterest: ['Transmission'], vehicle: { year: 2014, make: 'Chevrolet', model: 'Equinox', mileage: 118000 },
      notes: 'Came in for a transmission estimate — went elsewhere after seeing the price.', assignedAdvisorId: 'e_omar',
      createdAt: daysAgoISO(21, 14, 0), lastContactedAt: daysAgoISO(18, 10, 0), nextFollowUpAt: null, customerId: null, lostReason: 'price', priority: 'normal',
    },
  ]);

  // ---- Marketing: segments + templates (Part D Phase 1) ----
  db.saveSegments([
    { id: 'seg_all', name: 'All Customers', criteria: {}, computed: true },
    { id: 'seg_honda', name: 'Honda Owners', criteria: { vehicleMake: 'Honda' }, computed: true },
    { id: 'seg_new', name: 'New Customers', criteria: { kind: 'new' }, computed: true,
      description: 'Joined in the last 30 days. Real — based on Customer.createdAt.' },
    { id: 'seg_returning', name: 'Returning Customers', criteria: { kind: 'returning' }, computed: true,
      description: '2+ repair orders on file. Real — derived from db.jobsForCustomer.' },
    { id: 'seg_inactive', name: 'Inactive Customers', criteria: { kind: 'inactive' }, computed: true,
      description: 'Has prior history but no RO in 90+ days. Real — derived from job dates.' },
    { id: 'seg_due_oil', name: 'Due for Oil Change', criteria: { kind: 'due_oil_change' }, computed: true,
      description: 'Last Oil Change line item 150+ days ago, or never. Real — matched on service id.' },
    { id: 'seg_due_tire', name: 'Due for Tire Rotation', criteria: { kind: 'due_tire_rotation' }, computed: true,
      description: 'Last Tire Rotation line item 180+ days ago, or never. Real — matched on service id.' },
    { id: 'seg_declined', name: 'Declined Services', criteria: { kind: 'declined_services' }, computed: true,
      description: 'Has an RO with approvalStatus "declined". Real — set by util.resolveApproval.' },
    { id: 'seg_high_value', name: 'High-Value Customers', criteria: { kind: 'high_value' }, computed: true,
      description: 'ASSUMPTION: $400+ lifetime invoiced total. Threshold is a documented MVP guess; the sum itself is real.' },
    { id: 'seg_fleet', name: 'Fleet / Commercial', criteria: { kind: 'fleet' }, computed: true,
      description: 'ASSUMPTION: 3+ vehicles on file, used as a stand-in until a real Account/fleet entity exists.' },
    { id: 'seg_upcoming', name: 'Upcoming Appointments', criteria: { kind: 'upcoming_appointments' }, computed: true,
      description: 'Has a scheduled/waiting RO dated today or later. Real.' },
    { id: 'seg_missing_contact', name: 'Missing Contact Info', criteria: { kind: 'missing_contact' }, computed: true,
      description: 'No email or no phone on file. Real.' },
  ]);
  db.saveTemplates([
    {
      id: 'tpl_welcome', name: 'Welcome Back', subject: 'We miss you, {{firstName}}!',
      body: 'Hi {{firstName}}, it has been a while since we serviced your {{vehicleMake}} {{vehicleModel}}. Use code {{couponCode}} for 10% off your next visit.',
    },
    {
      id: 'tpl_reminder', name: 'Service Reminder', subject: 'Time for a checkup, {{firstName}}?',
      body: 'Hi {{firstName}}, your {{vehicleMake}} {{vehicleModel}} may be due for service. Book online anytime — we\'d love to see you again.',
    },
  ]);

  // Ten example campaigns spanning every type/status, per the AutoBook
  // marketing brief. `metrics` on "sent" campaigns are seeded placeholder
  // numbers — there is no real email/SMS integration, so opened/clicked/
  // booked/revenue are illustrative only, never computed from real sends.
  db.saveCampaigns([
    {
      id: 'camp_oil', name: 'Oil Change Reminder', type: 'reminder', status: 'sent',
      segmentId: 'seg_due_oil', subject: 'Time for an oil change, {{firstName}}?',
      body: 'Hi {{firstName}}, your {{vehicleMake}} {{vehicleModel}} is due for an oil change. Book online anytime.',
      offer: '', scheduledAt: null, sentAt: daysAgoISO(5, 9, 0),
      metrics: { sent: 6, opened: 4, clicked: 2, booked: 1, revenue: 60 },
    },
    {
      id: 'camp_tire', name: 'Tire Rotation Reminder', type: 'reminder', status: 'draft',
      segmentId: 'seg_due_tire', subject: 'Rotate those tires, {{firstName}}',
      body: 'Hi {{firstName}}, it looks like your {{vehicleMake}} {{vehicleModel}} is due for a tire rotation.',
      offer: '', scheduledAt: null, sentAt: null, metrics: {},
    },
    {
      id: 'camp_winter', name: 'Winter Service Special', type: 'promotion', status: 'scheduled',
      segmentId: 'seg_all', subject: 'Get winter-ready, {{firstName}}', offer: 'WELCOME10',
      body: 'Hi {{firstName}}, beat the cold — battery, heater, and tire checks all in one visit. Use code {{couponCode}} for 10% off.',
      scheduledAt: daysAgoISO(-7, 9, 0), sentAt: null, metrics: {},
    },
    {
      id: 'camp_brake', name: 'Brake Inspection Special', type: 'promotion', status: 'draft',
      segmentId: 'seg_declined', subject: 'Still thinking about those brakes, {{firstName}}?',
      body: 'Hi {{firstName}}, safety first — let\'s get that declined brake work back on the schedule.',
      offer: '', scheduledAt: null, sentAt: null, metrics: {},
    },
    {
      id: 'camp_winback', name: 'We Miss You', type: 'email', status: 'sent',
      segmentId: 'seg_inactive', subject: 'We miss you, {{firstName}}!', offer: 'WELCOME10',
      body: 'Hi {{firstName}}, it has been a while since we serviced your {{vehicleMake}} {{vehicleModel}}. Use code {{couponCode}} for 10% off your next visit.',
      scheduledAt: null, sentAt: daysAgoISO(10, 14, 0),
      metrics: { sent: 1, opened: 1, clicked: 0, booked: 0, revenue: 0 },
    },
    {
      id: 'camp_review', name: 'Post-Service Review Request', type: 'review_request', status: 'sent',
      segmentId: 'seg_returning', subject: 'How did we do, {{firstName}}?',
      body: 'Hi {{firstName}}, thanks for visiting! Mind leaving us a quick review?',
      offer: '', scheduledAt: null, sentAt: daysAgoISO(2, 16, 0),
      metrics: { sent: 8, opened: 6, clicked: 3, booked: 0, revenue: 0 },
    },
    {
      id: 'camp_firstvisit', name: 'First-Time Customer Welcome', type: 'email', status: 'draft',
      segmentId: 'seg_new', subject: 'Welcome to the shop, {{firstName}}!',
      body: 'Hi {{firstName}}, thanks for choosing us for your {{vehicleMake}} {{vehicleModel}}. We\'re glad to have you.',
      offer: '', scheduledAt: null, sentAt: null, metrics: {},
    },
    {
      id: 'camp_declined_followup', name: 'Declined-Service Follow-up', type: 'reminder', status: 'scheduled',
      segmentId: 'seg_declined', subject: 'A reminder about your estimate, {{firstName}}',
      body: 'Hi {{firstName}}, just checking in on the work we discussed for your {{vehicleMake}} {{vehicleModel}}.',
      offer: '', scheduledAt: daysAgoISO(-3, 10, 0), sentAt: null, metrics: {},
    },
  ]);
  // Intentionally NOT seeding "Inspection Reminder" or "Fleet Service
  // Reminder" — leaving them uncreated so util.suggestedCampaigns() has real
  // gaps to surface on the dashboard instead of an always-empty widget.
  db.saveCommunications([]);

  // Automation ideas (§D) — visual/status only in this MVP; no real trigger
  // engine exists yet, so toggling on/off just flips this flag.
  db.saveAutomations([
    { id: 'auto_welcome', name: 'Welcome New Customer', trigger: 'When a customer is created', description: 'Sends a friendly welcome after a customer\'s first visit is booked.', status: 'on' },
    { id: 'auto_review', name: 'Post-Service Review Request', trigger: 'When an RO is closed', description: 'Asks for a review a day after the vehicle is picked up.', status: 'on' },
    { id: 'auto_oil', name: 'Oil Change Reminder', trigger: 'When due for oil change', description: 'Nudges customers in the "Due for Oil Change" segment.', status: 'on' },
    { id: 'auto_tire', name: 'Tire Rotation Reminder', trigger: 'When due for tire rotation', description: 'Nudges customers in the "Due for Tire Rotation" segment.', status: 'off' },
    { id: 'auto_declined', name: 'Declined Service Follow-up', trigger: 'When a service is declined', description: 'Follows up a few days after a customer declines recommended work.', status: 'off' },
    { id: 'auto_winback', name: 'Win-Back Inactive Customer', trigger: 'When inactive 90+ days', description: 'Re-engages customers who haven\'t booked in 90+ days.', status: 'on' },
    { id: 'auto_seasonal', name: 'Seasonal Maintenance Campaign', trigger: 'Quarterly, manually reviewed', description: 'Suggests a seasonal service push (winterizing, summer AC checks, etc.).', status: 'off' },
  ]);

  // ---- Quotes / Estimates (§ Quote system, Phase 1) ----
  // Mirrors buildRO's approach: totals are always computed from line items,
  // never hardcoded, so seed data stays internally consistent with the same
  // formula util.recalcQuote uses at runtime.
  function lineTotalQ(line) {
    if (line.type === 'labor') return round2((line.hours || 0) * laborRate);
    return round2((line.qty || 0) * (line.unitPrice || 0));
  }
  function buildQuote(base, lines, discount = 0) {
    const lineItems = lines.map((l, i) => ({
      id: `${base.id}_qli${i}`, quoteId: base.id, status: 'recommended', taxable: true, source: 'service',
      ...l, total: lineTotalQ(l),
    }));
    const subtotal = round2(lineItems.reduce((s, l) => s + l.total, 0));
    const taxableAmt = Math.max(subtotal - discount, 0);
    const taxTotal = round2(taxableAmt * taxRate);
    const total = round2(taxableAmt + taxTotal);
    return { ...base, lineItems, subtotal, discountTotal: discount, taxTotal, total };
  }

  db.saveQuotes([
    // 1) Draft — David M., check-engine light, diagnostic only so far.
    buildQuote({
      id: 'q_1', quoteNumber: 'Q-5001', customerId: 'c_david', vehicleId: 'v_camry', bookingId: null, roId: null,
      title: 'Check-engine light diagnostic', concern: 'Check engine light on, rough idle at stoplights.',
      diagnosisNotes: '', status: 'draft', priority: 'normal', validUntil: daysAgoISO(-14).slice(0, 10),
      createdAt: daysAgoISO(2, 9, 0), updatedAt: daysAgoISO(2, 9, 0), sentAt: null, approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: 'Waiting on scan tool results before quoting repair.', customerNotes: '',
      approvalToken: null, source: 'walk_in',
    }, [
      { type: 'diagnostic', refId: 's_eng_diag', name: 'Engine Diagnostic', qty: 1, unitPrice: 99.99 },
    ]),

    // 2) Ready to send — James M., brake noise.
    buildQuote({
      id: 'q_2', quoteNumber: 'Q-5002', customerId: 'c_james', vehicleId: 'v_f150', bookingId: null, roId: null,
      title: 'Front brake service', concern: 'Grinding noise when braking.', diagnosisNotes: 'Front pads worn to metal; rotors still within spec.',
      status: 'ready_to_send', priority: 'urgent', validUntil: daysAgoISO(-10).slice(0, 10),
      createdAt: daysAgoISO(1, 14, 0), updatedAt: daysAgoISO(1, 14, 0), sentAt: null, approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: 't_tyler', internalNotes: '', customerNotes: '', approvalToken: null, source: 'walk_in',
    }, [
      { type: 'inspection', refId: 's_brake_insp', name: 'Brake Inspection', qty: 1, unitPrice: 0 },
      { type: 'labor', name: 'Brake pad replacement labor', hours: 1.5, laborRate: 120 },
      { type: 'parts', refId: 'p_pads_front', partId: 'p_pads_front', name: 'Brake Pads — Front Set', qty: 1, unitPrice: 59.99, unitCost: 28 },
    ]),

    // 3) Sent, waiting on customer — Maria J., routine maintenance.
    buildQuote({
      id: 'q_3', quoteNumber: 'Q-5003', customerId: 'c_maria', vehicleId: 'v_civic', bookingId: null, roId: null,
      title: 'Routine maintenance', concern: 'Due for oil change and tire rotation.', diagnosisNotes: '',
      status: 'sent', priority: 'low', validUntil: daysAgoISO(-7).slice(0, 10),
      createdAt: daysAgoISO(3, 10, 0), updatedAt: daysAgoISO(3, 10, 0), sentAt: daysAgoISO(3, 10, 5), approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: '', customerNotes: '', approvalToken: 'tok_q3demo', source: 'crm',
    }, [
      { type: 'service', refId: 's_oil', name: 'Oil Change', qty: 1, unitPrice: 59.99, hours: 0.5 },
      { type: 'service', refId: 's_rotate', name: 'Tire Rotation', qty: 1, unitPrice: 29.99, hours: 0.5 },
    ]),

    // 4) Viewed by customer, not yet decided — Amanda L., dead battery.
    buildQuote({
      id: 'q_4', quoteNumber: 'Q-5004', customerId: 'c_amanda', vehicleId: 'v_330i', bookingId: null, roId: null,
      title: 'Battery replacement', concern: 'Car wouldn\'t start this morning.', diagnosisNotes: 'Battery tested bad under load.',
      status: 'viewed', priority: 'urgent', validUntil: daysAgoISO(-5).slice(0, 10),
      createdAt: daysAgoISO(1, 8, 0), updatedAt: daysAgoISO(0, 9, 30), sentAt: daysAgoISO(1, 8, 10), approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_jeff', techId: null, internalNotes: '', customerNotes: '', approvalToken: 'tok_q4demo', source: 'walk_in',
    }, [
      { type: 'service', refId: 's_battery', name: 'Battery', qty: 1, unitPrice: 179.99, hours: 0.5 },
      { type: 'parts', refId: 'p_battery', partId: 'p_battery', name: 'Battery (Group 35)', qty: 1, unitPrice: 139.99, unitCost: 70 },
    ]),

    // 5) Fully approved, not yet converted — Robert K., AC repair.
    buildQuote({
      id: 'q_5', quoteNumber: 'Q-5005', customerId: 'c_robert', vehicleId: 'v_ram', bookingId: null, roId: null,
      title: 'AC repair', concern: 'AC blowing warm air.', diagnosisNotes: 'Low on refrigerant, no leak found.',
      status: 'approved', priority: 'normal', validUntil: daysAgoISO(-9).slice(0, 10),
      createdAt: daysAgoISO(4, 13, 0), updatedAt: daysAgoISO(2, 11, 0), sentAt: daysAgoISO(4, 13, 5), approvedAt: daysAgoISO(2, 11, 0), declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: '', customerNotes: 'Approved — please get me in this week.', approvalToken: 'tok_q5demo', source: 'walk_in',
    }, [
      { type: 'service', refId: 's_ac_diag', name: 'AC Diagnostic/Repair', qty: 1, unitPrice: 89.99, hours: 1, status: 'approved' },
      { type: 'service', refId: 's_ac_recharge', name: 'AC Recharge', qty: 1, unitPrice: 149.99, hours: 1.5, status: 'approved' },
    ]),

    // 6) Partially approved — Tom W., tune-up approved, alignment declined.
    buildQuote({
      id: 'q_6', quoteNumber: 'Q-5006', customerId: 'c_tom', vehicleId: 'v_accord', bookingId: null, roId: null,
      title: 'Tune-up + alignment check', concern: 'Due for tune-up; also pulling slightly right.', diagnosisNotes: '',
      status: 'partially_approved', priority: 'normal', validUntil: daysAgoISO(-8).slice(0, 10),
      createdAt: daysAgoISO(5, 9, 0), updatedAt: daysAgoISO(3, 15, 0), sentAt: daysAgoISO(5, 9, 5), approvedAt: daysAgoISO(3, 15, 0), declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: '', customerNotes: 'Skip the alignment for now, just do the tune-up.', approvalToken: 'tok_q6demo', source: 'walk_in',
    }, [
      { type: 'service', refId: 's_tuneup', name: 'Tune-up', qty: 1, unitPrice: 189.99, hours: 1.5, status: 'approved' },
      { type: 'service', refId: 's_align', name: 'Alignment', qty: 1, unitPrice: 89.99, hours: 1, status: 'declined' },
    ]),

    // 7) Declined — Patricia G., timing belt deferred.
    buildQuote({
      id: 'q_7', quoteNumber: 'Q-5007', customerId: 'c_patricia', vehicleId: 'v_altima', bookingId: null, roId: null,
      title: 'Timing belt replacement', concern: 'Due for timing belt per mileage.', diagnosisNotes: 'No symptoms yet — preventive.',
      status: 'declined', priority: 'normal', validUntil: daysAgoISO(-3).slice(0, 10),
      createdAt: daysAgoISO(6, 9, 0), updatedAt: daysAgoISO(4, 16, 0), sentAt: daysAgoISO(6, 9, 5), approvedAt: null, declinedAt: daysAgoISO(4, 16, 0), convertedAt: null,
      advisorId: 'e_jeff', techId: null, internalNotes: '', customerNotes: 'Need to wait until next paycheck — please follow up in a few weeks.', approvalToken: 'tok_q7demo', source: 'walk_in',
    }, [
      { type: 'service', refId: 's_timing', name: 'Timing Belt', qty: 1, unitPrice: 599.99, hours: 4, status: 'declined' },
      { type: 'parts', refId: 'p_serpentine', partId: 'p_serpentine', name: 'Serpentine Belt', qty: 1, unitPrice: 39.99, status: 'declined' },
    ]),

    // 8) Expired — Steve H., never responded before validUntil passed.
    buildQuote({
      id: 'q_8', quoteNumber: 'Q-5008', customerId: 'c_steve', vehicleId: 'v_wrangler', bookingId: null, roId: null,
      title: 'Wipers + coolant service', concern: 'Streaky wipers, coolant due.', diagnosisNotes: '',
      status: 'expired', priority: 'low', validUntil: daysAgoISO(5).slice(0, 10),
      createdAt: daysAgoISO(25, 9, 0), updatedAt: daysAgoISO(5, 9, 0), sentAt: daysAgoISO(20, 9, 5), approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: 'Never heard back — mark for follow-up.', customerNotes: '', approvalToken: 'tok_q8demo', source: 'walk_in',
    }, [
      { type: 'parts', refId: 'p_wipers', partId: 'p_wipers', name: 'Wiper Blades (pair)', qty: 1, unitPrice: 19.99 },
      { type: 'service', refId: 's_coolant', name: 'Coolant Flush', qty: 1, unitPrice: 119.99, hours: 1 },
    ]),

    // 9) Converted — Linda P. Mirrors RO-1047's real line items/total exactly
    // (closed + invoiced already in seed data) so the "already converted" demo
    // is internally consistent with the repair order it points to.
    buildQuote({
      id: 'q_9', quoteNumber: 'Q-5009', customerId: 'c_linda', vehicleId: 'v_subaru', bookingId: null, roId: 'j_1047',
      title: 'Full brake service + AC recharge', concern: 'Squeaking brakes; AC weak.', diagnosisNotes: 'Pads and rotors worn; AC low on charge.',
      status: 'converted', priority: 'normal', validUntil: daysAgoISO(-30).slice(0, 10),
      createdAt: daysAgoISO(35, 9, 0), updatedAt: daysAgoISO(30, 9, 0), sentAt: daysAgoISO(35, 9, 5), approvedAt: daysAgoISO(31, 10, 0), declinedAt: null, convertedAt: daysAgoISO(30, 9, 0),
      advisorId: 'e_sara', techId: 't_devon', internalNotes: '', customerNotes: '', approvalToken: 'tok_q9demo', source: 'walk_in',
    }, [
      { type: 'service', refId: 's_brake_full', name: 'Full Brake Service', qty: 1, unitPrice: 389.99, hours: 3, status: 'approved' },
      { type: 'service', refId: 's_ac_recharge', name: 'AC Recharge', qty: 1, unitPrice: 149.99, hours: 1.5, status: 'approved' },
    ]),

    // 10) Sent with optional recommended work — Nina F.
    buildQuote({
      id: 'q_10', quoteNumber: 'Q-5010', customerId: 'c_nina', vehicleId: 'v_elantra', bookingId: null, roId: null,
      title: 'Multi-point inspection + filters', concern: 'Requested general inspection.', diagnosisNotes: 'Both filters dirty but not required yet.',
      status: 'sent', priority: 'low', validUntil: daysAgoISO(-12).slice(0, 10),
      createdAt: daysAgoISO(1, 9, 0), updatedAt: daysAgoISO(1, 9, 0), sentAt: daysAgoISO(1, 9, 5), approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: '', customerNotes: '', approvalToken: 'tok_q10demo', source: 'booking',
    }, [
      { type: 'inspection', refId: 's_mpi', name: 'Multi-Point Inspection', qty: 1, unitPrice: 0, hours: 0.75, status: 'recommended' },
      { type: 'parts', refId: 'p_cabinfilter', partId: 'p_cabinfilter', name: 'Cabin Air Filter', qty: 1, unitPrice: 24.99, status: 'optional' },
      { type: 'parts', refId: 'p_engfilter', partId: 'p_engfilter', name: 'Engine Air Filter', qty: 1, unitPrice: 27.99, status: 'optional' },
    ]),

    // 11) Draft with a real part-availability warning — Chris B. (p_pads_front
    // is genuinely low stock: qtyOnHand 2 vs reorderPoint 6 in the seed data).
    buildQuote({
      id: 'q_11', quoteNumber: 'Q-5011', customerId: 'c_chrisb', vehicleId: 'v_tahoe', bookingId: null, roId: null,
      title: 'Front brake pad replacement', concern: 'Brake pedal pulsing.', diagnosisNotes: 'Front pads worn.',
      status: 'draft', priority: 'normal', validUntil: daysAgoISO(-14).slice(0, 10),
      createdAt: daysAgoISO(0, 12, 0), updatedAt: daysAgoISO(0, 12, 0), sentAt: null, approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_jeff', techId: null, internalNotes: 'Front pad stock is low — confirm availability before sending.', customerNotes: '', approvalToken: null, source: 'walk_in',
    }, [
      { type: 'service', refId: 's_brake_pad', name: 'Brake Pad Replacement', qty: 1, unitPrice: 199.99, hours: 1.5 },
      { type: 'parts', refId: 'p_pads_front', partId: 'p_pads_front', name: 'Brake Pads — Front Set', qty: 1, unitPrice: 59.99, unitCost: 28 },
    ]),

    // 12) From a booking inquiry — Maria J. (tire rotation + alignment, the
    // same service pairing requested on pending booking bk_1). ASSUMPTION:
    // no seeded pending booking maps to an existing Customer yet (bk_1's
    // "Karen Sims" hasn't been confirmed into a Customer record), so
    // `bookingId` is left null and `source: 'booking'` carries the real signal.
    buildQuote({
      id: 'q_12', quoteNumber: 'Q-5012', customerId: 'c_maria', vehicleId: 'v_civic', bookingId: null, roId: null,
      title: 'Tire rotation + alignment', concern: 'Requested via online booking: car pulling slightly.', diagnosisNotes: '',
      status: 'review_required', priority: 'normal', validUntil: daysAgoISO(-13).slice(0, 10),
      createdAt: daysAgoISO(1, 7, 30), updatedAt: daysAgoISO(1, 7, 30), sentAt: null, approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: 'Advisor to confirm pricing before sending.', customerNotes: '', approvalToken: null, source: 'booking',
    }, [
      { type: 'service', refId: 's_rotate', name: 'Tire Rotation', qty: 1, unitPrice: 29.99, hours: 0.5 },
      { type: 'service', refId: 's_align', name: 'Alignment', qty: 1, unitPrice: 89.99, hours: 1 },
    ]),

    // 13) From a CRM declined-service follow-up — Patricia G. (the same
    // customer as q_7's declined timing belt; a smaller win-back quote).
    buildQuote({
      id: 'q_13', quoteNumber: 'Q-5013', customerId: 'c_patricia', vehicleId: 'v_altima', bookingId: null, roId: null,
      title: 'Brake inspection follow-up', concern: 'CRM follow-up after declined timing belt quote.', diagnosisNotes: '',
      status: 'draft', priority: 'low', validUntil: daysAgoISO(-14).slice(0, 10),
      createdAt: daysAgoISO(0, 10, 0), updatedAt: daysAgoISO(0, 10, 0), sentAt: null, approvedAt: null, declinedAt: null, convertedAt: null,
      advisorId: 'e_sara', techId: null, internalNotes: 'Lighter offer to re-open the conversation.', customerNotes: '', approvalToken: null, source: 'declined_service',
    }, [
      { type: 'inspection', refId: 's_brake_insp', name: 'Brake Inspection', qty: 1, unitPrice: 0, hours: 0.5 },
    ]),
  ]);

  // ---- Platform / Phase E (SaaS signup foundation) ----
  // Plan catalog. `features` gates which app sections a plan unlocks —
  // demo/placeholder logic only (see util.featureFlagsForPlan); nothing in
  // the operational app actually checks these yet, per CLAUDE.md Phase E scope.
  db.savePlans([
    {
      id: 'plan_starter', name: 'Starter', tagline: 'Get online and start taking bookings.',
      monthlyPrice: 79, annualPrice: 790, seatsIncluded: 3, locationsIncluded: 1, highlight: false,
      features: { booking: true, crm: false, quotes: false, repairOrders: true, invoices: true, pos: false, inventory: false, marketing: false, team: false, monitors: false, quickbooksExport: false, stripePayments: false, multiLocation: false },
    },
    {
      id: 'plan_pro', name: 'Pro', tagline: 'Run the whole shop floor in real time.',
      monthlyPrice: 179, annualPrice: 1790, seatsIncluded: 8, locationsIncluded: 1, highlight: true,
      features: { booking: true, crm: true, quotes: true, repairOrders: true, invoices: true, pos: true, inventory: true, marketing: false, team: false, monitors: true, quickbooksExport: false, stripePayments: false, multiLocation: false },
    },
    {
      id: 'plan_growth', name: 'Growth', tagline: 'Add marketing and team management as you scale.',
      monthlyPrice: 299, annualPrice: 2990, seatsIncluded: 20, locationsIncluded: 1, highlight: false,
      features: { booking: true, crm: true, quotes: true, repairOrders: true, invoices: true, pos: true, inventory: true, marketing: true, team: true, monitors: true, quickbooksExport: true, stripePayments: false, multiLocation: false },
    },
    {
      id: 'plan_multi', name: 'Multi-Location', tagline: 'Every feature, across every shop you run.',
      monthlyPrice: 549, annualPrice: 5490, seatsIncluded: 50, locationsIncluded: 5, highlight: false,
      features: { booking: true, crm: true, quotes: true, repairOrders: true, invoices: true, pos: true, inventory: true, marketing: true, team: true, monitors: true, quickbooksExport: true, stripePayments: true, multiLocation: true },
    },
  ]);

  // One real demo account/shop/subscription/user/membership representing the
  // existing "AutoBook Demo Shop" operational data — so platform.html and
  // Settings → Subscription have something real to show before anyone runs
  // the signup flow themselves. This shop record is platform-layer metadata
  // ONLY; the operational app (dashboard/CRM/etc.) keeps reading the single
  // global `settings`/`customers`/`jobs`/... collections exactly as before.
  db.saveAccounts([
    { id: 'acct_demo', ownerName: 'Jeff Hill', ownerEmail: 'jeff@autobookdemo.com', ownerPhone: '(555) 240-1900', createdAt: daysAgoISO(400) },
  ]);
  db.saveShops([
    { id: 'shop_demo', accountId: 'acct_demo', name: 'AutoBook Demo Shop', address: '418 Industrial Pkwy', city: 'Springfield', state: 'IL', zip: '62701', phone: '(555) 240-1900', website: 'autobookdemo.com', timezone: 'America/Chicago', bays: 4, techCount: 4, createdAt: daysAgoISO(400) },
  ]);
  db.saveSubscriptions([
    { id: 'sub_demo', accountId: 'acct_demo', shopId: 'shop_demo', planId: 'plan_pro', status: 'active', billingCycle: 'annual', trialEndsAt: null, currentPeriodStart: daysAgoISO(20).slice(0, 10), currentPeriodEnd: daysAgoISO(-345).slice(0, 10), seatsIncluded: 8, locationsIncluded: 1, stripeCustomerId: null, stripeSubscriptionId: null, createdAt: daysAgoISO(400) },
  ]);
  db.saveUsers([
    { id: 'user_demo', accountId: 'acct_demo', name: 'Jeff Hill', email: 'jeff@autobookdemo.com', phone: '(555) 240-1900', passwordPlaceholder: true, createdAt: daysAgoISO(400) },
  ]);
  db.saveMemberships([
    { id: 'mem_demo', userId: 'user_demo', shopId: 'shop_demo', role: 'owner', createdAt: daysAgoISO(400) },
  ]);
  db.saveOnboardingProgress([
    { id: 'onb_demo', accountId: 'acct_demo', shopId: 'shop_demo', step: 'done', servicesOffered: db.services().map((s) => s.id), businessHours: db.settings().hours, bookingPreferences: { defaultVisitType: 'drop_off' }, taxRatePlaceholder: db.settings().taxRate, logoUploadPlaceholder: null, completedAt: daysAgoISO(400) },
  ]);
}
