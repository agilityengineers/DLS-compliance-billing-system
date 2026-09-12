/* Durable Life Skills — Supervisor Review Queue (QA sign-off) */
function ReviewQueue() {
  const ctx = React.useContext(window.AppCtx);
  const pending = ctx.notes.filter(n => n.status === 'submitted');
  const [selId, setSelId] = React.useState(pending[0] ? pending[0].id : null);
  const [returning, setReturning] = React.useState(false);
  const [reason, setReason] = React.useState('EVV exception not documented — re-submit with reason code.');
  const [toast, setToast] = React.useState(null);

  const sel = ctx.notes.find(n => n.id === selId) || pending[0];

  const decide = (decision) => {
    ctx.setNotes(ctx.notes.map(n => {
      if (n.id !== sel.id) return n;
      if (decision === 'approve') return { ...n, status: 'approved', approvedBy: 'u_sup', approvedAt: '2026-06-06 09:30' };
      return { ...n, status: 'rejected', rejectedBy: 'u_sup', rejectReason: reason };
    }));
    setReturning(false);
    setToast(decision === 'approve' ? 'Note approved — released to billing.' : 'Note returned to the DSP for correction.');
    const rest = pending.filter(n => n.id !== sel.id);
    setSelId(rest[0] ? rest[0].id : null);
    setTimeout(() => setToast(null), 2600);
  };

  if (pending.length === 0) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: 420 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: '#E4F4EC', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: 'var(--green)' }}><Icon name="checkCircle" size={32} /></div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 6px' }}>Review queue is clear</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>Every submitted note has been signed off. {toast || 'Nicely done.'}</p>
        </div>
      </div>
    );
  }

  const client = clientById(sel.client); const svc = svcByCode(sel.service); const staff = userById(sel.staff);
  const goals = sel.goals.map(g => window.GOALS[g]);
  const narrative = sel.narrative || `SETTING & SERVICE\n${svc.name} (${svc.code}) provided for ${client.first}; EVV ${sel.evv.method}.\n\nSESSION SUMMARY\n${sel.summary}\n\nPROGRESS TOWARD ISP GOALS\n${goals.map(g => '• ' + g.area + ' — ' + (sel.goalProgress[g.id] || 'progressing')).join('\n')}`;
  const checks = [
    ['Service matches authorization', true],
    ['Note linked to active ISP goal(s)', goals.length > 0],
    ['EVV captured', sel.evv.method.includes('✓')],
    ['Units within session time', true],
    ['Submitted within 24h', !sel.flags.some(f => f.text.includes('after service'))],
  ];

  return (
    <div style={{ position: 'relative' }}>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--navy)', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, zIndex: 60, boxShadow: '0 10px 30px rgba(10,25,45,.3)', display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="checkCircle" size={17} color="#7FE3B0" />{toast}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        {/* queue list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', padding: '0 4px' }}>{pending.length} AWAITING SIGN-OFF</div>
          {pending.map(n => {
            const c = clientById(n.client); const on = n.id === sel.id;
            return (
              <Card key={n.id} pad={13} onClick={() => setSelId(n.id)} style={{ border: '1.5px solid ' + (on ? 'var(--blue)' : 'var(--line)'), background: on ? 'var(--blue-50)' : '#fff', display: 'flex', alignItems: 'center', gap: 11 }}>
                <Avatar initials={c.initials} color={c.color} size={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{svcByCode(n.service).code} · {n.date.slice(5)}</div>
                </div>
                {n.flags.length > 0 && <Icon name="alert" size={15} color={n.flags.some(f => f.level === 'error') ? '#D9534F' : '#FFA800'} />}
              </Card>
            );
          })}
        </div>

        {/* detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <Avatar initials={client.initials} color={client.color} size={46} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16.5, fontWeight: 800 }}>{client.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{svc.name} ({svc.code}·{svc.mod}) · {sel.units} units · {sel.date}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Submitted by</div>
                <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}><Avatar initials={staff.initials} color={staff.color} size={22} />{staff.name}</div>
              </div>
            </div>
            {sel.flags.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>{sel.flags.map((f, i) => <Flag key={i} level={f.level}>{f.text}</Flag>)}</div>}
          </Card>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Icon name="doc" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>Progress note</h2></div>
              <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)', whiteSpace: 'pre-wrap', fontWeight: 500 }}>{window.formatNarrative(narrative)}</div>
            </Card>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Icon name="checkCircle" size={18} color="var(--green)" /><h2 style={{ margin: 0, fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>QA checklist</h2></div>
                {checks.map(([l, ok]) => (
                  <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 9, fontSize: 12.5, fontWeight: 600, color: ok ? 'var(--ink)' : '#B23A2E' }}>
                    <span style={{ marginTop: 1 }}><Icon name={ok ? 'checkCircle' : 'alert'} size={15} color={ok ? 'var(--green)' : '#D9534F'} /></span>{l}
                  </div>
                ))}
              </Card>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Icon name="gps" size={17} color="var(--green)" /><h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>EVV</h2></div>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 3 }}>{sel.evv.site}</div>
                <div style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 700 }}>{sel.evv.method}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{sel.evv.gps} · {sel.evv.device}</div>
              </Card>
            </div>
          </div>

          {returning ? (
            <Card style={{ borderColor: '#F3C9C4', background: '#FFF8F7' }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#B23A2E', marginBottom: 9 }}>Return to DSP — reason for correction</div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} style={{ width: '100%', minHeight: 70, border: '1px solid #F3C9C4', borderRadius: 11, padding: 12, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <Button variant="ghost" onClick={() => setReturning(false)}>Cancel</Button>
                <div style={{ flex: 1 }} />
                <Button variant="danger" icon="arrow" onClick={() => decide('return')}>Return note</Button>
              </div>
            </Card>
          ) : (
            <Card style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Supervisor decision</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Approving co-signs the note and releases it to billing.</div>
              </div>
              <Button variant="danger" icon="x" onClick={() => setReturning(true)}>Return for correction</Button>
              <Button variant="primary" icon="check" onClick={() => decide('approve')}>Approve &amp; co-sign</Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
window.ReviewQueue = ReviewQueue;
