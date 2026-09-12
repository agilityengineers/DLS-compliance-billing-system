/* Durable Life Skills — Login screen */
function LoginScreen({ onLogin, onApply }) {
  const [email, setEmail] = React.useState('alicia.romero@durablelifeskills.com');
  const [pw, setPw] = React.useState('••••••••••');
  const [focus, setFocus] = React.useState(null);

  const field = (key) => ({
    onFocus: () => setFocus(key), onBlur: () => setFocus(null),
    style: {
      width: '100%', padding: '13px 14px 13px 42px', fontSize: 14.5, fontFamily: 'inherit',
      borderRadius: 12, border: '1.5px solid ' + (focus === key ? 'var(--blue)' : 'var(--line)'),
      background: '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
      boxShadow: focus === key ? '0 0 0 4px rgba(47,128,194,.12)' : 'none', transition: 'all .15s ease',
    },
  });

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr 1fr', background: 'var(--app-bg)' }}>
      {/* Brand panel */}
      <div style={{
        position: 'relative', overflow: 'hidden', padding: '48px 56px',
        background: 'linear-gradient(155deg, #2D4E6C 0%, #1E3A52 55%, #15293B 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#fff',
      }}>
        {/* decorative stepping path */}
        <svg style={{ position: 'absolute', right: -40, bottom: -30, opacity: .15 }} width="420" height="420" viewBox="0 0 200 200" fill="none">
          <rect x="20" y="150" width="26" height="34" rx="5" fill="#7FA8CC"/>
          <rect x="60" y="115" width="26" height="69" rx="5" fill="#B9D2E8"/>
          <rect x="100" y="78" width="26" height="106" rx="5" fill="#FFA800"/>
          <rect x="140" y="40" width="26" height="144" rx="5" fill="#fff"/>
          <circle cx="153" cy="26" r="11" fill="#FFA800"/>
        </svg>
        <Wordmark light />
        <div style={{ position: 'relative', maxWidth: 440 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.1)', padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, letterSpacing: '.03em', marginBottom: 22 }}>
            <Icon name="shield" size={15} color="#FFD27A" /> HIPAA-aligned · Georgia NOW / COMP waiver
          </div>
          <h1 style={{ fontSize: 38, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 16px' }}>
            Document the care.<br/><span style={{ color: 'var(--amber)' }}>Bill it the same day.</span>
          </h1>
          <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'rgba(255,255,255,.78)', margin: 0 }}>
            One place for goal-linked progress notes, EVV, supervisor sign-off, and clean 837P claims — built for the field staff helping people build durable life skills.
          </p>
          <div style={{ display: 'flex', gap: 22, marginTop: 30 }}>
            {[['One workflow', 'notes → claims'], ['EVV capture', 'GPS + time'], ['Audit trail', 'every change']].map(([a, b]) => (
              <div key={a} style={{ whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{a}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>{b}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', fontSize: 12, color: 'rgba(255,255,255,.5)', fontWeight: 600 }}>
          application.durablelifeskills.com · © 2026 Durable Life Skills, Inc.
        </div>
      </div>

      {/* Login form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: '100%', maxWidth: 384 }}>
          <h2 style={{ fontSize: 25, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Sign in</h2>
          <p style={{ fontSize: 14, color: 'var(--muted)', margin: '0 0 26px' }}>Welcome back. Enter your agency credentials.</p>

          <label style={lblStyle}>Work email</label>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <span style={iconInField}><Icon name="users" size={17} color="#94A3B5" /></span>
            <input value={email} onChange={e => setEmail(e.target.value)} {...field('email')} />
          </div>

          <label style={lblStyle}>Password</label>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={iconInField}><Icon name="lock" size={17} color="#94A3B5" /></span>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} {...field('pw')} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--muted)', fontWeight: 600, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked style={{ accentColor: 'var(--blue)', width: 15, height: 15 }} /> Remember this device
            </label>
            <a style={{ fontSize: 13, color: 'var(--blue)', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>Forgot?</a>
          </div>

          <Button variant="primary" size="lg" full iconRight="arrow" onClick={() => onLogin('u_dsp')}>Sign in securely</Button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            <span style={{ fontSize: 11.5, color: '#A7B2C0', fontWeight: 700, letterSpacing: '.08em' }}>DEMO — JUMP TO A ROLE</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {window.USERS.map(u => (
              <button key={u.id} onClick={() => onLogin(u.id)} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 11,
                border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'border-color .15s, box-shadow .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = u.color; e.currentTarget.style.boxShadow = '0 2px 10px rgba(20,40,70,.07)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <Avatar initials={u.initials} color={u.color} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name.split(' ')[0]}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)' }}>{window.ROLE_LABEL[u.role].split(' / ')[0]}</div>
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Looking to join the team?</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Apply for a Direct Support position.</div>
            </div>
            <Button variant="navy" size="sm" iconRight="arrow" onClick={onApply}>Apply now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const lblStyle = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 };
const iconInField = { position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' };

window.LoginScreen = LoginScreen;
