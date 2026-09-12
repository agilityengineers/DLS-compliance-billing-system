/* Durable Life Skills — Hiring pipeline board + applicant detail (full capture) */

function stageById(id) { return window.STAGES.find(s => s.id === id); }
function reqById(id, reqs) { return (reqs || window.REQUIREMENTS).find(r => r.id === id); }

const CRED_STATUS = {
  complete:    { label: 'Verified',    color: '#1F8A5B', bg: '#E4F4EC', icon: 'checkCircle' },
  in_progress: { label: 'In progress', color: '#2F6DA8', bg: '#EAF1F8', icon: 'refresh' },
  pending:     { label: 'Not started', color: '#9A6B00', bg: '#FFF4DE', icon: 'clock' },
  failed:      { label: 'Failed',      color: '#B23A2E', bg: '#FCE8E6', icon: 'alert' },
  waived:      { label: 'Waived',      color: '#7A4FD0', bg: '#F0EAFA', icon: 'shield' },
  expiring:    { label: 'Expiring',    color: '#C9761A', bg: '#FFF4DE', icon: 'clock' },
};

// compute credentialing readiness for an applicant/staff given requirements config
function credSummary(creds, role, requirements) {
  const gating = window.gatingReqsFor(role, requirements);
  let done = 0;
  gating.forEach(r => { const c = creds[r.id]; if (c && (c.status === 'complete' || c.status === 'waived')) done++; });
  return { done, total: gating.length, ready: done === gating.length && gating.length > 0, gating };
}

/* ============================ PIPELINE BOARD ============================ */
function Hiring() {
  const ctx = React.useContext(window.AppCtx);
  const [toast, setToast] = React.useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const byStage = (sid) => ctx.applicants.filter(a => a.stage === sid);
  const total = ctx.applicants.length;
  const newCount = byStage('applied').length;
  const offers = byStage('offer').length;
  const expiringSoon = ctx.applicants.filter(a => a.daysToExpiry <= 14).length;

  return (
    <div>
      {toast && <div style={hbToast}><Icon name="sparkle" size={17} color="#FFD27A" />{toast}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Applicants in pipeline" value={total} sub={newCount + ' new this week'} icon="users" accent="var(--blue)" />
        <Stat label="At offer stage" value={offers} sub="Ready to extend" icon="briefcase" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="In credentialing" value={byStage('background').length} sub="Auto-checks running" icon="fingerprint" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Applications expiring ≤14d" value={expiringSoon} sub="60-day validity rule" icon="clock" accent={expiringSoon ? '#B23A2E' : 'var(--green)'} tint={expiringSoon ? '#FCE8E6' : '#E4F4EC'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle icon="briefcase">Applicant pipeline</SectionTitle>
        <div style={{ display: 'flex', gap: 9 }}>
          <Button size="sm" variant="ghost" icon="file" onClick={() => flash('Paper application ingest — open an applicant tagged “Paper (uploaded)” to see auto-extracted fields.')}>Ingest paper application</Button>
          <Button size="sm" variant="primary" icon="plus" onClick={() => flash('In production this opens the internal new-applicant form (same fields as the public careers application).')}>Add applicant</Button>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ display: 'flex', gap: 13, overflowX: 'auto', paddingBottom: 10 }}>
        {window.STAGES.map(st => {
          const cards = byStage(st.id);
          return (
            <div key={st.id} style={{ width: 232, flex: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 10px' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: st.color, flex: 'none' }} />
                <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>{st.short}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 8px', marginLeft: 'auto' }}>{cards.length}</span>
              </div>
              <div style={{ background: '#EFF3F7', borderRadius: 14, padding: 9, minHeight: 130, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {cards.map(a => <ApplicantCard key={a.id} a={a} onClick={() => ctx.openApplicant(a.id)} />)}
                {cards.length === 0 && <div style={{ textAlign: 'center', color: '#A7B2C0', fontSize: 12, fontWeight: 600, padding: '18px 0' }}>—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ApplicantCard({ a, onClick }) {
  const st = stageById(a.stage);
  const expSoon = a.daysToExpiry <= 14;
  return (
    <div onClick={onClick} className="hover-lift" style={{ background: '#fff', borderRadius: 11, border: '1px solid var(--line)', padding: 11, cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
        <Avatar initials={a.initials} color={a.color} size={32} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.position}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy)', background: 'var(--blue-50)', padding: '2px 7px', borderRadius: 6 }}>{a.source}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: a.channel.includes('Paper') ? '#7A4FD0' : 'var(--green)', background: a.channel.includes('Paper') ? '#F0EAFA' : '#E4F4EC', padding: '2px 7px', borderRadius: 6 }}>
          <Icon name={a.channel.includes('Paper') ? 'file' : 'doc'} size={10} />{a.channel.includes('Paper') ? 'Paper' : 'Digital'}
        </span>
        {a.rating > 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--amber-700)', marginLeft: 'auto' }}>{'★'.repeat(a.rating)}</span>}
      </div>
      {expSoon && <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 10.5, fontWeight: 700, color: '#B23A2E' }}><Icon name="clock" size={11} /> Expires in {a.daysToExpiry}d</div>}
    </div>
  );
}

/* ============================ APPLICANT DETAIL ============================ */
function ApplicantDetail() {
  const ctx = React.useContext(window.AppCtx);
  const a = ctx.applicants.find(x => x.id === ctx.selectedApplicant) || ctx.applicants[0];
  const [toast, setToast] = React.useState(null);
  const [tab, setTab] = React.useState('application');
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const st = stageById(a.stage);
  const stageIdx = window.STAGES.findIndex(s => s.id === a.stage);
  const cs = credSummary(a.creds, a.role, ctx.requirements);

  const setStage = (sid) => {
    const newStage = stageById(sid);
    let creds = a.creds;
    let extra = '';
    // automation: entering Background auto-orders automated checks
    if (sid === 'background') {
      creds = { ...a.creds };
      window.REQUIREMENTS.filter(r => r.automated && r.appliesTo.includes(a.role)).forEach(r => {
        if (!creds[r.id] || creds[r.id].status === 'pending') creds[r.id] = { status: 'in_progress', date: '2026-06-07', note: 'Auto-ordered' };
      });
      extra = ' · auto-ordered background, registry & E-Verify checks';
    }
    ctx.setApplicants(ctx.applicants.map(x => x.id === a.id ? { ...x, stage: sid, creds } : x));
    flash('Moved to “' + newStage.label + '”' + extra);
  };

  const hire = () => {
    // auto-provision an inactive DSP user account
    const uid = 'u_' + a.id;
    if (!ctx.users.find(u => u.id === uid)) {
      ctx.setUsers([...ctx.users, { id: uid, name: a.name, role: a.role, title: a.position, initials: a.initials, color: a.color, hiredVia: a.id, accountStatus: 'inactive' }]);
      ctx.setStaffCreds({ ...ctx.staffCreds, [uid]: { hiredOn: '2026-06-07', accountStatus: 'inactive', creds: a.creds, fromApplicant: a.id } });
    }
    ctx.setApplicants(ctx.applicants.map(x => x.id === a.id ? { ...x, stage: 'hired' } : x));
    flash('Hired — a DSP user account was auto-provisioned (inactive until credentialing clears). See Staff & Credentialing.');
  };

  return (
    <div>
      {toast && <div style={hbToast}><Icon name="checkCircle" size={17} color="#7FE3B0" />{toast}</div>}

      {/* back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => ctx.setScreen('hiring')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} /> Pipeline
        </button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <Avatar initials={a.initials} color={a.color} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.01em' }}>{a.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{a.position} · applied {a.appliedOn} · via {a.source}{a.referredBy ? ' (' + a.referredBy + ')' : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: a.channel.includes('Paper') ? '#7A4FD0' : 'var(--green)', background: a.channel.includes('Paper') ? '#F0EAFA' : '#E4F4EC', padding: '4px 11px', borderRadius: 999 }}>
              <Icon name={a.channel.includes('Paper') ? 'file' : 'doc'} size={13} />{a.channel}
            </span>
            <div style={{ fontSize: 12, fontWeight: 700, marginTop: 7, color: a.daysToExpiry <= 14 ? '#B23A2E' : 'var(--muted)' }}>Application valid {a.daysToExpiry} more days</div>
          </div>
        </div>

        {a.channel.includes('Paper') && (
          <div style={{ marginTop: 14, background: '#F7F3FC', border: '1px solid #E4D7F5', borderRadius: 12, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 11 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: '#EADBFA', display: 'grid', placeItems: 'center', color: '#7A4FD0', flex: 'none' }}><Icon name="sparkle" size={17} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#6A3FBF' }}>Auto-extracted from an uploaded paper application</div>
              <div style={{ fontSize: 11.5, color: '#7A6BA0', fontWeight: 600 }}>Fields below were captured by document parsing · confidence 96% · flagged fields highlighted for HR review</div>
            </div>
          </div>
        )}
      </Card>

      {/* Stage stepper + admin control */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
          {window.STAGES.map((s, i) => {
            const done = i < stageIdx, current = i === stageIdx;
            return (
              <React.Fragment key={s.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 'none' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: done ? s.color : current ? s.color : '#E6ECF2', color: done || current ? '#fff' : '#94A3B5', fontSize: 11, fontWeight: 800 }}>
                    {done ? <Icon name="check" size={12} /> : i + 1}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: current ? 800 : 600, color: current ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{s.short}</span>
                </div>
                {i < window.STAGES.length - 1 && <div style={{ width: 16, height: 2, background: done ? s.color : '#E6ECF2', flex: 'none' }} />}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 13, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)' }}>Move to stage</span>
            <select value={a.stage} onChange={e => setStage(e.target.value)} style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 9, padding: '7px 11px', background: '#fff', cursor: 'pointer' }}>
              {window.STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>admin override — set any stage</span>
          </div>
          <div style={{ flex: 1 }} />
          {stageIdx < 5 && <Button size="sm" variant="ghost" iconRight="arrow" onClick={() => setStage(window.STAGES[Math.min(stageIdx + 1, 6)].id)}>Advance</Button>}
          {(a.stage === 'background' || a.stage === 'offer') && <Button size="sm" variant="primary" icon="checkCircle" onClick={hire}>Hire &amp; provision account</Button>}
        </div>
      </Card>

      {/* tabs */}
      <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 5, borderRadius: 12, border: '1px solid var(--line)', width: 'fit-content', marginBottom: 16 }}>
        {[['application','Application','doc'],['credentialing','Credentialing','fingerprint'],['automation','Automation','sparkle']].map(([k,l,ic]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 15px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: tab === k ? 'var(--navy)' : 'transparent', color: tab === k ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name={ic} size={15} /> {l}
          </button>
        ))}
      </div>

      {tab === 'application' && <ApplicationView a={a} />}
      {tab === 'credentialing' && <CredentialingView creds={a.creds} role={a.role} requirements={ctx.requirements} cs={cs} onWaive={() => flash('Requirement waived with admin reason — logged to the audit trail.')} />}
      {tab === 'automation' && <AutomationView a={a} />}
    </div>
  );
}

/* ---- full captured application ---- */
function ApplicationView({ a }) {
  const ap = a.app;
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const yn = (b) => <span style={{ fontWeight: 800, color: b ? 'var(--green)' : '#B23A2E' }}>{b ? 'Yes' : 'No'}</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardHead icon="users" title="Personal information" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <Field k="Full name" v={a.name} /><Field k="Email" v={ap.email} /><Field k="Phone" v={ap.phone} />
          <Field k="Alternate phone" v={ap.altPhone || '—'} /><Field k="Address" v={ap.address} span={2} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <Field k="Eligible to work in U.S.?" v={yn(a.eligibleUS)} />
          <Field k="Ever terminated / asked to resign?" v={a.terminated ? <span><b style={{ color: '#B23A2E' }}>Yes</b> — {a.terminatedNote}</span> : yn(false)} span={a.terminated ? 2 : 1} />
          {!a.terminated && <Field k="Can perform essential functions?" v={yn(a.essentialFns)} />}
          <Field k="Available for overtime?" v={yn(a.overtime)} />
          <Field k="Earliest start date" v={a.canStart} />
          <Field k="Currently employed?" v={ap.currentlyEmployed ? 'Yes · may contact: ' + (ap.mayContact ? 'yes' : 'no') : 'No'} />
        </div>
      </Card>

      <Card>
        <CardHead icon="calendar" title="Availability" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
          {days.map(d => {
            const v = ap.availability[d]; const off = v === '—';
            return (
              <div key={d} style={{ textAlign: 'center', background: off ? '#F4F7FA' : 'var(--blue-50)', borderRadius: 10, padding: '10px 4px', border: '1px solid ' + (off ? 'var(--line)' : '#D2E2F0') }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', marginBottom: 4 }}>{d}</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: off ? '#A7B2C0' : 'var(--blue-700)' }}>{v}</div>
              </div>
            );
          })}
        </div>
        {ap.cannotWork && ap.cannotWork !== 'None' && <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 11 }}>Cannot work: <b style={{ color: 'var(--ink)' }}>{ap.cannotWork}</b></div>}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <CardHead icon="briefcase" title="Position desired" />
          <Field k="Position" v={a.position} /><div style={{ height: 10 }} />
          <Field k="Referral source" v={a.source + (a.referredBy ? ' · ' + a.referredBy : '')} />
        </Card>
        <Card>
          <CardHead icon="target" title="Special skills / training" />
          <div style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, lineHeight: 1.5 }}>{ap.skills}</div>
        </Card>
      </div>

      <Card pad={0}>
        <div style={{ padding: '16px 20px 0' }}><CardHead icon="doc" title="Education" /></div>
        <Tbl cols={['School / location','Credits','Degree','Major','Grad']} rows={ap.education.map(e => [e.school, e.credits, e.degree, e.major, e.grad])} />
      </Card>

      <Card pad={0}>
        <div style={{ padding: '16px 20px 0' }}><CardHead icon="clock" title="Employment history (last 5 years)" /></div>
        {ap.history.map((h, i) => (
          <div key={i} style={{ padding: '14px 20px', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{h.employer}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{h.dates}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              <Field k="Title" v={h.title} /><Field k="Location" v={h.city} /><Field k="Supervisor" v={h.supervisor} />
              <Field k="Phone" v={h.phone} /><Field k="Reason for leaving" v={h.reason} /><Field k="Work performed" v={h.work} />
            </div>
          </div>
        ))}
      </Card>

      <Card pad={0}>
        <div style={{ padding: '16px 20px 0' }}><CardHead icon="users" title="References (3, known 3+ years)" /></div>
        <Tbl cols={['Name','Contact','Relationship','Years']} rows={ap.references.map(r => [r.name, r.contact, r.rel, r.years])} />
      </Card>

      <Card style={{ background: '#FAFBFC' }}>
        <CardHead icon="lock" title="Applicant certification & agreement" />
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.55, fontWeight: 500, margin: '0 0 14px' }}>
          Applicant certified the information is true and complete, authorized verification and reference checks, and acknowledged the at-will employment terms. Application is valid for 60 days from the signature date.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', marginBottom: 6 }}>SIGNED ELECTRONICALLY</div>
            <span style={{ fontFamily: 'Caveat, cursive', fontSize: 30, color: 'var(--navy)', lineHeight: 1 }}>{a.name}</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Signed {a.signedOn}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Expires {a.expiresOn}</div>
            <button style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}><Icon name="file" size={14} /> View signed PDF</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function CardHead({ icon, title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
      <Icon name={icon} size={18} color="var(--navy)" />
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap' }}>{title}</h2>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  );
}
function Field({ k, v, span }) {
  return <div style={{ gridColumn: span ? 'span ' + span : 'auto' }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.4 }}>{v}</div></div>;
}
function Tbl({ cols, rows }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols.map((c,i)=> i===0?'1.6fr':'1fr').join(' '), gap: 10, padding: '8px 20px', background: '#F4F7FA', fontSize: 11, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.03em', textTransform: 'uppercase' }}>
        {cols.map(c => <span key={c}>{c}</span>)}
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: cols.map((c,j)=> j===0?'1.6fr':'1fr').join(' '), gap: 10, padding: '10px 20px', borderTop: '1px solid var(--line)', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
          {r.map((cell, j) => <span key={j} style={{ fontWeight: j === 0 ? 700 : 600 }}>{cell}</span>)}
        </div>
      ))}
    </div>
  );
}

/* ---- credentialing view (reads the requirements registry) ---- */
function CredentialingView({ creds, role, requirements, cs, onWaive }) {
  const gating = window.gatingReqsFor(role, requirements);
  const optional = (requirements || window.REQUIREMENTS).filter(r => r.appliesTo.includes(role) && !(r.required && r.gating));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ background: cs.ready ? '#F4FAF6' : '#FFFBF2', borderColor: cs.ready ? '#CDE9D9' : '#F2E2BC' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: cs.ready ? '#E1F2E9' : '#FFF1D6', display: 'grid', placeItems: 'center', color: cs.ready ? 'var(--green)' : 'var(--amber-700)', flex: 'none' }}><Icon name={cs.ready ? 'checkCircle' : 'clock'} size={24} /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>{cs.done} of {cs.total} required items verified</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{cs.ready ? 'All gating requirements met — eligible to activate and deliver billable services.' : 'Cannot deliver billable services until all required items clear. Admin may waive an item with a reason.'}</div>
          </div>
          <div style={{ width: 130 }}><ProgressBar value={cs.total ? cs.done / cs.total * 100 : 0} color={cs.ready ? 'var(--green)' : 'var(--amber)'} height={9} /></div>
        </div>
      </Card>

      <Card pad={0}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--line)' }}><CardHead icon="shield" title="Required (gating)" /></div>
        {gating.map((r, i) => <CredRow key={r.id} r={r} c={creds[r.id]} last={i === gating.length - 1} onWaive={onWaive} />)}
        {gating.length === 0 && <div style={{ padding: 20, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>No required items configured for this role.</div>}
      </Card>

      {optional.length > 0 && (
        <Card pad={0}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--line)' }}><CardHead icon="grid" title="Optional / non-gating" /></div>
          {optional.map((r, i) => <CredRow key={r.id} r={r} c={creds[r.id]} last={i === optional.length - 1} onWaive={onWaive} />)}
        </Card>
      )}
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.5, padding: '0 4px' }}>
        Which items are required and gating is controlled in <b style={{ color: 'var(--ink)' }}>Requirements</b> — changes there apply across every staff member's checklist.
      </div>
    </div>
  );
}

function CredRow({ r, c, last, onWaive }) {
  const status = c ? c.status : 'pending';
  const sm = CRED_STATUS[status] || CRED_STATUS.pending;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 20px', borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: sm.bg, display: 'grid', placeItems: 'center', color: sm.color, flex: 'none' }}><Icon name={sm.icon} size={17} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{r.label}</span>
          {r.automated && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--green)', background: '#E4F4EC', padding: '1px 6px', borderRadius: 5, letterSpacing: '.03em' }}>AUTO</span>}
          {r.vendor && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>· {r.vendor}</span>}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{c && c.note ? c.note : r.note}{c && c.date ? ' · ' + c.date : ''}</div>
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: sm.color, background: sm.bg, padding: '4px 11px', borderRadius: 999 }}>{sm.label}</span>
      {status !== 'complete' && status !== 'waived' && <button onClick={onWaive} style={{ fontSize: 11.5, fontWeight: 700, color: '#7A4FD0', background: 'none', border: '1px solid #E4D7F5', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>Waive</button>}
    </div>
  );
}

/* ---- automation view ---- */
function AutomationView({ a }) {
  const events = [
    { on: a.appliedOn, icon: 'doc', color: 'var(--blue)', title: 'Application received', detail: a.channel.includes('Paper') ? 'Paper application uploaded → fields auto-extracted (96% confidence)' : 'Digital application submitted & validated', done: true },
    { on: a.appliedOn, icon: 'lock', color: 'var(--navy)', title: 'Certification e-signed & archived', detail: 'Signed PDF stored to applicant record · 60-day validity clock started', done: true },
    { on: a.signedOn, icon: 'bell', color: 'var(--amber-700)', title: 'Confirmation sent to applicant', detail: 'Auto-email acknowledging receipt + next steps', done: true },
    { on: ['background','hired','active'].includes(a.stage) ? '2026-06-07' : null, icon: 'fingerprint', color: 'var(--green)', title: 'Background, registry & E-Verify ordered', detail: 'Auto-triggered when applicant entered Background stage', done: ['background','hired','active'].includes(a.stage) },
    { on: ['hired','active'].includes(a.stage) ? '2026-06-07' : null, icon: 'users', color: '#7A4FD0', title: 'Staff/user account provisioned', detail: 'Inactive DSP account created — blocked from billable services until credentialing clears', done: ['hired','active'].includes(a.stage) },
    { on: a.stage === 'active' ? '2026-06-07' : null, icon: 'checkCircle', color: 'var(--green)', title: 'Activated for service delivery', detail: 'All gating requirements verified — can be scheduled, document, and bill', done: a.stage === 'active' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card style={{ background: 'linear-gradient(160deg,#FFFDF8,#FFF6E6)', borderColor: '#F4E2BC' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--amber)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="sparkle" size={18} color="#3a2600" /></div>
          <div><div style={{ fontSize: 14.5, fontWeight: 800 }}>Automation timeline</div><div style={{ fontSize: 12, color: '#9A7B33', fontWeight: 700 }}>What the system does without manual work</div></div>
        </div>
      </Card>
      <Card>
        {events.map((e, i) => (
          <div key={i} style={{ display: 'flex', gap: 13, paddingBottom: i < events.length - 1 ? 18 : 0, position: 'relative' }}>
            {i < events.length - 1 && <div style={{ position: 'absolute', left: 16, top: 34, bottom: 0, width: 2, background: e.done ? '#D6E0EA' : '#EEF1F5' }} />}
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: e.done ? '#fff' : '#F4F7FA', border: '2px solid ' + (e.done ? e.color : '#E0E6EC'), display: 'grid', placeItems: 'center', color: e.done ? e.color : '#B5C0CC', flex: 'none', zIndex: 1 }}><Icon name={e.done ? e.icon : 'clock'} size={16} /></div>
            <div style={{ flex: 1, opacity: e.done ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{e.title}</span>
                {e.done ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{e.on}</span> : <span style={{ fontSize: 11, fontWeight: 700, color: '#A7B2C0' }}>Pending</span>}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 500, lineHeight: 1.45 }}>{e.detail}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const hbToast = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--navy)', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, zIndex: 70, boxShadow: '0 10px 30px rgba(10,25,45,.3)', display: 'flex', alignItems: 'center', gap: 9, maxWidth: '90vw' };

Object.assign(window, { Hiring, ApplicantDetail, credSummary, CRED_STATUS, CardHead, Field, stageById, CredentialingView });
