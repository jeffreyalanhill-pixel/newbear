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
  registerById(id) { return db.registers().find(r => r.id === id); },
  saleById(id) { return db.sales().find(s => s.id === id); },
  leadById(id) { return db.leads().find(l => l.id === id); },
  segmentById(id) { return db.segments().find(s => s.id === id); },
  templateById(id) { return db.templates().find(t => t.id === id); },
  campaignById(id) { return db.campaigns().find(c => c.id === id); },
  roleById(id) { return db.roles().find(r => r.id === id); },
  automationById(id) { return db.automations().find(a => a.id === id); },

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
  shiftsForWeek(weekStartIso) {
    const start = new Date(weekStartIso + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return db.shifts().filter(s => {
      const d = new Date(s.date + 'T00:00:00');
      return d >= start && d < end;
    });
  },
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
        // util.resolveApproval) tied to this customer.
        customers = customers.filter(c => db.jobsForCustomer(c.id).some(j => j.approvalStatus === 'declined'));
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
  const employees = [
    { id: 't_marcus', firstName: 'Marcus', lastName: 'Johnson', avatar: 'MJ', isTech: true, bayId: 'b_3', role: 'technician', jobTitle: 'Senior Technician', payType: 'flat_rate', payRate: 32, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1001', email: 'marcus.j@autobookdemo.com', hireDate: daysAgoISO(900).slice(0, 10), permissionOverrides: {} },
    { id: 't_devon', firstName: 'Devon', lastName: 'Carter', avatar: 'DC', isTech: true, bayId: 'b_1', role: 'technician', jobTitle: 'Technician', payType: 'flat_rate', payRate: 30, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1002', email: 'devon.c@autobookdemo.com', hireDate: daysAgoISO(540).slice(0, 10), permissionOverrides: {} },
    { id: 't_chris', firstName: 'Chris', lastName: 'Bell', avatar: 'CB', isTech: true, bayId: 'b_4', role: 'technician', jobTitle: 'Technician', payType: 'hourly', payRate: 26, clockStatus: 'in', workStatus: 'idle', employmentStatus: 'active', phone: '555-501-1003', email: 'chris.b@autobookdemo.com', hireDate: daysAgoISO(300).slice(0, 10), permissionOverrides: {} },
    { id: 't_tyler', firstName: 'Tyler', lastName: 'Nguyen', avatar: 'TN', isTech: true, bayId: 'b_2', role: 'apprentice', jobTitle: 'Apprentice Technician', payType: 'hourly', payRate: 24, clockStatus: 'in', workStatus: 'waiting', employmentStatus: 'active', phone: '555-501-1004', email: 'tyler.n@autobookdemo.com', hireDate: daysAgoISO(120).slice(0, 10), permissionOverrides: {} },
    { id: 'e_sara', firstName: 'Sara', lastName: 'Diaz', avatar: 'SD', isTech: false, role: 'advisor', jobTitle: 'Service Advisor', payType: 'hourly', payRate: 24, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1005', email: 'sara.d@autobookdemo.com', hireDate: daysAgoISO(700).slice(0, 10), permissionOverrides: {} },
    { id: 'e_jeff', firstName: 'Jeff', lastName: 'Hill', avatar: 'JH', isTech: false, role: 'owner', jobTitle: 'Owner', payType: 'salary', payRate: 95000, clockStatus: 'in', workStatus: 'working', employmentStatus: 'active', phone: '555-501-1000', email: 'jeff@autobookdemo.com', hireDate: daysAgoISO(1500).slice(0, 10), permissionOverrides: {} },
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
  };
  db.saveRoles([
    { id: 'owner', name: 'Owner', isSystem: true, permissions: { ...ALL_PERMS } },
    { id: 'manager', name: 'Shop Manager', isSystem: true, permissions: { ...ALL_PERMS, 'settings.manage': false, 'records.delete': false } },
    { id: 'advisor', name: 'Service Advisor', isSystem: true, permissions: {
      'customers.view': true, 'customers.edit': true, 'vehicles.view': true, 'vehicles.edit': true,
      'appointments.view': true, 'appointments.edit': true, 'bookings.confirm': true, 'appointments.assign': true,
      'invoices.view': true, 'payments.manage': true, 'crm.view': true, 'leads.convert': true,
    } },
    { id: 'technician', name: 'Technician', isSystem: true, permissions: {
      'customers.view': true, 'vehicles.view': true, 'appointments.view': true,
    } },
    { id: 'apprentice', name: 'Apprentice Technician', isSystem: true, permissions: {
      'vehicles.view': true, 'appointments.view': true,
    } },
  ]);

  // ---- Shifts (§B.4.4, basic schedule) — this week, Mon-Fri ----
  const shifts = [];
  const techShiftIds = ['t_marcus', 't_devon', 't_chris', 't_tyler', 'e_sara'];
  for (let d = 0; d < 5; d++) {
    techShiftIds.forEach((employeeId) => {
      const day = new Date();
      day.setDate(day.getDate() - day.getDay() + 1 + d); // this week's Mon..Fri
      shifts.push({
        id: db.nextId('shift'), employeeId, date: day.toISOString().slice(0, 10),
        start: '08:00', end: '17:00', note: '', published: true,
      });
    });
  }
  db.saveShifts(shifts);

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

  // ---- Parts (~20, 2 below reorder) ----
  const parts = [
    { id: 'p_oilfilter', name: 'Oil Filter', sku: 'OF-100', category: 'Filters', cost: 4.5, price: 12.99, qtyOnHand: 40, reorderPoint: 10, vendor: 'NAPA' },
    { id: 'p_5qtsyn', name: '5qt Synthetic Oil', sku: 'OIL-5QT-SYN', category: 'Fluids', cost: 18, price: 39.99, qtyOnHand: 30, reorderPoint: 8, vendor: 'NAPA' },
    { id: 'p_pads_front', name: 'Brake Pads — Front Set', sku: 'BP-FRT-01', category: 'Brakes', cost: 28, price: 59.99, qtyOnHand: 2, reorderPoint: 6, vendor: "O'Reilly" },
    { id: 'p_pads_rear', name: 'Brake Pads — Rear Set', sku: 'BP-RR-01', category: 'Brakes', cost: 24, price: 54.99, qtyOnHand: 9, reorderPoint: 6, vendor: "O'Reilly" },
    { id: 'p_rotors', name: 'Rotors (pair)', sku: 'ROT-02', category: 'Brakes', cost: 45, price: 99.99, qtyOnHand: 8, reorderPoint: 4, vendor: "O'Reilly" },
    { id: 'p_refrigerant', name: 'AC Refrigerant (R134a)', sku: 'AC-R134', category: 'AC', cost: 12, price: 29.99, qtyOnHand: 15, reorderPoint: 5, vendor: 'AutoZone' },
    { id: 'p_cabinfilter', name: 'Cabin Air Filter', sku: 'CF-200', category: 'Filters', cost: 8, price: 24.99, qtyOnHand: 20, reorderPoint: 6, vendor: 'NAPA' },
    { id: 'p_engfilter', name: 'Engine Air Filter', sku: 'EF-300', category: 'Filters', cost: 9, price: 27.99, qtyOnHand: 18, reorderPoint: 6, vendor: 'NAPA' },
    { id: 'p_sparkplugs', name: 'Spark Plugs (set of 4)', sku: 'SP-400', category: 'Engine', cost: 16, price: 44.99, qtyOnHand: 12, reorderPoint: 4, vendor: 'AutoZone' },
    { id: 'p_battery', name: 'Battery (Group 35)', sku: 'BAT-35', category: 'Electrical', cost: 70, price: 139.99, qtyOnHand: 7, reorderPoint: 3, vendor: 'Interstate' },
    { id: 'p_coolant', name: 'Coolant (1gal)', sku: 'CO-500', category: 'Fluids', cost: 9, price: 21.99, qtyOnHand: 25, reorderPoint: 6, vendor: 'NAPA' },
    { id: 'p_serpentine', name: 'Serpentine Belt', sku: 'BLT-600', category: 'Engine', cost: 14, price: 39.99, qtyOnHand: 1, reorderPoint: 4, vendor: "O'Reilly" },
    { id: 'p_wipers', name: 'Wiper Blades (pair)', sku: 'WB-700', category: 'Exterior', cost: 6, price: 19.99, qtyOnHand: 22, reorderPoint: 8, vendor: 'AutoZone' },
    { id: 'p_transfluid', name: 'Transmission Fluid (qt)', sku: 'TF-800', category: 'Fluids', cost: 7, price: 16.99, qtyOnHand: 16, reorderPoint: 6, vendor: 'NAPA' },
    { id: 'p_oxsensor', name: 'O2 Sensor', sku: 'OX-900', category: 'Electrical', cost: 32, price: 79.99, qtyOnHand: 6, reorderPoint: 3, vendor: 'AutoZone' },
    { id: 'p_brakefluid', name: 'Brake Fluid (qt)', sku: 'BF-1000', category: 'Fluids', cost: 5, price: 13.99, qtyOnHand: 14, reorderPoint: 5, vendor: 'NAPA' },
    { id: 'p_lugnuts', name: 'Lug Nuts (set)', sku: 'LN-1100', category: 'Tires', cost: 6, price: 14.99, qtyOnHand: 20, reorderPoint: 6, vendor: "O'Reilly" },
    { id: 'p_thermostat', name: 'Thermostat', sku: 'TH-1200', category: 'Engine', cost: 11, price: 29.99, qtyOnHand: 9, reorderPoint: 4, vendor: 'NAPA' },
    { id: 'p_headlight', name: 'Headlight Bulb', sku: 'HL-1300', category: 'Electrical', cost: 5, price: 14.99, qtyOnHand: 17, reorderPoint: 5, vendor: 'AutoZone' },
    { id: 'p_tirevalve', name: 'Tire Valve Stems (set)', sku: 'TV-1400', category: 'Tires', cost: 3, price: 8.99, qtyOnHand: 30, reorderPoint: 8, vendor: "O'Reilly" },
  ];
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
  ];
  db.saveInvoices(invoices);

  // link invoiceId back onto the closed/invoiced ROs
  jobs.find(j => j.id === 'j_1046').invoiceId = 'inv_1001';
  jobs.find(j => j.id === 'j_1047').invoiceId = 'inv_1002';
  db.saveJobs(jobs);

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
}
