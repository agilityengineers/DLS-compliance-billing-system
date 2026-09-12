/* Durable Life Skills — Authorizations, Clients list, Client detail */

function authState(a) {
  const pct = a.used / a.units;
  if (a.daysLeft <= 30 || pct >= 0.98) return { key: 'critical', color: '#D9534F', bg: '#FCE8E6', label: 'Action needed' };
  if (pct >= 0.85 || a.daysLeft <= 60) return { key: 'warn', color: '#C9761A', bg: '#FFF4DE', label: 'Monitor' };
  return { key: 'ok', color: '#1F8A5B', bg: '#E4F4EC', label: 'Healthy' };
}

function Authorizations() {
  const ctx = React.useContext(window.AppCtx);
  const auths = window.AUTHORIZATIONS;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Active authorizations" value={auths.length} sub="Across 4 members" icon="clipboard" accent="var(--blue)" />
        <Stat label="Expiring ≤ 30 days" value={auths.filter(a => a.daysLeft <= 30).length} sub="Renewal needed" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
        <Stat label="Avg. units remaining" value={Math.round(auths.reduce((s, a) => s + (a.units - a.used) / a.units * 100, 0) / auths.length) + '%'} sub="Of authorized totals" icon="target" accent="var(--green)" tint="#E4F4EC" />
      </div>
      <SectionTitle icon="clipboard" action={<Button size="sm" variant="ghost" icon="plus">Import authorization</Button>}>Service authorizations</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {auths.map(a => {
          const c = clientById(a.client); const st = authState(a); const remaining = a.units - a.used; const pct = a.used / a.units * 100;
          return (
            <Card key={a.id} style={{ borderLeft: '4px solid ' + st.color }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <Avatar initials={c.initials} color={c.color} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{c.name}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: '2px 9px', borderRadius: 999 }}>{st.label}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{a.label} · {a.waiver} waiver · Auth {a.authNo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>Expires {a.expires}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: st.color }}>{a.daysLeft} days left</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span style={{ color: 'var(--muted)' }}>{a.used.toLocaleString()} of {a.units.toLocaleString()} units used</span>
                    <span style={{ color: st.color }}>{remaining.toLocaleString()} remaining</span>
                  </div>
                  <ProgressBar value={pct} color={st.color} height={9} />
                </div>
                <Button size="sm" variant="ghost" iconRight="arrow" onClick={() => ctx.openClient(c.id)}>Member record</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Clients() {
  const ctx = React.useContext(window.AppCtx);
  return (
    <div>
      <SectionTitle icon="users" action={<Button size="sm" variant="primary" icon="plus">Add client</Button>}>Client roster</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>
        {window.CLIENTS.map(c => {
          const auth = window.AUTHORIZATIONS.find(a => a.id === c.auth);
          const goals = c.goals.map(g => window.GOALS[g]);
          const avgGoal = Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length);
          return (
            <Card key={c.id} onClick={() => ctx.openClient(c.id)} className="hover-lift" style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 14 }}>
                <Avatar initials={c.initials} color={c.color} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Age {c.age} · {c.waiver} waiver · {c.medicaid}</div>
                </div>
                <StatusPill status={c.workReq.status} small />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {c.dx.map(d => <span key={d.code} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--navy)', background: 'var(--blue-50)', padding: '3px 9px', borderRadius: 7 }}>{d.code} · {d.label}</span>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 13, borderTop: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 5 }}>ISP goal progress</div>
                  <ProgressBar value={avgGoal} color={c.color} label={avgGoal + '% avg across ' + goals.length + ' goals'} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 5 }}>Authorization</div>
                  <ProgressBar value={auth.used / auth.units * 100} color={authState(auth).color} label={(auth.units - auth.used).toLocaleString() + ' units left · ' + auth.daysLeft + 'd'} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ClientDetail() {
  const ctx = React.useContext(window.AppCtx);
  const c = clientById(ctx.selectedClient) || window.CLIENTS[0];
  const goals = c.goals.map(g => window.GOALS[g]);
  const auth = window.AUTHORIZATIONS.find(a => a.id === c.auth);
  const notes = ctx.notes.filter(n => n.client === c.id);
  const w = c.workReq;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <button onClick={() => ctx.setScreen('clients')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} /> Clients
        </button>
      </div>

      {/* Hero */}
      <Card style={{ marginBottom: 16, background: 'linear-gradient(120deg,#fff,#F6F9FC)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar initials={c.initials} color={c.color} size={64} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{c.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>DOB {c.dob} (age {c.age}) · {c.address} · {c.phone}</div>
          </div>
          <div style={{ display: 'flex', gap: 22 }}>
            <HeroKV k="Medicaid ID" v={c.medicaid} />
            <HeroKV k="Waiver" v={c.waiver} />
            <HeroKV k="Status" v={<StatusPill status="Active" small />} />
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="target" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>ISP / IPP goals</h2></div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{goals.length} active objectives</span>
            </div>
            {goals.map(g => (
              <div key={g.id} style={{ padding: '13px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>{g.area}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 800, color: c.color }}>{g.progress}%</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5, fontWeight: 500, marginBottom: 9 }}>{g.text}</div>
                <ProgressBar value={g.progress} color={c.color} />
                <div style={{ display: 'flex', gap: 16, marginTop: 7, fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>
                  <span>Measure: <b style={{ color: 'var(--ink)' }}>{g.measure}</b></span>
                  <span>Baseline: <b style={{ color: 'var(--ink)' }}>{g.baseline}</b></span>
                  <span>Target: <b style={{ color: 'var(--ink)' }}>{g.target}</b></span>
                </div>
              </div>
            ))}
          </Card>

          <Card pad={0}>
            <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 9 }}>
              <Icon name="doc" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>Recent notes</h2>
            </div>
            {notes.map((n, i) => {
              const svc = svcByCode(n.service);
              return (
                <div key={n.id} onClick={() => ctx.openNote(n.id)} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: i < notes.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 38, textAlign: 'center' }}><div style={{ fontSize: 13, fontWeight: 800 }}>{n.date.slice(8)}</div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700 }}>JUN</div></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{svc.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.summary}</div>
                  </div>
                  <StatusPill status={n.status} small />
                </div>
              );
            })}
            {notes.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No notes yet.</div>}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Diagnoses (ICD-10)</h2>
            {c.dx.map(d => (
              <div key={d.code} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)', fontFamily: 'monospace', minWidth: 48 }}>{d.code}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{d.label}</span>
              </div>
            ))}
          </Card>
          <Card>
            <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Authorization</h2>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 8 }}>{auth.label} · {auth.authNo}</div>
            <ProgressBar value={auth.used / auth.units * 100} color={authState(auth).color} label={(auth.units - auth.used).toLocaleString() + ' of ' + auth.units.toLocaleString() + ' units left · expires ' + auth.expires} />
          </Card>
          <Card style={{ background: w.status === 'Exempt' ? '#F4F8FC' : (w.status === 'Meeting' ? '#F4FAF6' : '#FFFBF2') }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><Icon name="briefcase" size={16} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>Work requirement</h2></div>
            <StatusPill status={w.status} small />
            <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, marginTop: 9, lineHeight: 1.45 }}>{w.exemption ? 'Exemption basis: ' + w.exemption : 'Logging activity hours toward the 80-hr monthly requirement via supported employment.'}</div>
            {w.hoursMonth != null && <div style={{ marginTop: 9 }}><ProgressBar value={w.hoursMonth / w.hoursReq * 100} color={w.hoursMonth >= w.hoursReq ? 'var(--green)' : 'var(--amber)'} label={w.hoursMonth + ' / ' + w.hoursReq + ' hrs this month'} /></div>}
          </Card>
          <Card>
            <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 800 }}>Medications</h2>
            {c.meds.map(m => (
              <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid var(--line)' }}>
                <Icon name="pill" size={15} color="var(--muted)" /><span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{m}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function HeroKV({ k, v }) { return <div><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>{k}</div><div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{v}</div></div>; }

Object.assign(window, { Authorizations, Clients, ClientDetail });
