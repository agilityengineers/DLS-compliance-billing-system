/* Durable Life Skills — Reports & Analytics */
function Reports() {
  const ctx = React.useContext(window.AppCtx);
  const billable = [
    { d: 'Mon', v: 118 }, { d: 'Tue', v: 132 }, { d: 'Wed', v: 126 }, { d: 'Thu', v: 141 }, { d: 'Fri', v: 138 }, { d: 'Sat', v: 64 }, { d: 'Sun', v: 0 },
  ];
  const max = Math.max(...billable.map(b => b.v));
  const staff = [
    { u: 'u_dsp', notes: 38, timeliness: 96, util: 92 },
  ];
  const denials = [
    { code: 'CO-197', label: 'Auth absent / units exceeded', n: 1, color: '#D9534F' },
    { code: 'CO-16', label: 'Missing information', n: 0, color: '#E2A03F' },
    { code: 'CO-29', label: 'Timely filing', n: 0, color: '#7A4FD0' },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Billable hours (wk)" value="142" sub="+8% vs last week" icon="briefcase" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Authorization util." value="91%" sub="Units used vs auth" icon="target" accent="var(--blue)" />
        <Stat label="Clean-claim rate" value="92%" sub="First-pass acceptance" icon="billing" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Denial rate" value="8%" sub="Goal ≤ 5%" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <Card>
          <SectionTitle icon="chart">Billable hours · this week</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 180, padding: '10px 4px 0' }}>
            {billable.map(b => (
              <div key={b.d} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{b.v || ''}</div>
                <div style={{ width: '100%', maxWidth: 38, height: (b.v / max * 130 || 2), borderRadius: 8, background: b.d === 'Sat' ? 'var(--amber)' : 'linear-gradient(180deg,#3E8BC8,#2F6DA8)', transition: 'height .5s' }} />
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}>{b.d}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle icon="alert">Denials by reason (CARC)</SectionTitle>
          {denials.map(d => (
            <div key={d.code} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}><b style={{ fontFamily: 'monospace', color: d.color }}>{d.code}</b> · {d.label}</span>
                <span style={{ fontSize: 12.5, fontWeight: 800 }}>{d.n}</span>
              </div>
              <ProgressBar value={d.n ? 100 : 4} color={d.color} height={6} />
            </div>
          ))}
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 4, lineHeight: 1.45 }}>Single open denial this period — authorization balance. Routed to billing for rework.</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card pad={0}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--line)' }}><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Staff productivity</h2></div>
          {window.USERS.filter(u => u.role === 'DSP' || u.role === 'Supervisor').map((u, i, arr) => {
            const isDsp = u.role === 'DSP';
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <Avatar initials={u.initials} color={u.color} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{window.ROLE_LABEL[u.role]}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{isDsp ? '38' : '41'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>{isDsp ? 'notes' : 'reviews'} / wk</div>
                </div>
                <div style={{ width: 1, height: 30, background: 'var(--line)' }} />
                <div style={{ textAlign: 'right', width: 64 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)' }}>{isDsp ? '96%' : '99%'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>on-time</div>
                </div>
              </div>
            );
          })}
        </Card>
        <Card>
          <SectionTitle icon="file">Audit-ready exports</SectionTitle>
          {[
            ['Service log (837P detail)', 'CSV · billing reconciliation'],
            ['EVV visit report', 'PDF · Cures Act compliance'],
            ['Goal progress summary', 'PDF · per ISP / quarterly review'],
            ['Audit trail export', 'CSV · append-only event log'],
          ].map(([t, s]) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--blue-50)', display: 'grid', placeItems: 'center', color: 'var(--blue-700)', flex: 'none' }}><Icon name="file" size={17} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{s}</div>
              </div>
              <Button size="sm" variant="ghost" icon="arrow">Export</Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
window.Reports = Reports;
