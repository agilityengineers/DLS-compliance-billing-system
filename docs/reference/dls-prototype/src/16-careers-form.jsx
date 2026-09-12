/* Durable Life Skills — Public careers application (digital, validated, e-signed) */
function CareersForm({ onBack }) {
  const [step, setStep] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const [signed, setSigned] = React.useState(false);
  const [data, setData] = React.useState({
    first: '', last: '', email: '', phone: '', address: '',
    eligibleUS: '', position: 'Direct Support Professional', start: '', source: '',
    overtime: '', essential: '', terminated: '',
    avail: { Sun: '—', Mon: 'All', Tue: 'All', Wed: 'All', Thu: 'All', Fri: 'All', Sat: '—' },
    skills: '',
  });
  const [touched, setTouched] = React.useState(false);
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  const steps = ['Personal & eligibility', 'Availability & position', 'Experience', 'Review & sign'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const availOpts = ['—','All','1st shift','2nd shift','Mornings','Afternoons','Evenings'];

  const step0Valid = data.first && data.last && data.email.includes('@') && data.phone.length >= 7 && data.eligibleUS;
  const canNext = step === 0 ? step0Valid : true;

  if (done) return <CareersDone data={data} onBack={onBack} />;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* public header */}
      <div style={{ background: 'linear-gradient(120deg,#2D4E6C,#1E3A52)', padding: '0', flex: 'none' }}>
        <div style={{ maxWidth: 880, margin: '0 auto', padding: '18px 28px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Wordmark light />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.8)', fontWeight: 700 }}>Careers</span>
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', borderRadius: 9, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700 }}><Icon name="logout" size={14} /> Back to sign in</button>
        </div>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', width: '100%', padding: '28px', boxSizing: 'border-box', flex: 1 }}>
        {/* intro */}
        {step === 0 && (
          <div style={{ marginBottom: 22 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>Application for Employment</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', margin: 0, lineHeight: 1.5, maxWidth: 620 }}>
              Durable Life Skills, Inc. is an Equal Opportunity Employer. Complete all required fields — your application is captured directly into our hiring system and acknowledged by email.
            </p>
          </div>
        )}

        {/* stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
          {steps.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', fontSize: 12, fontWeight: 800, background: i < step ? 'var(--green)' : i === step ? 'var(--navy)' : '#E6ECF2', color: i <= step ? '#fff' : '#94A3B5' }}>
                  {i < step ? <Icon name="check" size={13} /> : i + 1}
                </div>
                <span style={{ fontSize: 12.5, fontWeight: i === step ? 800 : 600, color: i === step ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{s}</span>
              </div>
              {i < steps.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? 'var(--green)' : '#E6ECF2' }} />}
            </React.Fragment>
          ))}
        </div>

        <Card pad={24}>
          {/* STEP 0 */}
          {step === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Row>
                <Inp label="First name *" v={data.first} on={v => set('first', v)} bad={touched && !data.first} />
                <Inp label="Last name *" v={data.last} on={v => set('last', v)} bad={touched && !data.last} />
              </Row>
              <Row>
                <Inp label="Email *" v={data.email} on={v => set('email', v)} bad={touched && !data.email.includes('@')} placeholder="you@email.com" />
                <Inp label="Phone *" v={data.phone} on={v => set('phone', v)} bad={touched && data.phone.length < 7} placeholder="(770) 555-0000" />
              </Row>
              <Inp label="Address" v={data.address} on={v => set('address', v)} placeholder="Street, City, GA ZIP" />
              <div>
                <Lbl>Are you eligible to work in the U.S.? *</Lbl>
                <Choice opts={['Yes','No']} v={data.eligibleUS} on={v => set('eligibleUS', v)} bad={touched && !data.eligibleUS} />
                <Hint>If offered employment, you'll provide documentation to verify eligibility (I-9 / E-Verify).</Hint>
              </div>
              <div>
                <Lbl>Have you ever been terminated or asked to resign?</Lbl>
                <Choice opts={['No','Yes']} v={data.terminated} on={v => set('terminated', v)} />
              </div>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Row>
                <Inp label="Position desired" v={data.position} on={v => set('position', v)} />
                <Inp label="Date you can start" v={data.start} on={v => set('start', v)} placeholder="e.g. 2026-07-01" />
              </Row>
              <div>
                <Lbl>How did you hear about us?</Lbl>
                <Choice opts={['Walk In','Advertisement','Referral','Other']} v={data.source} on={v => set('source', v)} />
              </div>
              <div>
                <Lbl>Preferred availability</Lbl>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 }}>
                  {days.map(d => (
                    <div key={d}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--muted)', textAlign: 'center', marginBottom: 5 }}>{d}</div>
                      <select value={data.avail[d]} onChange={e => set('avail', { ...data.avail, [d]: e.target.value })} style={{ width: '100%', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: data.avail[d] === '—' ? '#A7B2C0' : 'var(--blue-700)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 4px', background: data.avail[d] === '—' ? '#F4F7FA' : 'var(--blue-50)', cursor: 'pointer', textAlign: 'center' }}>
                        {availOpts.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <Row>
                <div><Lbl>Available for overtime?</Lbl><Choice opts={['Yes','No']} v={data.overtime} on={v => set('overtime', v)} /></div>
                <div><Lbl>Can perform essential job functions?</Lbl><Choice opts={['Yes','No']} v={data.essential} on={v => set('essential', v)} /></div>
              </Row>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: 'var(--blue-50)', border: '1px solid #D2E2F0', borderRadius: 12, padding: '13px 15px', display: 'flex', gap: 11, alignItems: 'center' }}>
                <Icon name="clock" size={18} color="var(--blue-700)" />
                <span style={{ fontSize: 12.5, color: 'var(--blue-700)', fontWeight: 600 }}>Include your last 5 years of employment history and three references in the full application. For this demo, summarize your most relevant experience below.</span>
              </div>
              <div>
                <Lbl>Most recent employer & role</Lbl>
                <Inp v={data.employer} on={v => set('employer', v)} placeholder="Employer · Job title · Dates" />
              </div>
              <div>
                <Lbl>Special skills, experience or training</Lbl>
                <textarea value={data.skills} onChange={e => set('skills', e.target.value)} placeholder="CPR certification, languages, IDD experience, CDL, etc." style={{ width: '100%', minHeight: 96, border: '1px solid var(--line)', borderRadius: 11, padding: 12, fontSize: 13.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <Lbl>Reference (name & contact)</Lbl>
                <Inp v={data.ref} on={v => set('ref', v)} placeholder="Name · email/phone · relationship · years known" />
              </div>
            </div>
          )}

          {/* STEP 3 — review & sign */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>Review your application</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Rev k="Name" v={(data.first + ' ' + data.last).trim() || '—'} />
                  <Rev k="Email" v={data.email || '—'} />
                  <Rev k="Phone" v={data.phone || '—'} />
                  <Rev k="Position" v={data.position} />
                  <Rev k="Eligible to work in U.S." v={data.eligibleUS || '—'} />
                  <Rev k="Earliest start" v={data.start || '—'} />
                </div>
              </div>
              <div style={{ background: '#FAFBFC', border: '1px solid var(--line)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Applicant Certification & Agreement</div>
                <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, fontWeight: 500, margin: 0 }}>
                  I certify the information provided is true and complete and authorize Durable Life Skills, Inc. to verify it and obtain reference information. I understand that false statements are grounds for dismissal, and that any employment is at-will. This application is valid for 60 days from the date signed.
                </p>
              </div>
              <div>
                <Lbl>Signature *</Lbl>
                {signed ? (
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', border: '1px solid #CDE9D9', background: '#F4FAF6', borderRadius: 12, padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'Caveat, cursive', fontSize: 30, color: 'var(--navy)', lineHeight: 1 }}>{(data.first + ' ' + data.last).trim() || 'Applicant'}</span>
                    <button onClick={() => setSigned(false)} style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>
                  </div>
                ) : (
                  <button onClick={() => setSigned(true)} style={{ width: '100%', border: '1.5px dashed #C4CFDB', borderRadius: 12, padding: 18, background: '#F8FAFC', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--muted)', fontSize: 13.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}><Icon name="pen" size={17} /> Tap to sign as {(data.first + ' ' + data.last).trim() || 'applicant'}</button>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18 }}>
          {step > 0 && <Button variant="ghost" icon="chevron" onClick={() => setStep(step - 1)}>Back</Button>}
          <div style={{ flex: 1 }} />
          {step < 3 && <Button variant="primary" iconRight="arrow" onClick={() => { if (canNext) { setStep(step + 1); setTouched(false); } else setTouched(true); }}>Continue</Button>}
          {step === 3 && <Button variant="primary" icon="checkCircle" disabled={!signed} onClick={() => setDone(true)}>Submit application</Button>}
        </div>
        {step === 0 && touched && !step0Valid && <div style={{ textAlign: 'right', marginTop: 8, fontSize: 12, color: '#B23A2E', fontWeight: 700 }}>Please complete the required (*) fields to continue.</div>}
      </div>
    </div>
  );
}

function CareersDone({ data, onBack }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--app-bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ maxWidth: 460, textAlign: 'center', padding: 36 }}>
        <div style={{ width: 78, height: 78, borderRadius: '50%', background: '#E4F4EC', display: 'grid', placeItems: 'center', margin: '0 auto 20px' }}><Icon name="checkCircle" size={42} color="var(--green)" /></div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>Application submitted</h2>
        <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.55, margin: '0 0 22px' }}>
          Thank you, {data.first || 'applicant'}. Your application was captured into the Durable Life Skills hiring system and a confirmation has been emailed to {data.email || 'you'}. Our team will review it shortly.
        </p>
        <div style={{ background: '#FAFBFC', border: '1px solid var(--line)', borderRadius: 12, padding: 15, textAlign: 'left', marginBottom: 22 }}>
          {[['Reference', 'APP-2026-0﻿' + Math.floor(1000 + Math.random() * 9000)], ['Status', 'Received · pending screening'], ['Valid for', '60 days from today']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0' }}><span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 700 }}>{k}</span><span style={{ fontSize: 12.5, color: 'var(--ink)', fontWeight: 700 }}>{v}</span></div>
          ))}
        </div>
        <Button variant="navy" full icon="logout" onClick={onBack}>Back to sign in</Button>
      </Card>
    </div>
  );
}

/* small form helpers */
function Row({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>; }
function Lbl({ children }) { return <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{children}</label>; }
function Hint({ children }) { return <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, marginTop: 7, lineHeight: 1.4 }}>{children}</div>; }
function Inp({ label, v, on, placeholder, bad }) {
  return (
    <div>
      {label && <Lbl>{label}</Lbl>}
      <input value={v || ''} onChange={e => on(e.target.value)} placeholder={placeholder} style={{ width: '100%', padding: '11px 13px', fontSize: 14, fontFamily: 'inherit', borderRadius: 10, border: '1.5px solid ' + (bad ? '#E2A39B' : 'var(--line)'), background: bad ? '#FFF8F7' : '#fff', color: 'var(--ink)', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  );
}
function Choice({ opts, v, on, bad }) {
  return (
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
      {opts.map(o => {
        const on_ = v === o;
        return (
          <button key={o} onClick={() => on(o)} style={{ padding: '8px 16px', borderRadius: 10, border: '1.5px solid ' + (on_ ? 'var(--blue)' : bad ? '#E2A39B' : 'var(--line)'), background: on_ ? 'var(--blue-50)' : '#fff', color: on_ ? 'var(--blue-700)' : 'var(--muted)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{o}</button>
        );
      })}
    </div>
  );
}
function Rev({ k, v }) { return <div style={{ background: '#FAFBFC', borderRadius: 10, padding: '9px 12px' }}><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v}</div></div>; }

window.CareersForm = CareersForm;
