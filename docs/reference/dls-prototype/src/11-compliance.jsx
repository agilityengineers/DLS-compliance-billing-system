/* Durable Life Skills — Compliance engine: flags, work-requirement tracking, audit trail */
function Compliance() {
  const ctx = React.useContext(window.AppCtx);
  const [tab, setTab] = React.useState('flags');
  const tabs = [['flags', 'Open flags', 'alert'], ['workreq', 'Work requirement', 'briefcase'], ['audit', 'Audit trail', 'fingerprint']];

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 5, borderRadius: 12, border: '1px solid var(--line)', width: 'fit-content', marginBottom: 20 }}>
        {tabs.map(([k, label, icon]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 15px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: tab === k ? 'var(--navy)' : 'transparent', color: tab === k ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name={icon} size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === 'flags' && <Flags ctx={ctx} />}
      {tab === 'workreq' && <WorkReq ctx={ctx} />}
      {tab === 'audit' && <AuditTrail />}
    </div>
  );
}

function Flags({ ctx }) {
  const flags = [
    { level: 'error', icon: 'gps', title: 'EVV exception — missing GPS', who: 'Rosa Iglesias · 6/2 visit', detail: 'Manual time entry with no reason code. Cures Act requires electronic capture of location, time, and service type.', action: 'Add reason code', screen: 'documentation' },
    { level: 'warn', icon: 'clock', title: 'Late documentation', who: 'Tanya Whitfield · 6/5 visit', detail: 'Note submitted 36 hours after service. Agency policy requires submission within 24 hours.', action: 'Open note', screen: 'review' },
    { level: 'error', icon: 'clipboard', title: 'Authorization nearly exhausted', who: 'Rosa Iglesias · CLS PA-2026-43355', detail: '1,188 of 1,200 units used (99%). Auth expires in 24 days. Further claims will deny (CARC CO-197).', action: 'Review authorization', screen: 'authorizations' },
    { level: 'warn', icon: 'billing', title: 'Denied claim needs rework', who: 'Tanya Whitfield · 837P-26152-0014', detail: 'CARC CO-197 — units billed exceed authorized balance. Reduce units or request additional authorization.', action: 'Work denial', screen: 'billing' },
  ];
  const counts = { error: flags.filter(f => f.level === 'error').length, warn: flags.filter(f => f.level === 'warn').length };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Critical flags" value={counts.error} sub="Block billing / compliance" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
        <Stat label="Warnings" value={counts.warn} sub="Review recommended" icon="clock" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Auto-checks passing" value="14" sub="Run on every note" icon="shield" accent="var(--green)" tint="#E4F4EC" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {flags.map((f, i) => (
          <Card key={i} style={{ display: 'flex', alignItems: 'center', gap: 15, borderLeft: '4px solid ' + (f.level === 'error' ? '#D9534F' : '#FFA800') }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: f.level === 'error' ? '#FCE8E6' : '#FFF4DE', display: 'grid', placeItems: 'center', color: f.level === 'error' ? '#B23A2E' : '#9A6B00', flex: 'none' }}><Icon name={f.icon} size={21} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.35 }}>
                {f.title} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>· {f.who}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.45 }}>{f.detail}</div>
            </div>
            <Button size="sm" variant="ghost" iconRight="arrow" onClick={() => ctx.setScreen(f.screen)}>{f.action}</Button>
          </Card>
        ))}
      </div>
    </div>
  );
}

function WorkReq({ ctx }) {
  return (
    <div>
      <Card style={{ background: 'linear-gradient(160deg,#EEF5FB,#FBFDFF)', borderColor: '#D6E4F1', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--navy)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="briefcase" size={21} color="#fff" /></div>
          <div>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 4 }}>HR-1 Medicaid work-requirement tracking</div>
            <div style={{ fontSize: 13, color: '#3E5A73', lineHeight: 1.55, fontWeight: 500 }}>
              Work requirements begin Jan 1. Adults 19–64 must complete 80 hrs/month of work, community engagement, or education — unless exempt (disabled / medically frail). This platform documents <b>exemption evidence</b> for waiver members and logs <b>activity hours</b> from supported-employment services. <span style={{ color: 'var(--amber-700)', fontWeight: 700 }}>Assumption: Georgia rules; verify against final state guidance.</span>
            </div>
          </div>
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Members tracked" value={window.CLIENTS.length} sub="Subject to / exempt" icon="users" accent="var(--blue)" />
        <Stat label="Exempt — evidence on file" value="2" sub="Disability / SSI" icon="shield" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Meeting 80-hr req." value="1" sub="Supported employment" icon="checkCircle" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Action needed" value="1" sub="Evidence gap" icon="alert" accent="var(--amber-700)" tint="#FFF4DE" />
      </div>
      <Card pad={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1.4fr 1fr', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          <span>Member</span><span>Status</span><span>Basis / evidence</span><span>This month</span>
        </div>
        {window.CLIENTS.map((c, i) => {
          const w = c.workReq;
          return (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1.4fr 1fr', gap: 12, padding: '14px 20px', borderBottom: i < window.CLIENTS.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={c.initials} color={c.color} size={34} />
                <div><div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>Age {c.age} · {c.waiver}</div></div>
              </div>
              <StatusPill status={w.status} small />
              <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{w.exemption || 'Supported-employment activity'}</span>
              <div>
                {w.hoursMonth != null ? (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: w.hoursMonth >= w.hoursReq ? 'var(--green)' : 'var(--amber-700)' }}>{w.hoursMonth} / {w.hoursReq} hrs</div>
                    <ProgressBar value={(w.hoursMonth / w.hoursReq) * 100} color={w.hoursMonth >= w.hoursReq ? 'var(--green)' : 'var(--amber)'} height={5} />
                  </div>
                ) : <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Exempt — n/a</span>}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function AuditTrail() {
  const actionMeta = {
    NOTE_SIGNED: ['pen', 'var(--blue)'], EVV_CLOCK_OUT: ['gps', 'var(--green)'], EVV_CLOCK_IN: ['gps', 'var(--green)'],
    NOTE_APPROVED: ['checkCircle', 'var(--green)'], NOTE_REJECTED: ['x', '#B23A2E'], CLAIM_BATCH: ['billing', '#7A4FD0'],
  };
  return (
    <div>
      <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon name="lock" size={18} color="var(--navy)" />
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, flex: 1 }}>Every create, view, edit, sign, and export is recorded to an append-only audit log with actor, timestamp, and IP — retained per HIPAA (6 years).</span>
        <Button size="sm" variant="ghost" icon="file">Export log</Button>
      </Card>
      <Card pad={0}>
        {window.AUDIT.map((a, i) => {
          const [icon, color] = actionMeta[a.action] || ['shield', 'var(--muted)'];
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: i < window.AUDIT.length - 1 ? '1px solid var(--line)' : 'none' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#F4F7FA', display: 'grid', placeItems: 'center', color, flex: 'none' }}><Icon name={icon} size={17} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: color }}>{a.action}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{a.target}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>{a.detail}</div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{a.actor}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, fontFamily: 'monospace' }}>{a.ts} · {a.ip}</div>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

window.Compliance = Compliance;
