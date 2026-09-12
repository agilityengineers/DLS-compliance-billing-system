/* ============================================================================
   Durable Life Skills — HIRING & ONBOARDING DATA
   Applicant tracking, configurable credentialing-requirements registry,
   and staff credentialing records. Fictional demo data (Georgia / DSP roles).
   ============================================================================ */

// ---- Pipeline stages (ordered) --------------------------------------------
const STAGES = [
  { id: 'applied',     label: 'Applied',                short: 'Applied',     color: '#64748B' },
  { id: 'screening',   label: 'Screening',              short: 'Screening',   color: '#2F80C2' },
  { id: 'interview',   label: 'Interview',              short: 'Interview',   color: '#7A4FD0' },
  { id: 'offer',       label: 'Offer',                  short: 'Offer',       color: '#C9761A' },
  { id: 'background',  label: 'Background & Credentialing', short: 'Credentialing', color: '#B07A12' },
  { id: 'hired',       label: 'Hired',                  short: 'Hired',       color: '#1F8A5B' },
  { id: 'active',      label: 'Active',                 short: 'Active',      color: '#187048' },
];

// ---- Requirements registry (THE configurable toggle engine) ---------------
// `required` is admin-togglable. `gating` = blocks a hire from going Active.
// `automated` = the system can auto-trigger/verify this. `appliesTo` = roles.
// This registry is foundational: credentialing checklists, the "Active" gate,
// and (over time) scheduling/billing eligibility all read from it.
const REQUIREMENTS = [
  { id: 'r_bg',     label: 'Criminal background check',         category: 'Background & Eligibility', required: true,  gating: true,  automated: true,  vendor: 'Checkr',          appliesTo: ['DSP','Supervisor','Billing','HR','Admin'], renews: null,        note: 'Auto-ordered when applicant enters Background stage.' },
  { id: 'r_reg',    label: 'GA Nurse Aide / Abuse registry',    category: 'Background & Eligibility', required: true,  gating: true,  automated: true,  vendor: 'GA Registry',     appliesTo: ['DSP','Supervisor'],                       renews: '24 mo',     note: 'Screens state abuse & exclusion lists.' },
  { id: 'r_i9',     label: 'Work eligibility (I-9 / E-Verify)', category: 'Background & Eligibility', required: true,  gating: true,  automated: true,  vendor: 'E-Verify',        appliesTo: ['DSP','Supervisor','Billing','HR','Admin'], renews: null,        note: 'Federal employment eligibility verification.' },
  { id: 'r_tb',     label: 'TB test / health screening',        category: 'Health',                   required: true,  gating: true,  automated: false, vendor: null,              appliesTo: ['DSP','Supervisor'],                       renews: '12 mo',     note: 'Provider uploads cleared result.' },
  { id: 'r_cpr',    label: 'CPR / First Aid certification',     category: 'Health',                   required: true,  gating: true,  automated: false, vendor: null,              appliesTo: ['DSP'],                                    renews: '24 mo',     note: 'Certificate upload + expiry tracked.' },
  { id: 'r_dbhdd',  label: 'DBHDD core training',               category: 'Training',                 required: true,  gating: true,  automated: false, vendor: 'LMS',             appliesTo: ['DSP','Supervisor'],                       renews: '12 mo',     note: 'Direct-support core competencies.' },
  { id: 'r_hipaa',  label: 'HIPAA privacy & security training', category: 'Training',                 required: true,  gating: true,  automated: false, vendor: 'LMS',             appliesTo: ['DSP','Supervisor','Billing','HR','Admin'], renews: '12 mo',     note: 'Required before any PHI access.' },
  { id: 'r_ane',    label: 'Abuse, Neglect & Exploitation',     category: 'Training',                 required: true,  gating: true,  automated: false, vendor: 'LMS',             appliesTo: ['DSP','Supervisor'],                       renews: '12 mo',     note: 'Mandated reporter training.' },
  { id: 'r_license',label: "Driver's license",                  category: 'Driving',                  required: false, gating: false, automated: false, vendor: null,              appliesTo: ['DSP'],                                    renews: null,        note: 'For community transport roles only.' },
  { id: 'r_ins',    label: 'Auto insurance (current)',          category: 'Driving',                  required: false, gating: false, automated: false, vendor: null,              appliesTo: ['DSP'],                                    renews: '6 mo',      note: 'Proof of coverage for transport.' },
];

// helper — which requirements gate a given role, honoring the `required` toggle
function gatingReqsFor(role, reqs) {
  return (reqs || REQUIREMENTS).filter(r => r.required && r.gating && r.appliesTo.includes(role));
}

// ---- Applicants -----------------------------------------------------------
// `app` holds the captured employment-application fields.
// `creds` maps requirement id -> { status: 'complete'|'pending'|'in_progress'|'failed'|'waived', date, note }
const APPLICANTS = [
  {
    id: 'ap1', first: 'Jordan', last: 'Maddox', name: 'Jordan Maddox', initials: 'JM', color: '#2F80C2',
    role: 'DSP', position: 'Direct Support Professional', stage: 'background', source: 'Referral', referredBy: 'Alicia Romero',
    appliedOn: '2026-05-22', signedOn: '2026-05-22', expiresOn: '2026-07-21', daysToExpiry: 44, channel: 'Digital form',
    rating: 4, eligibleUS: true, ageOk: true, terminated: false, canStart: '2026-06-15', overtime: true, essentialFns: true,
    app: {
      email: 'jordan.maddox@email.com', phone: '(770) 555-0148', altPhone: '(678) 555-0102',
      address: '218 Green St, Gainesville, GA 30501',
      availability: { Sun: '—', Mon: 'All', Tue: 'All', Wed: '1st shift', Thu: 'All', Fri: 'All', Sat: 'Mornings' },
      cannotWork: 'None', currentlyEmployed: true, mayContact: false,
      education: [
        { school: 'North Hall High School, Gainesville GA', credits: '—', degree: 'Diploma', major: 'General', grad: '2018' },
        { school: 'Lanier Technical College', credits: '32', degree: 'In progress', major: 'Human Services', grad: '—' },
      ],
      history: [
        { employer: 'Sunrise Senior Living', dates: '2022–2025', title: 'Caregiver', city: 'Oakwood, GA', supervisor: 'M. Chase, Care Lead', phone: '(770) 555-0190', reason: 'Seeking IDD focus', work: 'ADLs, medication reminders, documentation' },
        { employer: 'Kroger #412', dates: '2019–2022', title: 'Floral associate', city: 'Gainesville, GA', supervisor: 'T. Boyd, Mgr', phone: '(770) 555-0177', reason: 'Career change', work: 'Customer service, stocking' },
      ],
      skills: 'CPR certified, fluent in Spanish, 3 yrs caregiving with adults with IDD.',
      references: [
        { name: 'Maria Chase', contact: 'mchase@email.com · (770) 555-0190', rel: 'Former supervisor', years: '3' },
        { name: 'Devin Pratt', contact: 'dpratt@email.com', rel: 'Colleague', years: '4' },
        { name: 'Sandra Lowe', contact: '(678) 555-0133', rel: 'Mentor', years: '6' },
      ],
    },
    creds: {
      r_bg: { status: 'in_progress', date: '2026-06-03', note: 'Checkr report pending — avg 2 days' },
      r_reg: { status: 'complete', date: '2026-06-03' },
      r_i9: { status: 'complete', date: '2026-06-02' },
      r_tb: { status: 'pending' },
      r_cpr: { status: 'complete', date: '2026-05-30', note: 'Expires 2028-05' },
      r_dbhdd: { status: 'in_progress', date: '2026-06-04', note: '60% complete' },
      r_hipaa: { status: 'complete', date: '2026-06-01' },
      r_ane: { status: 'pending' },
    },
  },
  {
    id: 'ap2', first: 'Camille', last: 'Foster', name: 'Camille Foster', initials: 'CF', color: '#1F8A5B',
    role: 'DSP', position: 'Direct Support Professional · Job Coach', stage: 'offer', source: 'Advertisement',
    appliedOn: '2026-05-28', signedOn: '2026-05-28', expiresOn: '2026-07-27', daysToExpiry: 50, channel: 'Digital form',
    rating: 5, eligibleUS: true, ageOk: true, terminated: false, canStart: '2026-06-20', overtime: true, essentialFns: true,
    app: {
      email: 'camille.foster@email.com', phone: '(678) 555-0166', altPhone: '',
      address: '54 Lakeview Dr, Buford, GA 30518',
      availability: { Sun: '—', Mon: 'All', Tue: 'All', Wed: 'All', Thu: 'All', Fri: '2nd shift', Sat: '—' },
      cannotWork: 'Friday evenings (class)', currentlyEmployed: false, mayContact: true,
      education: [{ school: 'University of North Georgia', credits: '120', degree: 'B.S.', major: 'Psychology', grad: '2023' }],
      history: [
        { employer: 'Easterseals North Georgia', dates: '2023–2026', title: 'Direct Support Professional', city: 'Gainesville, GA', supervisor: 'R. Gill, Program Mgr', phone: '(770) 555-0144', reason: 'Relocation closer to home', work: 'Community access, supported employment coaching, ISP data' },
      ],
      skills: 'BCBA coursework, experience with autism spectrum supports, bilingual.',
      references: [
        { name: 'Renee Gill', contact: 'rgill@email.com', rel: 'Former supervisor', years: '3' },
        { name: 'Omar Haddad', contact: '(678) 555-0120', rel: 'Colleague', years: '3' },
        { name: 'Beth Cannon', contact: 'bcannon@email.com', rel: 'Professor', years: '5' },
      ],
    },
    creds: {},
  },
  {
    id: 'ap3', first: 'Marcus', last: 'Webb', name: 'Marcus Webb', initials: 'MW', color: '#7A4FD0',
    role: 'DSP', position: 'Direct Support Professional', stage: 'interview', source: 'Walk In',
    appliedOn: '2026-06-01', signedOn: '2026-06-01', expiresOn: '2026-07-31', daysToExpiry: 54, channel: 'Paper (uploaded)',
    rating: 3, eligibleUS: true, ageOk: true, terminated: true, terminatedNote: 'Laid off — facility closed', canStart: '2026-06-09', overtime: false, essentialFns: true,
    app: {
      email: 'marcus.webb@email.com', phone: '(470) 555-0188', altPhone: '',
      address: '1207 Athens St, Jefferson, GA 30549',
      availability: { Sun: 'All', Mon: 'Afternoons', Tue: 'Afternoons', Wed: 'Afternoons', Thu: 'Afternoons', Fri: 'All', Sat: 'All' },
      cannotWork: 'Weekday mornings', currentlyEmployed: false, mayContact: true,
      education: [{ school: 'Jackson County High School', credits: '—', degree: 'Diploma', major: 'General', grad: '2015' }],
      history: [
        { employer: 'Hillside Care Center', dates: '2018–2026', title: 'Habilitation aide', city: 'Jefferson, GA', supervisor: 'P. Nguyen', phone: '(706) 555-0155', reason: 'Facility closed', work: 'Habilitation, transport, daily living supports' },
      ],
      skills: 'CDL, 8 years habilitation experience.',
      references: [
        { name: 'Paul Nguyen', contact: 'pnguyen@email.com', rel: 'Former supervisor', years: '8' },
        { name: 'Gina Ross', contact: '(706) 555-0166', rel: 'Colleague', years: '5' },
        { name: 'Henry Bo', contact: 'hbo@email.com', rel: 'Friend', years: '10' },
      ],
    },
    creds: {},
  },
  {
    id: 'ap4', first: 'Aisha', last: 'Bello', name: 'Aisha Bello', initials: 'AB', color: '#C9761A',
    role: 'DSP', position: 'Direct Support Professional', stage: 'screening', source: 'Referral', referredBy: 'Brian Okafor',
    appliedOn: '2026-06-03', signedOn: '2026-06-03', expiresOn: '2026-08-02', daysToExpiry: 56, channel: 'Digital form',
    rating: 4, eligibleUS: true, ageOk: true, terminated: false, canStart: '2026-07-01', overtime: true, essentialFns: true,
    app: {
      email: 'aisha.bello@email.com', phone: '(404) 555-0173', altPhone: '(404) 555-0174',
      address: '880 Peachtree Industrial, Suwanee, GA 30024',
      availability: { Sun: 'Mornings', Mon: 'All', Tue: 'All', Wed: 'All', Thu: 'All', Fri: 'All', Sat: '—' },
      cannotWork: 'None', currentlyEmployed: true, mayContact: false,
      education: [{ school: 'Georgia State University', credits: '90', degree: 'In progress', major: 'Social Work', grad: '—' }],
      history: [
        { employer: 'Annandale Village', dates: '2024–2026', title: 'Residential support', city: 'Suwanee, GA', supervisor: 'L. Tran', phone: '(770) 555-0199', reason: 'Growth opportunity', work: 'Residential IDD supports, documentation' },
      ],
      skills: 'Social work student, crisis de-escalation trained.',
      references: [
        { name: 'Lily Tran', contact: 'ltran@email.com', rel: 'Supervisor', years: '2' },
        { name: 'Mark Ide', contact: '(770) 555-0188', rel: 'Colleague', years: '2' },
        { name: 'Nadia Frey', contact: 'nfrey@email.com', rel: 'Professor', years: '3' },
      ],
    },
    creds: {},
  },
  {
    id: 'ap5', first: 'Trevon', last: 'Sims', name: 'Trevon Sims', initials: 'TS', color: '#2F6DA8',
    role: 'DSP', position: 'Direct Support Professional', stage: 'applied', source: 'Advertisement',
    appliedOn: '2026-06-05', signedOn: '2026-06-05', expiresOn: '2026-08-04', daysToExpiry: 58, channel: 'Digital form',
    rating: 0, eligibleUS: true, ageOk: true, terminated: false, canStart: '2026-06-30', overtime: true, essentialFns: true,
    app: {
      email: 'trevon.sims@email.com', phone: '(678) 555-0191', altPhone: '',
      address: '33 Mill Rd, Flowery Branch, GA 30542',
      availability: { Sun: '—', Mon: 'Evenings', Tue: 'Evenings', Wed: 'Evenings', Thu: 'Evenings', Fri: 'All', Sat: 'All' },
      cannotWork: 'Weekday daytime', currentlyEmployed: true, mayContact: false,
      education: [{ school: 'Flowery Branch High School', credits: '—', degree: 'Diploma', major: 'General', grad: '2021' }],
      history: [
        { employer: 'Publix', dates: '2021–2026', title: 'Customer service', city: 'Flowery Branch, GA', supervisor: 'D. Kim', phone: '(770) 555-0123', reason: 'Pursuing care career', work: 'Customer service, scheduling' },
      ],
      skills: 'Strong interpersonal skills, first job in care field.',
      references: [
        { name: 'Dana Kim', contact: 'dkim@email.com', rel: 'Manager', years: '4' },
        { name: 'Eli Vance', contact: '(770) 555-0145', rel: 'Friend', years: '6' },
        { name: 'Rosa Lane', contact: 'rlane@email.com', rel: 'Coach', years: '5' },
      ],
    },
    creds: {},
  },
  {
    id: 'ap6', first: 'Whitney', last: 'Adler', name: 'Whitney Adler', initials: 'WA', color: '#C2477E',
    role: 'DSP', position: 'Direct Support Professional', stage: 'applied', source: 'Referral', referredBy: 'Camille Foster',
    appliedOn: '2026-06-06', signedOn: '2026-06-06', expiresOn: '2026-08-05', daysToExpiry: 59, channel: 'Paper (uploaded)',
    rating: 0, eligibleUS: true, ageOk: true, terminated: false, canStart: '2026-07-07', overtime: false, essentialFns: true,
    app: {
      email: 'whitney.adler@email.com', phone: '(706) 555-0182', altPhone: '',
      address: '15 Oak Ct, Braselton, GA 30517',
      availability: { Sun: '—', Mon: 'Mornings', Tue: 'Mornings', Wed: 'Mornings', Thu: 'Mornings', Fri: 'Mornings', Sat: '—' },
      cannotWork: 'Afternoons (childcare)', currentlyEmployed: false, mayContact: true,
      education: [{ school: 'Gainesville State College', credits: '60', degree: 'Associate', major: 'Early Childhood', grad: '2019' }],
      history: [
        { employer: 'Bright Horizons', dates: '2019–2025', title: 'Childcare aide', city: 'Braselton, GA', supervisor: 'K. Pope', phone: '(706) 555-0111', reason: 'Returning to workforce', work: 'Childcare, behavior supports' },
      ],
      skills: 'Early childhood background, patient and reliable.',
      references: [
        { name: 'Kara Pope', contact: 'kpope@email.com', rel: 'Supervisor', years: '6' },
        { name: 'Tom Reed', contact: '(706) 555-0150', rel: 'Colleague', years: '5' },
        { name: 'Ann Diaz', contact: 'adiaz@email.com', rel: 'Neighbor', years: '7' },
      ],
    },
    creds: {},
  },
];

// ---- Already-hired staff with active credentialing (feeds staff roster) ----
// These became system users via the hiring pipeline. `userId` links to USERS.
const STAFF_CREDENTIALS = {
  u_dsp: { hiredOn: '2025-08-11', accountStatus: 'active', creds: {
    r_bg: { status: 'complete', date: '2025-08-01' }, r_reg: { status: 'complete', date: '2025-08-01' },
    r_i9: { status: 'complete', date: '2025-08-02' }, r_tb: { status: 'complete', date: '2026-02-10', note: 'Renews 2027-02' },
    r_cpr: { status: 'complete', date: '2025-07-20' }, r_dbhdd: { status: 'complete', date: '2025-08-09' },
    r_hipaa: { status: 'complete', date: '2025-08-05' }, r_ane: { status: 'complete', date: '2025-08-08' },
  }},
  u_sup: { hiredOn: '2024-03-04', accountStatus: 'active', creds: {
    r_bg: { status: 'complete', date: '2024-02-25' }, r_reg: { status: 'complete', date: '2024-02-25' },
    r_i9: { status: 'complete', date: '2024-02-26' }, r_tb: { status: 'expiring', date: '2025-06-30', note: 'Expires in 23 days' },
    r_cpr: { status: 'complete', date: '2024-09-15' }, r_dbhdd: { status: 'complete', date: '2024-03-02' },
    r_hipaa: { status: 'complete', date: '2024-03-01' }, r_ane: { status: 'complete', date: '2024-03-01' },
  }},
};

Object.assign(window, { STAGES, REQUIREMENTS, APPLICANTS, STAFF_CREDENTIALS, gatingReqsFor });
