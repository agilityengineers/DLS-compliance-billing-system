/* Durable Life Skills — per-role Dashboard */
function Dashboard() {
  const ctx = React.useContext(window.AppCtx);
  const { user } = ctx;
  const hour = 9;
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--amber-700)', letterSpacing: '.02em', marginBottom: 4 }}>
          {greet}, {user.name.split(' ')[0]} · Saturday, June 6, 2026
        </div>
        <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 500 }}>{roleSubtitle(user.role)}</div>
      </div>
      {user.role === 'DSP' && <DspDash ctx={ctx} />}
      {user.role === 'Supervisor' && <SupDash ctx={ctx} />}
      {user.role === 'Billing' && <BillDash ctx={ctx} />}
      {user.role === 'HR' && <HrDash ctx={ctx} />}
      {user.role === 'Admin' && <AdminDash ctx={ctx} />}
    </div>
  );
}

function roleSubtitle(role) {
  return {
    DSP: "Here's your day. Clock in, document against goals, and submit before you leave the site.",
    Supervisor: 'Notes awaiting your QA review and the compliance signals across your team.',
    Billing: 'Approved notes ready to bill, claims in flight, and remittance to reconcile.',
    HR: 'New applicants, candidates moving through the pipeline, and credentialing that gates who can deliver services.',
    Admin: 'Agency-wide health across documentation, compliance, billing, and the work-requirement rollout.',
  }[role];
}

/* ---------- DSP ---------- */
function DspDash({ ctx }) {
  const myNotes = ctx.notes.filter(n => n.staff === 'u_dsp');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <Stat label="Visits today" value="2 / 3" sub="1 upcoming at 4:00 PM" icon="calendar" accent="var(--blue)" />
          <Stat label="Notes to submit" value={myNotes.filter(n => n.status === 'draft').length || '0'} sub="All caught up" icon="doc" accent="var(--amber-700)" tint="#FFF4DE" />
          <Stat label="My note timeliness" value="96%" sub="Within 24h · last 30 days" icon="clock" accent="var(--green)" tint="#E4F4EC" />
        </div>

        <Card pad={0}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="calendar" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>Today's schedule</h2></div>
            <Button size="sm" variant="primary" icon="pin" onClick={ctx.openMobile}>Start visit</Button>
          </div>
          {window.SCHEDULE.map((s, i) => {
            const c = clientById(s.client); const svc = svcByCode(s.service);
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < window.SCHEDULE.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <div style={{ width: 54, textAlign: 'center', flex: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{s.start}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{s.end}</div>
                </div>
                <div style={{ width: 1, height: 34, background: 'var(--line)', flex: 'none' }} />
                <Avatar initials={c.initials} color={c.color} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{svc.name} · {s.site}</div>
                </div>
                {s.status === 'completed'
                  ? <StatusPill status="approved" small>Documented</StatusPill>
                  : <Button size="sm" variant="ghost" iconRight="arrow" onClick={ctx.openMobile}>Clock in</Button>}
              </div>
            );
          })}
        </Card>

        <div>
          <SectionTitle icon="doc" action={<Button size="sm" variant="ghost" onClick={() => ctx.setScreen('documentation')}>View all</Button>}>Recent notes</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {myNotes.slice(0, 3).map(n => <NoteRow key={n.id} note={n} ctx={ctx} />)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card style={{ background: 'linear-gradient(160deg,#FFF6E6,#FFFDF8)', borderColor: '#F4E2BC' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="sparkle" size={18} color="#3a2600" /></div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>Smart Note assist</div>
          </div>
          <p style={{ fontSize: 12.5, color: '#7A6326', lineHeight: 1.5, margin: '0 0 12px', fontWeight: 500 }}>
            Jot a few bullets after each visit — the assistant drafts a goal-linked, billable progress note for your review.
          </p>
          <Button size="sm" variant="navy" full icon="pen" onClick={() => ctx.openNote('new')}>Draft a note</Button>
        </Card>

        <Card>
          <SectionTitle icon="target">Goals in focus</SectionTitle>
          {['g1','g5','g3'].map(gid => { const g = window.GOALS[gid]; const c = clientById(g.client); return (
            <div key={gid} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, whiteSpace: 'nowrap' }}>
                <Avatar initials={c.initials} color={c.color} size={22} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', flex: 'none' }}>{c.first}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {g.area}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue)', flex: 'none' }}>{g.progress}%</span>
              </div>
              <ProgressBar value={g.progress} color={c.color} />
            </div>
          ); })}
        </Card>
      </div>
    </div>
  );
}

/* ---------- Supervisor ---------- */
function SupDash({ ctx }) {
  const pending = ctx.notes.filter(n => n.status === 'submitted');
  const flagged = ctx.notes.filter(n => n.flags && n.flags.length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <Stat label="Awaiting review" value={pending.length} sub="Oldest: 36h ago" icon="checkCircle" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Compliance flags" value={flagged.length} sub="2 require action" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
        <Stat label="Team timeliness" value="94%" sub="Notes within 24h" icon="clock" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Notes this week" value="38" sub="Across 4 staff" icon="doc" accent="var(--blue)" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div>
          <SectionTitle icon="checkCircle" action={<Button size="sm" variant="primary" onClick={() => ctx.setScreen('review')}>Open review queue</Button>}>Notes awaiting your sign-off</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map(n => <NoteRow key={n.id} note={n} ctx={ctx} showStaff />)}
            {pending.length === 0 && <Card><div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>Queue is clear. 🎉</div></Card>}
          </div>
        </div>
        <Card>
          <SectionTitle icon="shield">Compliance watch</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Flag level="error">Rosa Iglesias — EVV missing GPS on 6/2 visit (manual entry, no reason code)</Flag>
            <Flag level="warn">Tanya Whitfield — note submitted 36h after service</Flag>
            <Flag level="warn">CLS auth PA-2026-43355 — 99% of units used, expires in 24 days</Flag>
          </div>
          <Button size="sm" variant="ghost" full style={{ marginTop: 12 }} onClick={() => ctx.setScreen('compliance')}>Go to Compliance</Button>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Billing ---------- */
function BillDash({ ctx }) {
  const ready = ctx.notes.filter(n => n.status === 'approved');
  const denied = ctx.claims.filter(c => c.status === 'denied');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <Stat label="Ready to bill" value={ready.length} sub="Approved notes" icon="doc" accent="var(--blue)" />
        <Stat label="Claims in flight" value={ctx.claims.filter(c => c.status === 'accepted' || c.status === 'submitted').length} sub="Awaiting 835" icon="billing" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Denials to work" value={denied.length} sub="CO-197 auth issue" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
        <Stat label="Collected (MTD)" value="$78" sub="Clean-claim rate 92%" icon="money" accent="var(--green)" tint="#E4F4EC" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card pad={0}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="doc" size={18} color="var(--navy)" /><h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, whiteSpace: 'nowrap' }}>Approved notes → claims</h2></div>
            <Button size="sm" variant="primary" onClick={() => ctx.setScreen('billing')}>Generate 837P</Button>
          </div>
          {ready.map((n, i) => { const c = clientById(n.client); const svc = svcByCode(n.service); return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px', borderBottom: i < ready.length-1 ? '1px solid var(--line)' : 'none' }}>
              <Avatar initials={c.initials} color={c.color} size={34} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{svc.code} · {n.units} units · {n.date}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>${(n.units * svc.rate).toFixed(2)}</div>
            </div>
          ); })}
          {ready.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>No approved notes waiting.</div>}
        </Card>
        <Card>
          <SectionTitle icon="alert" action={<Button size="sm" variant="ghost" onClick={() => ctx.setScreen('billing')}>Work denials</Button>}>Denial management</SectionTitle>
          {denied.map(cl => { const c = clientById(cl.client); return (
            <div key={cl.id} style={{ border: '1px solid #F3C9C4', background: '#FFF8F7', borderRadius: 12, padding: 13, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
                <StatusPill status="denied" small />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 7 }}>{cl.claimNo} · {cl.service} · ${cl.charge.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#B23A2E', fontWeight: 600, lineHeight: 1.4 }}>{cl.denial.code} — {cl.denial.text}</div>
            </div>
          ); })}
        </Card>
      </div>
    </div>
  );
}

/* ---------- HR / Hiring ---------- */
function HrDash({ ctx }) {
  const apps = ctx.applicants;
  const byStage = (s) => apps.filter(a => a.stage === s);
  const recent = [...apps].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn)).slice(0, 4);
  const expiring = apps.filter(a => a.daysToExpiry <= 14);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <Stat label="New applicants" value={byStage('applied').length} sub="Awaiting screening" icon="users" accent="var(--blue)" />
        <Stat label="In credentialing" value={byStage('background').length} sub="Auto-checks running" icon="fingerprint" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="At offer" value={byStage('offer').length} sub="Ready to extend" icon="briefcase" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Expiring ≤14d" value={expiring.length} sub="60-day validity" icon="clock" accent={expiring.length ? '#B23A2E' : 'var(--green)'} tint={expiring.length ? '#FCE8E6' : '#E4F4EC'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div>
          <SectionTitle icon="briefcase" action={<Button size="sm" variant="primary" onClick={() => ctx.setScreen('hiring')}>Open pipeline</Button>}>Recent applicants</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recent.map(a => {
              const st = window.stageById(a.stage);
              return (
                <Card key={a.id} pad={0} onClick={() => ctx.openApplicant(a.id)} className="hover-lift" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px' }}>
                  <Avatar initials={a.initials} color={a.color} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{a.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{a.position} · {a.source} · applied {a.appliedOn.slice(5)}</div>
                  </div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: st.color, background: st.color + '1A', padding: '4px 11px', borderRadius: 999 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />{st.short}
                  </span>
                  <Icon name="chevron" size={16} color="#C4CFDB" />
                </Card>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card style={{ background: 'linear-gradient(160deg,#FFFDF8,#FFF6E6)', borderColor: '#F4E2BC' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--amber)', display: 'grid', placeItems: 'center' }}><Icon name="grid" size={18} color="#3a2600" /></div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>Credentialing gate</div>
            </div>
            <p style={{ fontSize: 12.5, color: '#7A6326', lineHeight: 1.5, margin: '0 0 12px', fontWeight: 500 }}>
              Configure which requirements block a new hire from delivering billable services — the rule that ties hiring to the rest of the platform.
            </p>
            <Button size="sm" variant="navy" full icon="grid" onClick={() => ctx.setScreen('requirements')}>Configure requirements</Button>
          </Card>
          <Card>
            <SectionTitle icon="briefcase">Pipeline by stage</SectionTitle>
            {window.STAGES.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flex: 'none' }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{s.short}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{byStage(s.id).length}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin ---------- */
function AdminDash({ ctx }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <Stat label="Active clients" value="4" sub="NOW: 2 · COMP: 2" icon="users" accent="var(--blue)" />
        <Stat label="Billable hrs (wk)" value="142" sub="+8% vs last week" icon="briefcase" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Clean-claim rate" value="92%" sub="Goal ≥ 95%" icon="billing" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Open compliance" value="3" sub="1 EVV · 2 auth" icon="shield" accent="#B23A2E" tint="#FCE8E6" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card>
          <SectionTitle icon="refresh">Documentation → billing pipeline</SectionTitle>
          <Pipeline ctx={ctx} />
        </Card>
        <Card style={{ background: 'linear-gradient(160deg,#EEF5FB,#FBFDFF)', borderColor: '#D6E4F1' }}>
          <SectionTitle icon="briefcase">Work-requirement rollout</SectionTitle>
          <p style={{ fontSize: 12.5, color: '#3E5A73', lineHeight: 1.5, margin: '0 0 14px', fontWeight: 500 }}>
            HR-1 work requirements begin Jan 1. Tracking exemption evidence and 80-hr activity for every member.
          </p>
          {[['Exempt — evidence on file', 2, 'var(--blue)'], ['Meeting 80-hr requirement', 1, 'var(--green)'], ['Action needed', 1, 'var(--amber)']].map(([l, n, col]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: col, flex: 'none' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>{l}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{n}</span>
            </div>
          ))}
          <Button size="sm" variant="ghost" full style={{ marginTop: 8 }} onClick={() => ctx.setScreen('compliance')}>Open compliance</Button>
        </Card>
      </div>
    </div>
  );
}

function Pipeline({ ctx }) {
  const stages = [
    { label: 'Drafted', count: ctx.notes.filter(n => n.status === 'draft').length, color: '#94A3B5' },
    { label: 'Pending review', count: ctx.notes.filter(n => n.status === 'submitted').length, color: 'var(--amber)' },
    { label: 'Approved', count: ctx.notes.filter(n => n.status === 'approved').length, color: 'var(--green)' },
    { label: 'Claimed', count: ctx.claims.length, color: 'var(--blue)' },
    { label: 'Paid', count: ctx.claims.filter(c => c.status === 'paid').length, color: '#1F8A5B' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
      {stages.map((s, i) => (
        <React.Fragment key={s.label}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ height: 70, borderRadius: 12, background: s.color, opacity: .14, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: s.color, opacity: 1, filter: 'saturate(1.4) brightness(.8)' }}>{s.count}</span>
              </div>
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginTop: 8 }}>{s.label}</div>
          </div>
          {i < stages.length - 1 && <div style={{ display: 'flex', alignItems: 'center', color: '#C4CFDB', paddingBottom: 24 }}><Icon name="chevron" size={16} /></div>}
        </React.Fragment>
      ))}
    </div>
  );
}

/* shared compact note row */
function NoteRow({ note, ctx, showStaff }) {
  const c = clientById(note.client); const svc = svcByCode(note.service); const st = userById(note.staff);
  return (
    <Card pad={0} onClick={() => ctx.openNote(note.id)} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 16px' }}
      className="hover-lift">
      <Avatar initials={c.initials} color={c.color} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name}</span>
          {note.flags && note.flags.length > 0 && <Icon name="alert" size={14} color={note.flags.some(f => f.level==='error') ? '#D9534F' : '#FFA800'} />}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{svc.code} · {note.units} units · {note.date}{showStaff ? ' · ' + st.name : ''}</div>
      </div>
      <StatusPill status={note.status} small />
      <Icon name="chevron" size={16} color="#C4CFDB" />
    </Card>
  );
}

Object.assign(window, { Dashboard, NoteRow });
