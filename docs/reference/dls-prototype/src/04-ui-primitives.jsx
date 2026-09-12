/* Durable Life Skills — shared UI primitives */

// Brand logomark: interlocking "DLS" stepping-stones / upward path motif
function Logo({ size = 34, light = false }) {
  const navy = light ? '#FFFFFF' : '#264766';
  const amber = '#FFA800';
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', flex: 'none' }} aria-label="Durable Life Skills">
      <rect x="2" y="2" width="36" height="36" rx="10" fill={navy}/>
      {/* upward stepping path */}
      <rect x="9"  y="24" width="6" height="7"  rx="1.6" fill="#7FA8CC"/>
      <rect x="17" y="18" width="6" height="13" rx="1.6" fill="#B9D2E8"/>
      <rect x="25" y="11" width="6" height="20" rx="1.6" fill={amber}/>
      {/* trajectory dot */}
      <circle cx="28" cy="8.5" r="2.4" fill="#FFFFFF"/>
    </svg>
  );
}

function Wordmark({ light = false, sub = true }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={34} light={light} />
      <div style={{ lineHeight: 1.05 }}>
        <div style={{ fontWeight: 800, fontSize: 15.5, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: light ? '#fff' : 'var(--navy)' }}>
          Durable Life Skills
        </div>
        {sub && <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: light ? 'rgba(255,255,255,.7)' : 'var(--amber-700)', textTransform: 'uppercase' }}>Care Platform</div>}
      </div>
    </div>
  );
}

function Avatar({ initials, color = '#2F80C2', size = 36, ring = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flex: 'none',
      background: color, color: '#fff', fontWeight: 700, fontSize: size * 0.38,
      display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '.02em',
      boxShadow: ring ? '0 0 0 3px #fff, 0 0 0 4.5px ' + color : 'none',
    }}>{initials}</div>
  );
}

const STATUS_STYLES = {
  draft:     { bg: '#EEF1F5', fg: '#5A6B7E', dot: '#94A3B5', label: 'Draft' },
  submitted: { bg: '#FFF4DE', fg: '#9A6B00', dot: '#FFA800', label: 'Pending review' },
  approved:  { bg: '#E4F4EC', fg: '#1F7A52', dot: '#1F8A5B', label: 'Approved' },
  rejected:  { bg: '#FCE8E6', fg: '#B23A2E', dot: '#D9534F', label: 'Returned' },
  billed:    { bg: '#EAF1F8', fg: '#2F6DA8', dot: '#2F80C2', label: 'Billed' },
  ready:     { bg: '#EAF1F8', fg: '#2F6DA8', dot: '#2F80C2', label: 'Ready to bill' },
  accepted:  { bg: '#FFF4DE', fg: '#9A6B00', dot: '#FFA800', label: 'Accepted' },
  paid:      { bg: '#E4F4EC', fg: '#1F7A52', dot: '#1F8A5B', label: 'Paid' },
  denied:    { bg: '#FCE8E6', fg: '#B23A2E', dot: '#D9534F', label: 'Denied' },
  Active:    { bg: '#E4F4EC', fg: '#1F7A52', dot: '#1F8A5B', label: 'Active' },
  Meeting:   { bg: '#E4F4EC', fg: '#1F7A52', dot: '#1F8A5B', label: 'Meeting requirement' },
  Exempt:    { bg: '#EAF1F8', fg: '#2F6DA8', dot: '#2F80C2', label: 'Exempt' },
  'Action needed': { bg: '#FFF4DE', fg: '#9A6B00', dot: '#FFA800', label: 'Action needed' },
};

function StatusPill({ status, children, small }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: s.bg, color: s.fg, fontWeight: 700,
      fontSize: small ? 11 : 12, padding: small ? '3px 9px' : '4px 11px',
      borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '.005em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flex: 'none' }} />
      {children || s.label}
    </span>
  );
}

function Card({ children, style, pad = 20, hover, onClick, className }) {
  return (
    <div onClick={onClick} className={className} style={{
      background: '#fff', borderRadius: 16, border: '1px solid var(--line)',
      boxShadow: '0 1px 2px rgba(20,40,70,.04), 0 4px 16px rgba(20,40,70,.03)',
      padding: pad, cursor: onClick ? 'pointer' : 'default',
      transition: 'box-shadow .18s ease, transform .18s ease, border-color .18s ease',
      ...style,
    }}>{children}</div>
  );
}

function Button({ children, variant = 'primary', size = 'md', icon, iconRight, onClick, disabled, full, style }) {
  const sizes = { sm: { p: '7px 13px', f: 13, g: 6 }, md: { p: '10px 17px', f: 14, g: 8 }, lg: { p: '13px 22px', f: 15, g: 9 } };
  const z = sizes[size];
  const variants = {
    primary:   { background: 'var(--amber)', color: '#3a2600', border: '1px solid var(--amber)', boxShadow: '0 1px 0 rgba(0,0,0,.04), 0 2px 8px rgba(255,168,0,.28)', fontWeight: 800 },
    navy:      { background: 'var(--navy)', color: '#fff', border: '1px solid var(--navy)', boxShadow: '0 2px 8px rgba(38,71,102,.22)', fontWeight: 700 },
    ghost:     { background: '#fff', color: 'var(--navy)', border: '1px solid var(--line)', fontWeight: 700 },
    soft:      { background: 'var(--blue-50)', color: 'var(--blue-700)', border: '1px solid transparent', fontWeight: 700 },
    danger:    { background: '#fff', color: '#B23A2E', border: '1px solid #F3C9C4', fontWeight: 700 },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: z.g,
      padding: z.p, fontSize: z.f, borderRadius: 11, cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit', opacity: disabled ? 0.5 : 1, width: full ? '100%' : 'auto',
      transition: 'filter .15s ease, transform .05s ease', whiteSpace: 'nowrap',
      ...variants[variant], ...style,
    }}
      onMouseDown={e => e.currentTarget.style.transform = 'translateY(1px)'}
      onMouseUp={e => e.currentTarget.style.transform = 'translateY(0)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {icon && <Icon name={icon} size={z.f + 3} />}
      {children}
      {iconRight && <Icon name={iconRight} size={z.f + 3} />}
    </button>
  );
}

function ProgressBar({ value, color = 'var(--blue)', track = '#EAEFF5', height = 7, label }) {
  return (
    <div>
      <div style={{ background: track, borderRadius: 999, height, overflow: 'hidden' }}>
        <div style={{ width: Math.max(0, Math.min(100, value)) + '%', height: '100%', background: color, borderRadius: 999, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
      </div>
      {label && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, fontWeight: 600 }}>{label}</div>}
    </div>
  );
}

function Stat({ label, value, sub, icon, accent = 'var(--navy)', tint = 'var(--blue-50)' }) {
  return (
    <Card pad={18} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.01em' }}>{label}</span>
        {icon && <div style={{ width: 32, height: 32, borderRadius: 9, background: tint, display: 'grid', placeItems: 'center', color: accent }}><Icon name={icon} size={17} /></div>}
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{sub}</div>}
    </Card>
  );
}

function SectionTitle({ children, icon, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {icon && <span style={{ color: 'var(--navy)' }}><Icon name={icon} size={19} /></span>}
        <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{children}</h2>
      </div>
      {action}
    </div>
  );
}

// Flag chip for compliance warnings/errors
function Flag({ level = 'warn', children }) {
  const styles = {
    warn:  { bg: '#FFF4DE', fg: '#9A6B00', icon: 'alert' },
    error: { bg: '#FCE8E6', fg: '#B23A2E', icon: 'alert' },
    ok:    { bg: '#E4F4EC', fg: '#1F7A52', icon: 'checkCircle' },
  }[level];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: styles.bg, color: styles.fg, padding: '8px 11px', borderRadius: 10, fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>
      <span style={{ marginTop: 1 }}><Icon name={styles.icon} size={15} /></span>
      <span>{children}</span>
    </div>
  );
}

function clientById(id) { return window.CLIENTS.find(c => c.id === id); }
function userById(id) { return window.USERS.find(u => u.id === id); }
function svcByCode(code) { return window.SERVICE_CODES.find(s => s.code === code); }

Object.assign(window, {
  Logo, Wordmark, Avatar, StatusPill, Card, Button, ProgressBar, Stat, SectionTitle, Flag,
  STATUS_STYLES, clientById, userById, svcByCode,
});
