/* Durable Life Skills — Documentation (note list + filters) */
function Documentation() {
  const ctx = React.useContext(window.AppCtx);
  const [filter, setFilter] = React.useState('all');
  const isDSP = ctx.user.role === 'DSP';
  let rows = isDSP ? ctx.notes.filter(n => n.staff === 'u_dsp') : ctx.notes;
  if (filter !== 'all') rows = rows.filter(n => n.status === filter);

  const counts = {
    all: (isDSP ? ctx.notes.filter(n => n.staff === 'u_dsp') : ctx.notes).length,
    draft: ctx.notes.filter(n => n.status === 'draft' && (!isDSP || n.staff === 'u_dsp')).length,
    submitted: ctx.notes.filter(n => n.status === 'submitted' && (!isDSP || n.staff === 'u_dsp')).length,
    approved: ctx.notes.filter(n => n.status === 'approved' && (!isDSP || n.staff === 'u_dsp')).length,
    rejected: ctx.notes.filter(n => n.status === 'rejected' && (!isDSP || n.staff === 'u_dsp')).length,
  };
  const tabs = [['all','All notes'],['submitted','Pending review'],['approved','Approved'],['rejected','Returned'],['draft','Drafts']];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 5, borderRadius: 12, border: '1px solid var(--line)' }}>
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: 700, background: filter === k ? 'var(--navy)' : 'transparent',
              color: filter === k ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 7,
            }}>
              {label}
              {counts[k] > 0 && <span style={{ fontSize: 11, fontWeight: 800, background: filter === k ? 'rgba(255,255,255,.22)' : 'var(--blue-50)', color: filter === k ? '#fff' : 'var(--blue-700)', borderRadius: 999, padding: '1px 7px' }}>{counts[k]}</span>}
            </button>
          ))}
        </div>
        {isDSP && <Button variant="primary" icon="pen" onClick={() => ctx.openNote('new')}>New progress note</Button>}
      </div>

      <Card pad={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.3fr 1fr 0.8fr 1.2fr 28px', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          <span>Client / Service</span><span>EVV</span><span>Date</span><span>Units</span><span>Status</span><span></span>
        </div>
        {rows.map((n, i) => {
          const c = clientById(n.client); const svc = svcByCode(n.service);
          const evvOk = n.evv.method.includes('✓');
          return (
            <div key={n.id} onClick={() => ctx.openNote(n.id)} className="row-hover" style={{
              display: 'grid', gridTemplateColumns: '2.2fr 1.3fr 1fr 0.8fr 1.2fr 28px', gap: 12, padding: '14px 20px',
              borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Avatar initials={c.initials} color={c.color} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{svc.code} · {svc.name}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: evvOk ? 'var(--green)' : '#B23A2E' }}>
                <Icon name={evvOk ? 'gps' : 'alert'} size={15} />{evvOk ? 'Verified' : 'Exception'}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 600 }}>{n.date.slice(5)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700 }}>{n.units}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <StatusPill status={n.status} small />
                {n.flags && n.flags.length > 0 && <Icon name="alert" size={14} color={n.flags.some(f => f.level === 'error') ? '#D9534F' : '#FFA800'} />}
              </div>
              <Icon name="chevron" size={16} color="#C4CFDB" />
            </div>
          );
        })}
        {rows.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>No notes in this view.</div>}
      </Card>
    </div>
  );
}
window.Documentation = Documentation;
