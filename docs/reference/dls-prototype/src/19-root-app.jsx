/* Durable Life Skills — root app: state, context, screen router */
window.AppCtx = React.createContext(null);

function ModuleStub({ name, icon, blurb }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: 420 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--blue-50)', display: 'grid', placeItems: 'center', margin: '0 auto 18px', color: 'var(--navy)' }}>
          <Icon name={icon} size={30} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>{name}</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.55, margin: 0 }}>{blurb}</p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 16, background: '#FFF4DE', color: '#9A6B00', padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700 }}>
          <Icon name="sparkle" size={14} /> Building this module next
        </div>
      </div>
    </div>
  );
}

function Screen() {
  const ctx = React.useContext(window.AppCtx);
  switch (ctx.screen) {
    case 'dashboard':      return <Dashboard />;
    case 'documentation':  return window.Documentation ? <window.Documentation /> : stub('Documentation', 'doc');
    case 'note':           return window.NoteEditor ? <window.NoteEditor /> : stub('Progress Note', 'pen');
    case 'review':         return window.ReviewQueue ? <window.ReviewQueue /> : stub('Review Queue', 'checkCircle');
    case 'billing':        return window.Billing ? <window.Billing /> : stub('Billing & Claims', 'billing');
    case 'remittance':     return window.Remittance ? <window.Remittance /> : stub('Remittance', 'money');
    case 'authorizations': return window.Authorizations ? <window.Authorizations /> : stub('Authorizations', 'clipboard');
    case 'compliance':     return window.Compliance ? <window.Compliance /> : stub('Compliance', 'shield');
    case 'clients':        return window.Clients ? <window.Clients /> : stub('Clients', 'users');
    case 'client':         return window.ClientDetail ? <window.ClientDetail /> : stub('Client Record', 'users');
    case 'reports':        return window.Reports ? <window.Reports /> : stub('Reports', 'chart');
    case 'schedule':       return window.Schedule ? <window.Schedule /> : stub('My Schedule', 'calendar');
    case 'hiring':         return window.Hiring ? <window.Hiring /> : stub('Hiring', 'briefcase');
    case 'applicant':      return window.ApplicantDetail ? <window.ApplicantDetail /> : stub('Applicant', 'users');
    case 'staff':          return window.Staff ? <window.Staff /> : stub('Staff & Credentialing', 'shield');
    case 'staffMember':    return window.StaffDetail ? <window.StaffDetail /> : stub('Staff member', 'users');
    case 'requirements':   return window.Requirements ? <window.Requirements /> : stub('Requirements', 'clipboard');
    default:               return <Dashboard />;
  }
}
function stub(name, icon) {
  return <ModuleStub name={name} icon={icon} blurb="This module is part of the build. The interactive version is coming in the next pass of the prototype." />;
}
window.Screen = Screen;

function App() {
  const [user, setUser] = React.useState(null);
  const [screen, setScreen] = React.useState('dashboard');
  const [notes, setNotes] = React.useState(window.NOTES);
  const [claims, setClaims] = React.useState(window.CLAIMS);
  const [remits, setRemits] = React.useState(window.REMITS);
  const [selectedNote, setSelectedNote] = React.useState(null);
  const [selectedClient, setSelectedClient] = React.useState(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  // hiring & onboarding state
  const [applicants, setApplicants] = React.useState(window.APPLICANTS);
  const [requirements, setRequirements] = React.useState(window.REQUIREMENTS);
  const [staffCreds, setStaffCreds] = React.useState(window.STAFF_CREDENTIALS);
  const [users, setUsers] = React.useState(window.USERS);
  const [selectedApplicant, setSelectedApplicant] = React.useState(null);
  const [selectedStaff, setSelectedStaff] = React.useState(null);
  const [publicView, setPublicView] = React.useState('login'); // login | careers

  // persist session for refresh-friendliness
  React.useEffect(() => {
    const saved = localStorage.getItem('dls_user');
    if (saved) { const u = window.USERS.find(x => x.id === saved); if (u) setUser(u); }
  }, []);

  const login = (uid) => { const u = window.USERS.find(x => x.id === uid); setUser(u); localStorage.setItem('dls_user', uid); setScreen('dashboard'); };
  const logout = () => { setUser(null); localStorage.removeItem('dls_user'); };

  const openNote = (id) => { setSelectedNote(id); setScreen('note'); };
  const openClient = (id) => { setSelectedClient(id); setScreen('client'); };
  const openApplicant = (id) => { setSelectedApplicant(id); setScreen('applicant'); };
  const openStaff = (id) => { setSelectedStaff(id); setScreen('staffMember'); };

  const ctx = {
    user, setUser: (u) => { setUser(u); localStorage.setItem('dls_user', u.id); },
    screen, setScreen, notes, setNotes, claims, setClaims, remits, setRemits,
    selectedNote, setSelectedNote, selectedClient, setSelectedClient,
    applicants, setApplicants, requirements, setRequirements,
    staffCreds, setStaffCreds, users, setUsers,
    selectedApplicant, setSelectedApplicant, selectedStaff, setSelectedStaff,
    openNote, openClient, openApplicant, openStaff, login, logout,
    openMobile: () => setMobileOpen(true), closeMobile: () => setMobileOpen(false), mobileOpen,
  };

  if (!user) {
    if (publicView === 'careers') return <window.CareersForm onBack={() => setPublicView('login')} />;
    return <LoginScreen onLogin={login} onApply={() => setPublicView('careers')} />;
  }

  return (
    <window.AppCtx.Provider value={ctx}>
      <AppShell />
      {mobileOpen && window.MobileApp && <window.MobileApp />}
    </window.AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
