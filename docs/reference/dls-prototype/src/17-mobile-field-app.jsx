/* Durable Life Skills — Mobile field app (phone-frame overlay): EVV clock-in/out + quick note */
function MobileApp() {
  const ctx = React.useContext(window.AppCtx);
  const [screen, setScreen] = React.useState('home');
  const [elapsed, setElapsed] = React.useState(0);
  const [gpsReady, setGpsReady] = React.useState(false);
  const [bullets, setBullets] = React.useState('Stocked floral with 1 verbal prompt\nReviewed closing checklist\nGreeted the shift lead');
  const [drafted, setDrafted] = React.useState(false);
  const [signed, setSigned] = React.useState(false);
  const client = clientById('c1'); const svc = svcByCode('H2025');

  React.useEffect(() => {
    if (screen !== 'active') return;
    const id = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(id);
  }, [screen]);
  React.useEffect(() => {
    if (screen === 'clockin') { setGpsReady(false); const t = setTimeout(() => setGpsReady(true), 1600); return () => clearTimeout(t); }
  }, [screen]);

  const fmt = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');

  return (
    <div onClick={ctx.closeMobile} style={{ position: 'fixed', inset: 0, background: 'rgba(15,30,50,.62)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 90, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }} onClick={e => e.stopPropagation()}>
        {/* phone */}
        <div style={{ width: 380, height: 760, background: '#0F1C2B', borderRadius: 46, padding: 11, boxShadow: '0 40px 90px rgba(8,18,33,.55)', flex: 'none' }}>
          <div style={{ width: '100%', height: '100%', background: '#F4F7FA', borderRadius: 36, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/* status bar */}
            <div style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', flex: 'none', fontSize: 13, fontWeight: 800, color: 'var(--ink)', position: 'relative', zIndex: 5 }}>
              <span>9:02</span>
              <div style={{ position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)', width: 104, height: 26, background: '#0F1C2B', borderRadius: 999 }} />
              <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Icon name="gps" size={13} /> 100%</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {screen === 'home' && <MHome client={client} svc={svc} onClock={() => setScreen('clockin')} />}
              {screen === 'clockin' && <MClockIn client={client} svc={svc} ready={gpsReady} onConfirm={() => { setElapsed(0); setScreen('active'); }} onBack={() => setScreen('home')} />}
              {screen === 'active' && <MActive client={client} svc={svc} time={fmt(elapsed)} onNote={() => setScreen('note')} onOut={() => setScreen('note')} />}
              {screen === 'note' && <MNote client={client} bullets={bullets} setBullets={setBullets} drafted={drafted} setDrafted={setDrafted} signed={signed} setSigned={setSigned} onSubmit={() => setScreen('done')} />}
              {screen === 'done' && <MDone client={client} onDone={ctx.closeMobile} />}
            </div>
            {/* home indicator */}
            <div style={{ height: 22, display: 'grid', placeItems: 'center', flex: 'none' }}><div style={{ width: 124, height: 5, borderRadius: 999, background: '#0F1C2B', opacity: .25 }} /></div>
          </div>
        </div>
        <div style={{ maxWidth: 220, color: '#fff' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: 'rgba(255,255,255,.6)', marginBottom: 8 }}>FIELD APP</div>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.25, marginBottom: 10 }}>The same record, in the field.</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.72)', lineHeight: 1.5, fontWeight: 500 }}>DSPs clock in with GPS-verified EVV, document against goals, and sign — offline-capable, syncing the moment they're back online.</div>
          <button onClick={ctx.closeMobile} style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 10, padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}><Icon name="x" size={15} /> Close</button>
        </div>
      </div>
    </div>
  );
}

function MHome({ client, svc, onClock }) {
  return (
    <div>
      <div style={{ background: 'linear-gradient(160deg,#2D4E6C,#1E3A52)', padding: '14px 20px 22px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}><Logo size={30} light /><div style={{ fontSize: 14.5, fontWeight: 800 }}>Durable Life Skills</div></div>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', fontWeight: 600 }}>Saturday, June 6</div>
        <div style={{ fontSize: 21, fontWeight: 800 }}>Good morning, Alicia</div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 11, letterSpacing: '.03em' }}>TODAY · 3 VISITS</div>
        {window.SCHEDULE.map((s, i) => {
          const c = clientById(s.client); const sv = svcByCode(s.service); const next = s.status === 'upcoming';
          return (
            <div key={s.id} style={{ background: '#fff', borderRadius: 16, padding: 15, marginBottom: 11, border: '1px solid var(--line)', boxShadow: next ? '0 4px 16px rgba(47,128,194,.12)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: next ? 13 : 0 }}>
                <Avatar initials={c.initials} color={c.color} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800 }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{s.start} · {sv.name}</div>
                </div>
                {s.status === 'completed' ? <StatusPill status="approved" small>Done</StatusPill> : <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--blue)' }}>NEXT</span>}
              </div>
              {next && <button onClick={onClock} style={mBtn('var(--amber)', '#3a2600')}><Icon name="pin" size={17} /> Clock in at {s.site}</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MClockIn({ client, svc, ready, onConfirm, onBack }) {
  return (
    <div style={{ padding: 18 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--navy)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14, padding: 0 }}><Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} /> Back</button>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4 }}>Verify visit</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginBottom: 16 }}>Electronic Visit Verification (Cures Act)</div>

      {/* faux map */}
      <div style={{ height: 168, borderRadius: 16, overflow: 'hidden', position: 'relative', background: 'linear-gradient(135deg,#DDE8F0,#C9DCEA)', marginBottom: 16, border: '1px solid var(--line)' }}>
        <svg width="100%" height="100%" viewBox="0 0 340 168" style={{ position: 'absolute', inset: 0 }}>
          <path d="M0 120 H340 M0 60 H340 M90 0 V168 M230 0 V168" stroke="#fff" strokeWidth="10" opacity=".7" />
          <path d="M0 120 H340 M90 0 V168" stroke="#B9CFE0" strokeWidth="2" />
        </svg>
        <div style={{ position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)' }}>
          <div style={{ width: ready ? 70 : 40, height: ready ? 70 : 40, borderRadius: '50%', background: 'rgba(47,128,194,.18)', transition: 'all .6s', display: 'grid', placeItems: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: 'var(--blue)', border: '3px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.25)' }} />
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, background: 'rgba(255,255,255,.94)', borderRadius: 10, padding: '8px 11px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name={ready ? 'checkCircle' : 'gps'} size={16} color={ready ? 'var(--green)' : 'var(--blue)'} />
          <span style={{ fontSize: 12, fontWeight: 700, color: ready ? 'var(--green)' : 'var(--ink)' }}>{ready ? 'Location verified · inside geofence' : 'Acquiring GPS…'}</span>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, padding: 14, border: '1px solid var(--line)', marginBottom: 16 }}>
        {[['Client', client.name], ['Service', svc.code + ' · ' + svc.name], ['Site', 'Kroger #412 — Dawsonville Hwy'], ['GPS', ready ? '34.2979, -83.8241' : '—'], ['Device', 'iPhone · DLS-Field-08']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{k}</span>
            <span style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 700, textAlign: 'right' }}>{v}</span>
          </div>
        ))}
      </div>
      <button onClick={onConfirm} disabled={!ready} style={mBtn(ready ? 'var(--amber)' : '#D6DEE6', ready ? '#3a2600' : '#9AA7B4')}>
        <Icon name="clock" size={17} /> {ready ? 'Clock in now · 9:02 AM' : 'Waiting for GPS…'}
      </button>
    </div>
  );
}

function MActive({ client, svc, time, onNote, onOut }) {
  return (
    <div>
      <div style={{ background: 'linear-gradient(160deg,#1F8A5B,#187048)', padding: '20px', color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', opacity: .85 }}>VISIT IN PROGRESS · EVV ACTIVE</div>
        <div style={{ fontSize: 46, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', margin: '6px 0' }}>{time}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, background: 'rgba(255,255,255,.16)', padding: '4px 12px', borderRadius: 999 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7FE3B0' }} /> Clocked in at 9:02 · geofence ✓</div>
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 16, padding: 15, border: '1px solid var(--line)', marginBottom: 16 }}>
          <Avatar initials={client.initials} color={client.color} size={44} />
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>{client.name}</div><div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{svc.name} · Kroger #412</div></div>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted)', marginBottom: 10, letterSpacing: '.03em' }}>GOALS THIS VISIT</div>
        {client.goals.map(gid => { const g = window.GOALS[gid]; return (
          <div key={gid} style={{ background: '#fff', borderRadius: 13, padding: 13, border: '1px solid var(--line)', marginBottom: 9 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', marginBottom: 4 }}>{g.area}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.4 }}>{g.text.slice(0, 84)}…</div>
          </div>
        ); })}
        <button onClick={onNote} style={{ ...mBtn('#fff', 'var(--navy)'), border: '1.5px solid var(--line)', marginTop: 6 }}><Icon name="pen" size={16} /> Add progress note</button>
        <button onClick={onOut} style={{ ...mBtn('var(--navy)', '#fff'), marginTop: 10 }}><Icon name="clock" size={16} /> End visit &amp; document</button>
      </div>
    </div>
  );
}

function MNote({ client, bullets, setBullets, drafted, setDrafted, signed, setSigned, onSubmit }) {
  const draftText = `Provided supported-employment coaching for ${client.first} at Kroger #412 (EVV verified). ${client.first} completed the opening stock routine with one verbal prompt, reviewed the closing checklist, and initiated a greeting with the shift lead. Least-prompt strategies used; progress recorded toward the supported-employment goal. Plan: continue per authorization.`;
  return (
    <div style={{ padding: 18 }}>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 3 }}>Quick note</div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 14 }}>{client.name} · Supported Employment</div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#7A6326', marginBottom: 7 }}>SESSION BULLETS</div>
      <textarea value={bullets} onChange={e => setBullets(e.target.value)} style={{ width: '100%', minHeight: 84, border: '1px solid #EAD9B0', borderRadius: 12, padding: 11, fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'none', outline: 'none', boxSizing: 'border-box', background: '#FFFDF8' }} />
      {!drafted ? (
        <button onClick={() => setDrafted(true)} style={{ ...mBtn('var(--navy)', '#fff'), marginTop: 12 }}><Icon name="sparkle" size={16} /> Draft with Smart assist</button>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: 'var(--green)', margin: '13px 0 6px' }}><Icon name="sparkle" size={14} /> AI DRAFT · REVIEW</div>
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 13, fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink)', fontWeight: 500 }}>{draftText}</div>
          {!signed ? (
            <button onClick={() => setSigned(true)} style={{ ...mBtn('#fff', 'var(--navy)'), border: '1.5px dashed #C4CFDB', marginTop: 12 }}><Icon name="pen" size={16} /> Tap to sign</button>
          ) : (
            <div style={{ marginTop: 12, padding: '10px 13px', border: '1px solid #CDE9D9', background: '#F4FAF6', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Caveat, cursive', fontSize: 24, color: 'var(--navy)' }}>Alicia Romero</span>
              <Icon name="lock" size={15} color="var(--green)" />
            </div>
          )}
          <button onClick={onSubmit} disabled={!signed} style={{ ...mBtn(signed ? 'var(--amber)' : '#D6DEE6', signed ? '#3a2600' : '#9AA7B4'), marginTop: 12 }}><Icon name="check" size={16} /> Sign &amp; submit</button>
        </div>
      )}
    </div>
  );
}

function MDone({ client, onDone }) {
  return (
    <div style={{ padding: '50px 24px', textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#E4F4EC', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}><Icon name="checkCircle" size={48} color="var(--green)" /></div>
      <div style={{ fontSize: 21, fontWeight: 800, marginBottom: 8 }}>All set!</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.5, marginBottom: 26 }}>Visit clocked out, EVV recorded, and the signed note for {client.first} is in the supervisor's review queue.</div>
      <div style={{ background: '#fff', borderRadius: 14, padding: 15, border: '1px solid var(--line)', textAlign: 'left' }}>
        {[['EVV', 'GPS + geofence ✓'], ['Units', '12 (15-min)'], ['Status', 'Pending review']].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{k}</span><span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700 }}>{v}</span></div>
        ))}
      </div>
      <button onClick={onDone} style={{ ...mBtn('var(--navy)', '#fff'), marginTop: 22 }}>Back to platform</button>
    </div>
  );
}

function mBtn(bg, fg) {
  return { width: '100%', padding: '13px', borderRadius: 13, border: 'none', background: bg, color: fg, fontSize: 14, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, whiteSpace: 'nowrap' };
}

window.MobileApp = MobileApp;
