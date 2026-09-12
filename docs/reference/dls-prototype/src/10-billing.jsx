/* Durable Life Skills — Smart Billing: 837P generation, claims, denials, 835 */
function Billing() {
  const ctx = React.useContext(window.AppCtx);
  const ready = ctx.notes.filter(n => n.status === 'approved');
  const [picked, setPicked] = React.useState(ready.map(n => n.id));
  const [preview, setPreview] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);

  React.useEffect(() => { setPicked(ctx.notes.filter(n => n.status === 'approved').map(n => n.id)); }, [ctx.notes]);

  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const generate = () => {
    const chosen = ready.filter(n => picked.includes(n.id));
    const batch = '837P-26159-' + String(30 + ctx.claims.length).padStart(4, '0');
    const newClaims = chosen.map((n, i) => {
      const svc = svcByCode(n.service);
      return {
        id: 'cl' + Date.now() + i, claimNo: '837P-26159-' + String(30 + ctx.claims.length + i).padStart(4, '0'),
        client: n.client, note: n.id, service: n.service, units: n.units,
        charge: +(n.units * svc.rate).toFixed(2), status: 'submitted', dos: n.date,
        payer: 'GA Medicaid (GAMMIS)', submitted: '2026-06-06', paid: null, remit: null,
      };
    });
    ctx.setClaims([...newClaims, ...ctx.claims]);
    ctx.setNotes(ctx.notes.map(n => picked.includes(n.id) ? { ...n, status: 'billed' } : n));
    setPreview(false);
    setToast(chosen.length + ' claims assembled into 837P batch & transmitted to GAMMIS via clearinghouse.');
    setTimeout(() => setToast(null), 3200);
  };

  const totalCharge = ready.filter(n => picked.includes(n.id)).reduce((s, n) => s + n.units * svcByCode(n.service).rate, 0);

  return (
    <div>
      {toast && <div style={toastStyle}><Icon name="checkCircle" size={17} color="#7FE3B0" />{toast}</div>}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Ready to bill" value={ready.length} sub={'$' + totalCharge.toFixed(2) + ' selected'} icon="doc" accent="var(--blue)" />
        <Stat label="In flight" value={ctx.claims.filter(c => ['submitted','accepted'].includes(c.status)).length} sub="Awaiting 835" icon="billing" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Paid" value={ctx.claims.filter(c => c.status === 'paid').length} sub="Reconciled" icon="checkCircle" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Denied" value={ctx.claims.filter(c => c.status === 'denied').length} sub="Needs rework" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
      </div>

      {/* Ready to bill */}
      {ready.length > 0 && (
        <Card pad={0} style={{ marginBottom: 20 }}>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Icon name="sparkle" size={18} color="var(--amber-700)" /><h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, whiteSpace: 'nowrap' }}>Approved notes ready to bill</h2></div>
            <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>{picked.length} of {ready.length} selected</span>
            <div style={{ flex: 1 }} />
            <Button variant="primary" icon="billing" disabled={picked.length === 0} onClick={() => setPreview(true)}>Generate 837P ({picked.length})</Button>
          </div>
          {ready.map((n, i) => {
            const c = clientById(n.client); const svc = svcByCode(n.service); const on = picked.includes(n.id);
            return (
              <div key={n.id} onClick={() => toggle(n.id)} className="row-hover" style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 20px', borderBottom: i < ready.length - 1 ? '1px solid var(--line)' : 'none', cursor: 'pointer' }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, flex: 'none', border: '1.5px solid ' + (on ? 'var(--blue)' : '#C4CFDB'), background: on ? 'var(--blue)' : '#fff', display: 'grid', placeItems: 'center' }}>{on && <Icon name="check" size={13} color="#fff" />}</div>
                <Avatar initials={c.initials} color={c.color} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{svc.code}·{svc.mod} · {n.units} units · DOS {n.date.slice(5)}</div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>{c.waiver} waiver<br/>{c.medicaid}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--green)', width: 70, textAlign: 'right' }}>${(n.units * svc.rate).toFixed(2)}</div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Claims table */}
      <SectionTitle icon="billing">All claims</SectionTitle>
      <Card pad={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr 0.8fr 1fr 1.1fr 24px', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          <span>Claim #</span><span>Client</span><span>Service</span><span>Units</span><span>Charge</span><span>Status</span><span></span>
        </div>
        {ctx.claims.map((cl, i) => {
          const c = clientById(cl.client); const svc = svcByCode(cl.service); const open = expanded === cl.id;
          return (
            <div key={cl.id}>
              <div onClick={() => setExpanded(open ? null : cl.id)} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.6fr 1fr 0.8fr 1fr 1.1fr 24px', gap: 12, padding: '13px 20px', borderBottom: '1px solid var(--line)', alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', fontFamily: 'monospace' }}>{cl.claimNo}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}><Avatar initials={c.initials} color={c.color} size={28} /><span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span></div>
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{svc.code}·{svc.mod}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>{cl.units}</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>${cl.charge.toFixed(2)}</span>
                <StatusPill status={cl.status} small />
                <Icon name="chevronDown" size={15} color="#C4CFDB" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
              </div>
              {open && (
                <div style={{ padding: '16px 20px 18px 20px', background: '#FAFCFE', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: cl.denial ? 14 : 0 }}>
                    <KV k="Payer" v={cl.payer} /><KV k="Date of service" v={cl.dos} /><KV k="Submitted" v={cl.submitted || '—'} /><KV k="Paid" v={cl.paid != null ? '$' + cl.paid.toFixed(2) : 'Pending'} />
                  </div>
                  {cl.denial && (
                    <div style={{ background: '#FFF8F7', border: '1px solid #F3C9C4', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 13 }}>
                      <Icon name="alert" size={20} color="#B23A2E" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#B23A2E' }}>Denied · CARC {cl.denial.code}</div>
                        <div style={{ fontSize: 12.5, color: '#8A3A30', fontWeight: 500 }}>{cl.denial.text}</div>
                      </div>
                      <Button size="sm" variant="navy" icon="refresh" onClick={() => ctx.setScreen('authorizations')}>Check authorization</Button>
                    </div>
                  )}
                  {cl.status === 'paid' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontSize: 12.5, fontWeight: 700 }}><Icon name="checkCircle" size={16} /> Reconciled against 835 remittance · trace EFT-2026-0061142</div>}
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {preview && <EDIPreview ready={ready.filter(n => picked.includes(n.id))} onClose={() => setPreview(false)} onSend={generate} total={totalCharge} />}
    </div>
  );
}

function EDIPreview({ ready, onClose, onSend, total }) {
  const seg = (label, val) => `${label}*${val}`;
  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 18, width: 'min(720px,92vw)', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 30px 80px rgba(10,25,45,.4)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--navy)', display: 'grid', placeItems: 'center' }}><Icon name="file" size={19} color="#fff" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>837P Professional claim — batch preview</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{ready.length} claim lines · {'$' + total.toFixed(2)} · GA Medicaid (GAMMIS) via clearinghouse</div>
          </div>
          <button onClick={onClose} style={{ ...iconBtnSm }}><Icon name="x" size={18} color="var(--muted)" /></button>
        </div>
        <div style={{ padding: 22 }}>
          <div style={{ background: '#0F2032', borderRadius: 12, padding: 16, fontFamily: 'monospace', fontSize: 12, color: '#9FD8B6', lineHeight: 1.7, overflowX: 'auto' }}>
            <div style={{ color: '#6E8CA8' }}>~ ISA/GS envelope · 005010X222A1 ~</div>
            <div><span style={{ color: '#E6B86B' }}>BHT</span>*0019*00*DLS{Date.now().toString().slice(-6)}*20260606*0930*CH</div>
            <div><span style={{ color: '#E6B86B' }}>NM1</span>*85*2*DURABLE LIFE SKILLS INC*****XX*1487654321 <span style={{ color: '#6E8CA8' }}>(billing provider NPI)</span></div>
            {ready.map((n, i) => { const c = clientById(n.client); const svc = svcByCode(n.service); return (
              <div key={n.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1E344B' }}>
                <div><span style={{ color: '#E6B86B' }}>CLM</span>*{('DLS' + (i+1) + Date.now().toString().slice(-4))}*{(n.units * svc.rate).toFixed(2)}***11:B:1*Y*A*Y*Y</div>
                <div><span style={{ color: '#E6B86B' }}>NM1</span>*IL*1*{c.name.split(' ')[1].toUpperCase()}*{c.name.split(' ')[0].toUpperCase()}****MI*{c.medicaid} <span style={{ color: '#6E8CA8' }}>(member)</span></div>
                <div><span style={{ color: '#E6B86B' }}>SV1</span>*HC:{svc.code}:{svc.mod}*{(n.units * svc.rate).toFixed(2)}*UN*{n.units}***1 <span style={{ color: '#6E8CA8' }}>(service line)</span></div>
                <div><span style={{ color: '#E6B86B' }}>DTP</span>*472*D8*{n.date.replace(/-/g,'')} <span style={{ color: '#6E8CA8' }}>(date of service)</span></div>
              </div>
            ); })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, background: 'var(--blue-50)', borderRadius: 11, padding: '11px 14px' }}>
            <Icon name="shield" size={17} color="var(--blue-700)" />
            <span style={{ fontSize: 12.5, color: 'var(--blue-700)', fontWeight: 600, flex: 1 }}>Each line is traceable to a signed, EVV-verified note and an active prior authorization. Sent over an encrypted clearinghouse connection.</span>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <div style={{ flex: 1 }} />
            <Button variant="primary" icon="arrow" onClick={onSend}>Transmit batch to GAMMIS</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Remittance (835) ---------- */
function Remittance() {
  const ctx = React.useContext(window.AppCtx);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Remittances posted" value={ctx.remits.filter(r => r.status === 'Posted').length} sub="Auto-reconciled" icon="money" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Collected (MTD)" value={'$' + ctx.remits.reduce((s, r) => s + r.amount, 0).toFixed(2)} sub="Net of denials" icon="billing" accent="var(--blue)" />
        <Stat label="Denied lines" value={ctx.remits.filter(r => r.status.includes('Denied')).length} sub="Routed to rework" icon="alert" accent="#B23A2E" tint="#FCE8E6" />
      </div>
      <SectionTitle icon="money">835 Electronic remittance advice</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ctx.remits.map(r => {
          const denied = r.status.includes('Denied');
          return (
            <Card key={r.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: denied ? '#FCE8E6' : '#E4F4EC', display: 'grid', placeItems: 'center', color: denied ? '#B23A2E' : 'var(--green)', flex: 'none' }}><Icon name={denied ? 'alert' : 'money'} size={22} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800 }}>{r.payer}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Trace {r.traceNo} · {r.date} · {r.claims.length} claim(s)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: denied ? '#B23A2E' : 'var(--green)' }}>${r.amount.toFixed(2)}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: denied ? '#B23A2E' : 'var(--green)' }}>{r.status}</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 13, paddingTop: 13, borderTop: '1px solid var(--line)' }}>
                {r.claims.map(cid => { const cl = ctx.claims.find(c => c.id === cid); if (!cl) return null; const c = clientById(cl.client); return (
                  <div key={cid} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', borderRadius: 9, padding: '6px 11px', fontSize: 12, fontWeight: 600 }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--navy)' }}>{cl.claimNo}</span>
                    <span style={{ color: 'var(--muted)' }}>· {c.name} · ${cl.charge.toFixed(2)}</span>
                    {cl.denial && <span style={{ color: '#B23A2E', fontWeight: 700 }}>· {cl.denial.code}</span>}
                  </div>
                ); })}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function KV({ k, v }) { return <div><div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 3 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v}</div></div>; }
const toastStyle = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--navy)', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, zIndex: 60, boxShadow: '0 10px 30px rgba(10,25,45,.3)', display: 'flex', alignItems: 'center', gap: 9, maxWidth: '90vw' };
const modalBackdrop = { position: 'fixed', inset: 0, background: 'rgba(15,30,50,.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 20 };
const iconBtnSm = { width: 34, height: 34, borderRadius: 9, border: '1px solid var(--line)', background: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' };

Object.assign(window, { Billing, Remittance });
