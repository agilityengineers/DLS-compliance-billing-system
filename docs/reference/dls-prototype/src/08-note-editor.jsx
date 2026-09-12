/* Durable Life Skills — Progress Note editor (AI-assisted draft, sign & lock) */

function NoteEditor() {
  const ctx = React.useContext(window.AppCtx);
  if (ctx.selectedNote === 'new') return <NewNoteFlow ctx={ctx} />;
  return <NoteDetail ctx={ctx} />;
}

/* ============ Narrative generator (simulated Smart assist) ============ */
function generateNarrative(bullets, client, svc, goals) {
  const lines = bullets.split('\n').map(s => s.replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
  const body = lines.length ? lines : ['Provided scheduled service per the support plan.'];
  const intro = `On the date of service, the Direct Support Professional provided ${svc.name} (${svc.code}) for ${client.first} at ${'the community work site'}. Electronic visit verification confirmed time in/out and location via GPS and geofence match.`;
  const activities = `During the session, ${client.first} ${joinClauses(body)} Staff used least-prompt strategies and faded support as appropriate to promote independence.`;
  const goalLines = goals.map(g => `• ${g.area} — ${client.first} ${goalProgressClause(g)} Data collected toward the measurable objective ("${truncate(g.text, 96)}").`).join('\n');
  const plan = `${client.first} remained engaged and responded well to redirection. Plan: continue ${svc.name.toLowerCase()} per authorized frequency, reinforce gains noted above, and review progress at the next ISP checkpoint.`;
  return { intro, activities, goalLines, plan };
}
function joinClauses(arr) {
  const lc = arr.map((s, i) => (i === 0 ? lcFirst(s) : lcFirst(s)));
  if (lc.length === 1) return lc[0] + '.';
  return lc.slice(0, -1).join(', ') + ', and ' + lc[lc.length - 1] + '.';
}
function lcFirst(s){ return s.charAt(0).toLowerCase() + s.slice(1); }
function truncate(s, n){ return s.length > n ? s.slice(0, n) + '…' : s; }
function goalProgressClause(g){
  const map = {
    g1: 'completed the routine with 1 verbal prompt, an improvement from a 3-prompt baseline',
    g2: 'identified the correct stop independently on consecutive trips',
    g3: 'followed the picture recipe with standby support on the majority of steps',
    g4: 'selected the correct bill to complete a community purchase',
    g5: 'sustained on-task behavior for extended intervals with minimal redirection',
    g6: 'initiated a request for assistance using the communication device',
  };
  return map[g.id] || 'made measurable progress toward the objective';
}

/* ============ NEW NOTE — AI-assisted creation ============ */
function NewNoteFlow({ ctx }) {
  const client = clientById('c1');
  const svc = svcByCode('H2025');
  const clientGoals = client.goals.map(g => window.GOALS[g]);
  const [bullets, setBullets] = React.useState('Completed opening stock routine in floral with 1 verbal prompt (down from 3)\nReviewed the closing checklist together\nPositive interaction with the shift lead — initiated a greeting');
  const [picked, setPicked] = React.useState(['g1']);
  const [phase, setPhase] = React.useState('input'); // input | generating | draft
  const [text, setText] = React.useState('');
  const [signed, setSigned] = React.useState(false);
  const fullRef = React.useRef('');

  const runAssist = () => {
    const goals = clientGoals.filter(g => picked.includes(g.id));
    const n = generateNarrative(bullets, client, svc, goals);
    const full = `SETTING & SERVICE\n${n.intro}\n\nSESSION SUMMARY\n${n.activities}\n\nPROGRESS TOWARD ISP GOALS\n${n.goalLines}\n\nRESPONSE & PLAN\n${n.plan}`;
    fullRef.current = full;
    setPhase('generating'); setText('');
    let i = 0;
    const id = setInterval(() => {
      i += Math.max(2, Math.round(full.length / 90));
      setText(full.slice(0, i));
      if (i >= full.length) { clearInterval(id); setText(full); setPhase('draft'); }
    }, 26);
  };

  const submit = () => {
    const goals = clientGoals.filter(g => picked.includes(g.id));
    const newNote = {
      id: 'n' + Date.now(), client: client.id, staff: 'u_dsp', service: svc.code,
      goals: picked, date: '2026-06-06', timeIn: '09:02', timeOut: '12:14', units: 12, status: 'submitted',
      evv: { gps: '34.2979, -83.8241', site: 'Kroger #412 — Dawsonville Hwy', device: 'iPhone · DLS-Field-08', method: 'GPS + geofence ✓' },
      flags: [], summary: bullets.split('\n')[0], narrative: fullRef.current,
      goalProgress: Object.fromEntries(goals.map(g => [g.id, 'Documented'])),
    };
    ctx.setNotes([newNote, ...ctx.notes]);
    ctx.setScreen('documentation');
  };

  return (
    <div>
      <BackBar ctx={ctx} label="New progress note" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
        {/* LEFT — note form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <ClientHeader client={client} svc={svc} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 16 }}>
              <MiniField label="Date of service" value="Jun 6, 2026" icon="calendar" />
              <MiniField label="Time in / out" value="9:02 – 12:14" icon="clock" />
              <MiniField label="Units (15 min)" value="12 units" icon="target" />
            </div>
            <div style={{ marginTop: 14, background: '#F4FAF6', border: '1px solid #CDE9D9', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#E1F2E9', display: 'grid', placeItems: 'center', color: 'var(--green)', flex: 'none' }}><Icon name="gps" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--green)' }}>EVV verified · GPS + geofence match</div>
                <div style={{ fontSize: 11.5, color: '#4E6A5B', fontWeight: 600 }}>Kroger #412 — Dawsonville Hwy · 34.2979, -83.8241 · iPhone DLS-Field-08</div>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="target" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Link to ISP goals</h2></div>
              <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 700 }}>{picked.length} selected</span>
            </div>
            {clientGoals.map(g => {
              const on = picked.includes(g.id);
              return (
                <div key={g.id} onClick={() => setPicked(p => on ? p.filter(x => x !== g.id) : [...p, g.id])} style={{
                  display: 'flex', gap: 12, padding: 13, borderRadius: 12, marginBottom: 9, cursor: 'pointer',
                  border: '1.5px solid ' + (on ? 'var(--blue)' : 'var(--line)'), background: on ? 'var(--blue-50)' : '#fff',
                }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, flex: 'none', marginTop: 1, border: '1.5px solid ' + (on ? 'var(--blue)' : '#C4CFDB'), background: on ? 'var(--blue)' : '#fff', display: 'grid', placeItems: 'center' }}>
                    {on && <Icon name="check" size={13} color="#fff" />}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 3 }}>{g.area} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>· target {g.target}</span></div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45, fontWeight: 500 }}>{g.text}</div>
                  </div>
                </div>
              );
            })}
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="doc" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Progress note</h2></div>
              {phase === 'draft' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--green)' }}><Icon name="sparkle" size={14} /> AI draft — review & edit</span>}
            </div>
            {phase === 'input' && <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', border: '1.5px dashed var(--line)', borderRadius: 12, fontSize: 13, lineHeight: 1.5 }}>
              Add your session bullets in the assistant on the right, then <b style={{ color: 'var(--ink)' }}>Draft with Smart assist</b> to generate a goal-linked note here.
            </div>}
            {phase !== 'input' && (
              <textarea value={text} onChange={e => setText(e.target.value)} readOnly={phase === 'generating'} style={{
                width: '100%', minHeight: 300, border: '1px solid var(--line)', borderRadius: 12, padding: 16,
                fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', color: 'var(--ink)', resize: 'vertical', outline: 'none',
                whiteSpace: 'pre-wrap', boxSizing: 'border-box', background: phase === 'generating' ? '#FBFCFE' : '#fff',
              }} />
            )}
          </Card>

          {phase === 'draft' && (
            <Card style={{ borderColor: signed ? '#CDE9D9' : 'var(--line)' }}>
              <SignBlock signed={signed} setSigned={setSigned} />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <Button variant="ghost" onClick={() => ctx.setScreen('documentation')}>Save as draft</Button>
                <div style={{ flex: 1 }} />
                <Button variant="primary" icon="lock" disabled={!signed} onClick={submit}>Sign & submit for review</Button>
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT — Smart assist */}
        <Card style={{ position: 'sticky', top: 84, background: 'linear-gradient(165deg,#FFFDF8,#FFF6E6)', borderColor: '#F4E2BC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="sparkle" size={19} color="#3a2600" /></div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>Smart Note assist</div>
              <div style={{ fontSize: 11.5, color: '#9A7B33', fontWeight: 700, whiteSpace: 'nowrap' }}>Bullets → billable note</div>
            </div>
          </div>
          <label style={{ fontSize: 12, fontWeight: 800, color: '#7A6326', display: 'block', marginBottom: 7 }}>What happened this session?</label>
          <textarea value={bullets} onChange={e => setBullets(e.target.value)} placeholder={'• one bullet per line'} style={{
            width: '100%', minHeight: 150, border: '1px solid #EAD9B0', borderRadius: 12, padding: 13, fontSize: 13,
            lineHeight: 1.55, fontFamily: 'inherit', color: 'var(--ink)', resize: 'vertical', outline: 'none', boxSizing: 'border-box', background: '#fff',
          }} />
          <div style={{ fontSize: 11.5, color: '#9A7B33', fontWeight: 600, margin: '9px 0 14px', lineHeight: 1.45 }}>
            The assistant drafts in clinical language, links to the goals you selected, and never invents data — you review and sign.
          </div>
          <Button variant="navy" full icon={phase === 'generating' ? 'refresh' : 'sparkle'} disabled={phase === 'generating'} onClick={runAssist}>
            {phase === 'generating' ? 'Drafting…' : phase === 'draft' ? 'Re-draft note' : 'Draft with Smart assist'}
          </Button>
          {phase !== 'input' && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #EAD9B0' }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#7A6326', marginBottom: 9 }}>QUICK CHECKS</div>
              {[['Goal-linked', picked.length > 0], ['Within authorized units', true], ['EVV verified', true], ['Signature applied', signed]].map(([l, ok]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, fontSize: 12.5, fontWeight: 600, color: ok ? 'var(--green)' : 'var(--muted)' }}>
                  <Icon name={ok ? 'checkCircle' : 'clock'} size={15} />{l}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ============ Existing note detail (read-only / locked) ============ */
function NoteDetail({ ctx }) {
  const note = ctx.notes.find(n => n.id === ctx.selectedNote) || ctx.notes[0];
  const client = clientById(note.client); const svc = svcByCode(note.service);
  const staff = userById(note.staff);
  const locked = note.status !== 'draft';
  const goals = note.goals.map(g => window.GOALS[g]);
  const narrative = note.narrative || `SETTING & SERVICE\n${svc.name} (${svc.code}) provided for ${client.first}; EVV verified.\n\nSESSION SUMMARY\n${note.summary}\n\nPROGRESS TOWARD ISP GOALS\n${goals.map(g => '• ' + g.area + ' — ' + (note.goalProgress[g.id] || 'progressing')).join('\n')}`;

  return (
    <div>
      <BackBar ctx={ctx} label={client.name + ' · ' + note.date} right={<StatusPill status={note.status} />} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {note.status === 'rejected' && (
            <div style={{ background: '#FFF8F7', border: '1px solid #F3C9C4', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Icon name="alert" size={17} color="#B23A2E" /><span style={{ fontSize: 13.5, fontWeight: 800, color: '#B23A2E' }}>Returned for correction</span></div>
              <div style={{ fontSize: 13, color: '#8A3A30', lineHeight: 1.5, fontWeight: 500 }}>{note.rejectReason}</div>
            </div>
          )}
          <Card>
            <ClientHeader client={client} svc={svc} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 16 }}>
              <MiniField label="Date" value={note.date.slice(5)} icon="calendar" />
              <MiniField label="Time" value={note.timeIn + '–' + note.timeOut} icon="clock" />
              <MiniField label="Units" value={note.units + ' units'} icon="target" />
              <MiniField label="Charge" value={'$' + (note.units * svc.rate).toFixed(2)} icon="money" />
            </div>
          </Card>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Icon name="doc" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Progress note</h2>{locked && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: 'var(--muted)' }}><Icon name="lock" size={13} /> Locked</span>}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)', whiteSpace: 'pre-wrap', fontWeight: 500 }}>{formatNarrative(narrative)}</div>
          </Card>
          <Card>
            <SignBlock signed locked staff={staff} when={note.date + ' ' + note.timeOut} />
          </Card>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Icon name="gps" size={18} color="var(--green)" /><h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>EVV record</h2></div>
            {[['Method', note.evv.method], ['Location', note.evv.site], ['GPS', note.evv.gps], ['Device', note.evv.device]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{k}</span>
                <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600, textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}><Icon name="target" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 800 }}>Goal progress</h2></div>
            {goals.map(g => (
              <div key={g.id} style={{ marginBottom: 13 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--navy)', marginBottom: 5 }}>{g.area}</div>
                <ProgressBar value={g.progress} color={client.color} />
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>{note.goalProgress[g.id] || 'Progressing'}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function formatNarrative(text) {
  return text.split('\n').map((line, i) => {
    if (/^[A-Z][A-Z &]+$/.test(line.trim())) return <div key={i} style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--blue-700)', marginTop: i ? 16 : 0, marginBottom: 5 }}>{line}</div>;
    return <div key={i} style={{ marginBottom: line.trim() ? 4 : 0 }}>{line}</div>;
  });
}

/* ---- shared sub-components ---- */
function BackBar({ ctx, label, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <button onClick={() => ctx.setScreen('documentation')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
        <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} /> Back
      </button>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{label}</h2>
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}
function ClientHeader({ client, svc }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
      <Avatar initials={client.initials} color={client.color} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{client.name}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Medicaid {client.medicaid} · {client.waiver} waiver · DOB {client.dob}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <StatusPill status="billed" small>{svc.code} · {svc.mod}</StatusPill>
        <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 5 }}>{svc.name}</div>
      </div>
    </div>
  );
}
function MiniField({ label, value, icon }) {
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 11, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}><Icon name={icon} size={13} />{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}
function SignBlock({ signed, setSigned, locked, staff, when }) {
  const name = staff ? staff.name : 'Alicia Romero';
  if (locked || (signed && !setSigned)) {
    return (
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', marginBottom: 8 }}>ELECTRONIC SIGNATURE</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid var(--ink)', paddingBottom: 6 }}>
          <span style={{ fontFamily: 'Caveat, cursive', fontSize: 30, color: 'var(--navy)', lineHeight: 1 }}>{name}</span>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{when || '2026-06-06 12:14'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 11.5, color: 'var(--green)', fontWeight: 700 }}><Icon name="lock" size={13} /> Signed & locked · any change requires an addendum</div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', marginBottom: 8 }}>ELECTRONIC SIGNATURE</div>
      {signed ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid var(--ink)', paddingBottom: 6 }}>
          <span style={{ fontFamily: 'Caveat, cursive', fontSize: 30, color: 'var(--navy)', lineHeight: 1 }}>{name}</span>
          <button onClick={() => setSigned(false)} style={{ fontSize: 11.5, color: 'var(--blue)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Clear</button>
        </div>
      ) : (
        <button onClick={() => setSigned(true)} style={{
          width: '100%', border: '1.5px dashed #C4CFDB', borderRadius: 12, padding: '20px', background: '#F8FAFC',
          cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)', fontSize: 13.5, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        }}><Icon name="pen" size={17} /> Tap to apply your e-signature as {name}</button>
      )}
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
        By signing I attest this note accurately reflects services delivered. Signature applies a tamper-evident lock and timestamp.
      </div>
    </div>
  );
}

window.NoteEditor = NoteEditor;
