/* Durable Life Skills — desktop app shell (sidebar, topbar, role switcher) */

const NAV = [
  { id: 'dashboard',     label: 'Dashboard',       icon: 'dashboard', roles: ['DSP','Supervisor','Billing','HR','Admin'] },
  { id: 'schedule',      label: 'My Schedule',     icon: 'calendar',  roles: ['DSP'] },
  { id: 'documentation', label: 'Documentation',   icon: 'doc',       roles: ['DSP','Supervisor','Admin'] },
  { id: 'review',        label: 'Review Queue',    icon: 'checkCircle', roles: ['Supervisor','Admin'], badge: 'reviewCount' },
  { id: 'billing',       label: 'Billing & Claims',icon: 'billing',   roles: ['Billing','Admin'], badge: 'denialCount' },
  { id: 'remittance',    label: 'Remittance (835)',icon: 'money',     roles: ['Billing','Admin'] },
  { id: 'authorizations',label: 'Authorizations',  icon: 'clipboard', roles: ['Supervisor','Billing','Admin'], badge: 'authAlert' },
  { id: 'compliance',    label: 'Compliance',      icon: 'shield',    roles: ['Supervisor','Billing','Admin'] },
  { id: 'hiring',        label: 'Hiring',          icon: 'briefcase', roles: ['HR','Admin'], badge: 'newApplicants' },
  { id: 'staff',         label: 'Staff & Credentialing', icon: 'fingerprint', roles: ['HR','Admin'], badge: 'credAlert' },
  { id: 'requirements',  label: 'Requirements',    icon: 'grid',      roles: ['HR','Admin'] },
  { id: 'clients',       label: 'Clients',         icon: 'users',     roles: ['DSP','Supervisor','Billing','Admin'] },
  { id: 'reports',       label: 'Reports',         icon: 'chart',     roles: ['Billing','Admin'] },
];

const SCREEN_TITLE = {
  dashboard: 'Dashboard', schedule: 'My Schedule', documentation: 'Documentation',
  review: 'Supervisor Review Queue', billing: 'Billing & Claims', remittance: 'Remittance & Reconciliation',
  authorizations: 'Service Authorizations', compliance: 'Compliance & Audit', clients: 'Clients',
  reports: 'Reports & Analytics', note: 'Progress Note', client: 'Client Record',
  hiring: 'Hiring Pipeline', applicant: 'Applicant', staff: 'Staff & Credentialing',
  staffMember: 'Staff Member', requirements: 'Credentialing Requirements',
};

function AppShell() {
  const ctx = React.useContext(window.AppCtx);
  const { user, screen, setScreen, setUser, notes, claims, openMobile } = ctx;
  const [switching, setSwitching] = React.useState(false);

  const reviewCount = notes.filter(n => n.status === 'submitted').length;
  const denialCount = claims.filter(c => c.status === 'denied').length;
  const authAlert = window.AUTHORIZATIONS.filter(a => a.daysLeft <= 30 || a.used / a.units >= 0.95).length;
  const newApplicants = (ctx.applicants || []).filter(a => a.stage === 'applied').length;
  const credAlert = (ctx.applicants || []).filter(a => a.stage === 'background').length;
  const badges = { reviewCount, denialCount, authAlert, newApplicants, credAlert };

  const items = NAV.filter(n => n.roles.includes(user.role));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--app-bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 248, flex: 'none', background: 'linear-gradient(180deg,#22405C 0%, #1B3348 100%)',
        display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh',
      }}>
        <div style={{ padding: '20px 18px 14px' }}><Wordmark light /></div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {items.map(it => {
            const active = screen === it.id || (screen === 'note' && it.id === 'documentation') || (screen === 'client' && it.id === 'clients') || (screen === 'applicant' && it.id === 'hiring') || (screen === 'staffMember' && it.id === 'staff');
            const bv = it.badge ? badges[it.badge] : 0;
            const dangerBadge = it.badge === 'denialCount' || it.badge === 'authAlert' || it.badge === 'credAlert';
            return (
              <button key={it.id} onClick={() => setScreen(it.id)} style={{
                display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
                padding: '10px 12px', marginBottom: 3, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: 'none', fontSize: 13.5, fontWeight: 600,
                background: active ? 'rgba(255,168,0,.16)' : 'transparent',
                color: active ? '#FFD27A' : 'rgba(255,255,255,.74)',
                transition: 'background .15s, color .15s',
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,.06)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name={it.icon} size={18} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {bv > 0 && <span style={{
                  background: dangerBadge ? '#E2674F' : 'var(--amber)',
                  color: dangerBadge ? '#fff' : '#3a2600',
                  fontSize: 11, fontWeight: 800, minWidth: 19, height: 19, borderRadius: 999,
                  display: 'grid', placeItems: 'center', padding: '0 5px',
                }}>{bv}</span>}
              </button>
            );
          })}

          <button onClick={openMobile} style={{
            display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
            padding: '10px 12px', marginTop: 10, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: '1px dashed rgba(255,255,255,.2)', fontSize: 13, fontWeight: 700,
            background: 'transparent', color: 'rgba(255,255,255,.7)',
          }}>
            <Icon name="phone" size={17} /><span style={{ flex: 1 }}>Field app (mobile)</span>
            <Icon name="arrow" size={15} />
          </button>
        </nav>

        {/* User card + role switcher */}
        <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,.08)', position: 'relative' }}>
          {switching && (
            <div style={{ position: 'absolute', bottom: 'calc(100% - 4px)', left: 12, right: 12, background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(10,25,45,.35)', padding: 7, zIndex: 30 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.08em', padding: '6px 9px' }}>SWITCH ROLE (DEMO)</div>
              {window.USERS.map(u => (
                <button key={u.id} onClick={() => { setUser(u); setSwitching(false); setScreen('dashboard'); }} style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 9px', borderRadius: 10,
                  border: 'none', background: u.id === user.id ? 'var(--blue-50)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                }}
                  onMouseEnter={e => { if (u.id !== user.id) e.currentTarget.style.background = '#F4F7FA'; }}
                  onMouseLeave={e => { if (u.id !== user.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Avatar initials={u.initials} color={u.color} size={32} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{u.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.title}</div>
                  </div>
                  {u.id === user.id && <Icon name="check" size={16} color="var(--blue)" />}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setSwitching(s => !s)} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px', borderRadius: 12,
            border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.05)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}>
            <Avatar initials={user.initials} color={user.color} size={36} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>{window.ROLE_LABEL[user.role]}</div>
            </div>
            <Icon name="chevronDown" size={16} color="rgba(255,255,255,.6)" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 64, flex: 'none', background: 'rgba(255,255,255,.85)', backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px',
        }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{SCREEN_TITLE[screen] || 'Dashboard'}</h1>
          <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, background: 'var(--blue-50)', padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>
            Lanier Region · NOW / COMP
          </span>
          <div style={{ flex: 1 }} />
          <div style={{ position: 'relative', width: 248 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><Icon name="search" size={16} color="#94A3B5" /></span>
            <input placeholder="Search clients, notes, claims…" style={{
              width: '100%', padding: '9px 12px 9px 36px', fontSize: 13, fontFamily: 'inherit',
              borderRadius: 10, border: '1px solid var(--line)', background: '#fff', outline: 'none', boxSizing: 'border-box', color: 'var(--ink)',
            }} />
          </div>
          <button style={iconBtn} title="Notifications"><Icon name="bell" size={19} color="var(--navy)" /><span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', border: '1.5px solid #fff' }} /></button>
          <button style={iconBtn} title="Sign out" onClick={() => ctx.logout()}><Icon name="logout" size={18} color="var(--navy)" /></button>
        </header>

        <main style={{ flex: 1, padding: '26px 28px 48px', maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <window.Screen />
        </main>
      </div>
    </div>
  );
}

const iconBtn = { position: 'relative', width: 38, height: 38, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' };

window.AppShell = AppShell;
window.NAV = NAV;
