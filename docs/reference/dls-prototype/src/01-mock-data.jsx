/* ============================================================================
   Durable Life Skills — Medicaid Documentation & Billing Platform
   MOCK DATA  (fictional but plausible; Georgia NOW/COMP waiver assumptions)
   ----------------------------------------------------------------------------
   ASSUMPTIONS (flagged for client review):
   - State: Georgia Medicaid, NOW & COMP waivers, billed through GAMMIS.
   - Service/procedure codes below are representative HCPCS used for IDD waiver
     services and should be validated against the current GA DBHDD fee schedule.
   - All clients, staff, IDs, claim numbers are invented for demo purposes only.
   ========================================================================== */

// ---- Staff / users (role switcher uses these) -----------------------------
const USERS = [
  { id: 'u_dsp',   name: 'Alicia Romero',  role: 'DSP',        title: 'Direct Support Professional · Job Coach', initials: 'AR', color: '#2F80C2' },
  { id: 'u_sup',   name: 'Brian Okafor',   role: 'Supervisor', title: 'Supervisor / QA Reviewer',               initials: 'BO', color: '#1F8A5B' },
  { id: 'u_bill',  name: 'Denise Park',    role: 'Billing',    title: 'Billing Administrator',                  initials: 'DP', color: '#7A4FD0' },
  { id: 'u_hr',    name: 'Priya Nair',     role: 'HR',         title: 'HR / Hiring Manager',                    initials: 'PN', color: '#C2477E' },
  { id: 'u_admin', name: 'Melissa Torres', role: 'Admin',      title: 'Agency Admin · CEO & Founder',           initials: 'MT', color: '#C9761A' },
];

const ROLE_LABEL = {
  DSP: 'Direct Support Professional',
  Supervisor: 'Supervisor / QA',
  Billing: 'Billing Admin',
  HR: 'HR / Hiring Manager',
  Admin: 'Agency Admin',
};

// ---- Service / procedure codes (GA IDD waiver — representative) ------------
const SERVICE_CODES = [
  { code: 'H2025', mod: 'U4', name: 'Supported Employment — Ongoing',  unit: '15 min', rate: 9.42,  evv: true,  waiver: 'COMP' },
  { code: 'T2019', mod: 'U6', name: 'Supported Employment — Individual', unit: '15 min', rate: 10.18, evv: true,  waiver: 'COMP' },
  { code: 'H2014', mod: 'U3', name: 'Community Living Support (CLS)',   unit: '15 min', rate: 6.88,  evv: true,  waiver: 'NOW'  },
  { code: 'T2021', mod: 'U1', name: 'Community Access — Individual',    unit: '15 min', rate: 6.41,  evv: true,  waiver: 'NOW'  },
  { code: 'T2015', mod: 'U7', name: 'Prevocational Services',          unit: '15 min', rate: 5.97,  evv: false, waiver: 'COMP' },
  { code: 'H2023', mod: 'U5', name: 'Supported Employment — Job Dev.',  unit: '15 min', rate: 11.04, evv: true,  waiver: 'COMP' },
];

// ---- Clients --------------------------------------------------------------
const CLIENTS = [
  {
    id: 'c1', name: 'Marcus Bell', first: 'Marcus', dob: '2002-03-14', age: 24,
    medicaid: 'GA493201887', waiver: 'COMP', initials: 'MB', color: '#2F80C2',
    dx: [{ code: 'F84.0', label: 'Autism spectrum disorder' }, { code: 'F41.1', label: 'Generalized anxiety disorder' }],
    coordinator: 'Support Coord. — Lanier Region',
    auth: 'a1', status: 'Active',
    goals: ['g1', 'g2'],
    workReq: { applicable: true, status: 'Meeting', exemption: null, hoursMonth: 86, hoursReq: 80 },
    address: 'Gainesville, GA 30501', phone: '(770) 555-0142',
    meds: ['Sertraline 50mg', 'Melatonin 3mg'],
  },
  {
    id: 'c2', name: 'Tanya Whitfield', first: 'Tanya', dob: '1994-11-02', age: 31,
    medicaid: 'GA771540023', waiver: 'NOW', initials: 'TW', color: '#1F8A5B',
    dx: [{ code: 'F71', label: 'Moderate intellectual disabilities' }],
    coordinator: 'Support Coord. — Lanier Region',
    auth: 'a2', status: 'Active',
    goals: ['g3', 'g4'],
    workReq: { applicable: true, status: 'Exempt', exemption: 'Medically frail / disabled (1905(a))', hoursMonth: null, hoursReq: 80 },
    address: 'Oakwood, GA 30566', phone: '(678) 555-0199',
    meds: ['Levetiracetam 500mg', 'Risperidone 1mg'],
  },
  {
    id: 'c3', name: 'Devon Pierce', first: 'Devon', dob: '2006-07-21', age: 19,
    medicaid: 'GA660912745', waiver: 'COMP', initials: 'DP', color: '#C9761A',
    dx: [{ code: 'Q90.9', label: 'Down syndrome, unspecified' }],
    coordinator: 'Support Coord. — Lanier Region',
    auth: 'a3', status: 'Active',
    goals: ['g5'],
    workReq: { applicable: true, status: 'Exempt', exemption: 'Disabled — SSI recipient', hoursMonth: null, hoursReq: 80 },
    address: 'Flowery Branch, GA 30542', phone: '(470) 555-0177',
    meds: ['Levothyroxine 50mcg'],
  },
  {
    id: 'c4', name: 'Rosa Iglesias', first: 'Rosa', dob: '1998-01-30', age: 28,
    medicaid: 'GA208334610', waiver: 'NOW', initials: 'RI', color: '#7A4FD0',
    dx: [{ code: 'G80.9', label: 'Cerebral palsy, unspecified' }],
    coordinator: 'Support Coord. — Lanier Region',
    auth: 'a4', status: 'Active',
    goals: ['g6'],
    workReq: { applicable: true, status: 'Action needed', exemption: null, hoursMonth: 62, hoursReq: 80 },
    address: 'Buford, GA 30518', phone: '(770) 555-0110',
    meds: ['Baclofen 10mg'],
  },
];

// ---- ISP / IPP goals (notes link to these measurable objectives) ----------
const GOALS = {
  g1: { id: 'g1', client: 'c1', area: 'Supported Employment',
        text: 'Marcus will independently complete his opening stocking routine at the Kroger floral department with no more than 1 verbal prompt, in 4 of 5 observed shifts.',
        measure: 'Prompts per shift', baseline: '3 prompts', target: '≤1 prompt', progress: 72 },
  g2: { id: 'g2', client: 'c1', area: 'Community Navigation',
        text: 'Marcus will use the Hall Area Transit fixed route to travel to his job site, demonstrating correct stop identification in 3 consecutive trips.',
        measure: 'Independent trips', baseline: '0', target: '3 consecutive', progress: 66 },
  g3: { id: 'g3', client: 'c2', area: 'Daily Living',
        text: 'Tanya will prepare a simple two-step meal following a picture recipe with supervision faded to standby support across 4 of 5 sessions.',
        measure: 'Support level', baseline: 'Full physical', target: 'Standby', progress: 58 },
  g4: { id: 'g4', client: 'c2', area: 'Community Access',
        text: 'Tanya will make a purchase at a community store, identifying the correct bill to pay, in 3 of 4 outings.',
        measure: 'Correct trials', baseline: '1 of 4', target: '3 of 4', progress: 45 },
  g5: { id: 'g5', client: 'c3', area: 'Prevocational',
        text: 'Devon will sustain on-task work behavior for 20-minute intervals during prevocational tasks with no more than 2 redirections.',
        measure: 'On-task minutes', baseline: '8 min', target: '20 min', progress: 80 },
  g6: { id: 'g6', client: 'c4', area: 'Self-Advocacy',
        text: 'Rosa will initiate a request for assistance using her communication device in 4 of 5 novel community settings.',
        measure: 'Independent initiations', baseline: '2 of 5', target: '4 of 5', progress: 51 },
};

// ---- Authorizations (units consumed vs authorized) ------------------------
const AUTHORIZATIONS = [
  { id: 'a1', client: 'c1', service: 'H2025', label: 'Supported Employment — Ongoing', waiver: 'COMP',
    authNo: 'PA-2026-44817', units: 1920, used: 1452, period: '2026-01-01 → 2026-12-31', expires: '2026-12-31', daysLeft: 208 },
  { id: 'a2', client: 'c2', service: 'H2014', label: 'Community Living Support', waiver: 'NOW',
    authNo: 'PA-2026-44902', units: 2400, used: 2207, period: '2026-01-01 → 2026-12-31', expires: '2026-12-31', daysLeft: 208 },
  { id: 'a3', client: 'c3', service: 'T2015', label: 'Prevocational Services', waiver: 'COMP',
    authNo: 'PA-2026-45110', units: 1600, used: 880, period: '2026-01-01 → 2026-12-31', expires: '2026-12-31', daysLeft: 208 },
  { id: 'a4', client: 'c4', service: 'H2014', label: 'Community Living Support', waiver: 'NOW',
    authNo: 'PA-2026-43355', units: 1200, used: 1188, period: '2026-01-01 → 2026-06-30', expires: '2026-06-30', daysLeft: 24 },
];

// ---- Progress notes (move through the documentation→billing pipeline) ------
// status: draft | submitted | approved | rejected | billed
const NOTES = [
  { id: 'n1', client: 'c1', staff: 'u_dsp', service: 'H2025', goals: ['g1'],
    date: '2026-06-05', timeIn: '09:02', timeOut: '12:14', units: 12, status: 'submitted',
    evv: { gps: '34.2979, -83.8241', site: 'Kroger #412 — Dawsonville Hwy', device: 'iPhone · DLS-Field-08', method: 'GPS + geofence ✓' },
    flags: [],
    summary: 'Job coaching at floral department. Marcus completed opening stock routine with 1 verbal prompt (down from 3). Reviewed closing checklist. Positive interaction with shift lead.',
    goalProgress: { g1: 'Met criterion — 1 prompt' } },
  { id: 'n2', client: 'c2', staff: 'u_dsp', service: 'H2014', goals: ['g3'],
    date: '2026-06-05', timeIn: '13:30', timeOut: '15:30', units: 8, status: 'submitted',
    evv: { gps: '34.2266, -83.8730', site: 'Client home — Oakwood, GA', device: 'iPhone · DLS-Field-08', method: 'GPS + geofence ✓' },
    flags: [{ level: 'warn', text: 'Note submitted 36h after service — review timeliness' }],
    summary: 'Meal-prep skill building. Tanya followed picture recipe for a two-step snack with standby support on 3 of 4 steps. Faded physical prompts on measuring.',
    goalProgress: { g3: 'Progressing — standby on 3/4 steps' } },
  { id: 'n3', client: 'c3', staff: 'u_dsp', service: 'T2015', goals: ['g5'],
    date: '2026-06-04', timeIn: '10:00', timeOut: '13:00', units: 12, status: 'approved',
    evv: { gps: '34.1812, -83.8855', site: 'DLS Prevoc Center — Flowery Branch', device: 'iPad · DLS-Center-02', method: 'GPS + geofence ✓' },
    flags: [],
    summary: 'Prevocational assembly task. Devon sustained on-task behavior for 18-minute intervals with 2 redirections. Strong improvement in sorting accuracy.',
    goalProgress: { g5: 'Near target — 18 of 20 min' }, approvedBy: 'u_sup', approvedAt: '2026-06-05 08:40' },
  { id: 'n4', client: 'c1', staff: 'u_dsp', service: 'H2025', goals: ['g2'],
    date: '2026-06-03', timeIn: '08:45', timeOut: '10:15', units: 6, status: 'approved',
    evv: { gps: '34.2979, -83.8241', site: 'Hall Area Transit — Route 20', device: 'iPhone · DLS-Field-08', method: 'GPS + geofence ✓' },
    flags: [],
    summary: 'Travel training on fixed route to job site. Marcus identified correct stop independently on 2nd consecutive trip.',
    goalProgress: { g2: 'Progressing — 2 consecutive trips' }, approvedBy: 'u_sup', approvedAt: '2026-06-04 09:12' },
  { id: 'n5', client: 'c4', staff: 'u_dsp', service: 'H2014', goals: ['g6'],
    date: '2026-06-02', timeIn: '14:00', timeOut: '16:00', units: 8, status: 'rejected',
    evv: { gps: '—', site: 'Buford Community Library', device: 'iPhone · DLS-Field-08', method: 'Manual entry ⚠' },
    flags: [{ level: 'error', text: 'EVV missing GPS capture — manual entry requires supervisor reason code' }],
    summary: 'Community outing to library. Rosa initiated a request for assistance using device in 3 of 5 settings.',
    goalProgress: { g6: 'Progressing — 3 of 5 settings' }, rejectedBy: 'u_sup', rejectReason: 'EVV exception not documented — re-submit with reason code 09 (device failure).' },
];

// ---- Claims (837P) and remittance (835) -----------------------------------
// status: ready | submitted | accepted | paid | denied
const CLAIMS = [
  { id: 'cl1', claimNo: '837P-26159-0021', client: 'c3', note: 'n3', service: 'T2015', units: 12,
    charge: 71.64, status: 'paid', dos: '2026-06-04', payer: 'GA Medicaid (GAMMIS)',
    submitted: '2026-06-05', paid: 78.0, remit: 'r1' },
  { id: 'cl2', claimNo: '837P-26159-0022', client: 'c1', note: 'n4', service: 'H2025', units: 6,
    charge: 56.52, status: 'accepted', dos: '2026-06-03', payer: 'GA Medicaid (GAMMIS)',
    submitted: '2026-06-05', paid: null, remit: null },
  { id: 'cl3', claimNo: '837P-26152-0014', client: 'c2', note: null, service: 'H2014', units: 10,
    charge: 68.80, status: 'denied', dos: '2026-05-28', payer: 'GA Medicaid (GAMMIS)',
    submitted: '2026-05-29', paid: 0, remit: 'r2',
    denial: { code: 'CO-197', text: 'Precertification/authorization absent — units exceed authorized balance.' } },
];

const REMITS = [
  { id: 'r1', traceNo: 'EFT-2026-0061142', date: '2026-06-06', payer: 'GA Medicaid (GAMMIS)',
    amount: 78.00, claims: ['cl1'], status: 'Posted' },
  { id: 'r2', traceNo: 'EFT-2026-0060880', date: '2026-06-01', payer: 'GA Medicaid (GAMMIS)',
    amount: 0.00, claims: ['cl3'], status: 'Denied — see CARC CO-197' },
];

// ---- Today's schedule (DSP) -----------------------------------------------
const SCHEDULE = [
  { id: 's1', client: 'c1', service: 'H2025', start: '09:00', end: '12:15', site: 'Kroger #412', status: 'completed' },
  { id: 's2', client: 'c2', service: 'H2014', start: '13:30', end: '15:30', site: 'Client home', status: 'completed' },
  { id: 's3', client: 'c4', service: 'H2014', start: '16:00', end: '18:00', site: 'Buford Library', status: 'upcoming' },
];

// ---- Audit trail (immutable log sample) -----------------------------------
const AUDIT = [
  { ts: '2026-06-05 12:14:08', actor: 'Alicia Romero', role: 'DSP', action: 'NOTE_SIGNED', target: 'Note n1 · Marcus Bell', detail: 'E-signature applied, record locked', ip: '10.4.22.18' },
  { ts: '2026-06-05 12:13:55', actor: 'Alicia Romero', role: 'DSP', action: 'EVV_CLOCK_OUT', target: 'Visit · Kroger #412', detail: 'GPS 34.2979,-83.8241 · geofence match', ip: '10.4.22.18' },
  { ts: '2026-06-05 09:02:11', actor: 'Alicia Romero', role: 'DSP', action: 'EVV_CLOCK_IN', target: 'Visit · Kroger #412', detail: 'GPS 34.2979,-83.8241 · device DLS-Field-08', ip: '10.4.22.18' },
  { ts: '2026-06-05 08:40:02', actor: 'Brian Okafor', role: 'Supervisor', action: 'NOTE_APPROVED', target: 'Note n3 · Devon Pierce', detail: 'QA review passed, eligible for billing', ip: '10.4.10.6' },
  { ts: '2026-06-05 08:33:41', actor: 'Brian Okafor', role: 'Supervisor', action: 'NOTE_REJECTED', target: 'Note n5 · Rosa Iglesias', detail: 'Reason: EVV exception not documented', ip: '10.4.10.6' },
  { ts: '2026-06-05 06:00:00', actor: 'System', role: 'System', action: 'CLAIM_BATCH', target: '837P batch 26159', detail: '2 claims assembled from approved notes', ip: 'svc' },
];

Object.assign(window, {
  USERS, ROLE_LABEL, SERVICE_CODES, CLIENTS, GOALS, AUTHORIZATIONS,
  NOTES, CLAIMS, REMITS, SCHEDULE, AUDIT,
});
