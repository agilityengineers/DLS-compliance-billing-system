/* Durable Life Skills — Staff & Credentialing + the configurable Requirements engine */

/* ============================ STAFF ROSTER ============================ */
function Staff() {
  const ctx = React.useContext(window.AppCtx);
  const roster = ctx.users.filter(u => ctx.staffCreds[u.id]);
  const activeCount = roster.filter(u => ctx.staffCreds[u.id].accountStatus === 'active').length;
  const pending = roster.filter(u => ctx.staffCreds[u.id].accountStatus !== 'active').length;
  // expiring creds across roster
  let expiring = 0;
  roster.forEach(u => Object.values(ctx.staffCreds[u.id].creds).forEach(c => { if (c.status === 'expiring') expiring++; }));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Active staff" value={activeCount} sub="Cleared to deliver services" icon="checkCircle" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Pending activation" value={pending} sub="Credentialing in progress" icon="clock" accent="var(--amber-700)" tint="#FFF4DE" />
        <Stat label="Credentials expiring" value={expiring} sub="Renewal needed soon" icon="alert" accent={expiring ? '#B23A2E' : 'var(--green)'} tint={expiring ? '#FCE8E6' : '#E4F4EC'} />
      </div>

      <SectionTitle icon="fingerprint" action={<Button size="sm" variant="ghost" icon="grid" onClick={() => ctx.setScreen('requirements')}>Configure requirements</Button>}>Staff &amp; credentialing</SectionTitle>

      <Card pad={0}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1.4fr 1fr 110px', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--line)', fontSize: 11.5, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          <span>Staff member</span><span>Account</span><span>Credentialing</span><span>Hired</span><span></span>
        </div>
        {roster.map((u, i) => {
          const sc = ctx.staffCreds[u.id];
          const cs = window.credSummary(sc.creds, u.role, ctx.requirements);
          const active = sc.accountStatus === 'active';
          return (
            <div key={u.id} onClick={() => ctx.openStaff(u.id)} className="row-hover" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr 1.4fr 1fr 110px', gap: 12, padding: '14px 20px', borderBottom: i < roster.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                <Avatar initials={u.initials} color={u.color} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{window.ROLE_LABEL[u.role]}</div>
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: active ? 'var(--green)' : 'var(--amber-700)', background: active ? '#E4F4EC' : '#FFF4DE', padding: '4px 11px', borderRadius: 999, width: 'fit-content' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--amber)' }} />{active ? 'Active' : 'Inactive'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <div style={{ flex: 1, maxWidth: 90 }}><ProgressBar value={cs.total ? cs.done / cs.total * 100 : 0} color={cs.ready ? 'var(--green)' : 'var(--amber)'} height={6} /></div>
                <span style={{ fontSize: 12, fontWeight: 700, color: cs.ready ? 'var(--green)' : 'var(--muted)' }}>{cs.done}/{cs.total}</span>
              </div>
              <span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{sc.hiredOn}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--blue)' }}>Open <Icon name="chevron" size={14} color="#C4CFDB" /></span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/* ============================ STAFF DETAIL ============================ */
function StaffDetail() {
  const ctx = React.useContext(window.AppCtx);
  const u = ctx.users.find(x => x.id === ctx.selectedStaff) || ctx.users.find(x => ctx.staffCreds[x.id]);
  const sc = ctx.staffCreds[u.id];
  const [toast, setToast] = React.useState(null);
  const [override, setOverride] = React.useState(false);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const cs = window.credSummary(sc.creds, u.role, ctx.requirements);
  const active = sc.accountStatus === 'active';

  const activate = (forced) => {
    ctx.setStaffCreds({ ...ctx.staffCreds, [u.id]: { ...sc, accountStatus: 'active', activatedOn: '2026-06-07', overridden: !!forced } });
    ctx.setUsers(ctx.users.map(x => x.id === u.id ? { ...x, accountStatus: 'active' } : x));
    setOverride(false);
    flash(forced ? 'Activated by admin override — reason logged to the audit trail.' : 'Staff member activated — cleared to be scheduled, document, and bill.');
  };
  const deactivate = () => {
    ctx.setStaffCreds({ ...ctx.staffCreds, [u.id]: { ...sc, accountStatus: 'inactive' } });
    ctx.setUsers(ctx.users.map(x => x.id === u.id ? { ...x, accountStatus: 'inactive' } : x));
    flash('Account deactivated — removed from scheduling and billing eligibility.');
  };

  return (
    <div>
      {toast && <div style={stToast}><Icon name="checkCircle" size={17} color="#7FE3B0" />{toast}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => ctx.setScreen('staff')} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 13px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>
          <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} /> Staff
        </button>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
          <Avatar initials={u.initials} color={u.color} size={54} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{u.name}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{u.title} · hired {sc.hiredOn}{sc.fromApplicant ? ' · via hiring pipeline' : ''}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: active ? 'var(--green)' : 'var(--amber-700)', background: active ? '#E4F4EC' : '#FFF4DE', padding: '7px 14px', borderRadius: 999 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--green)' : 'var(--amber)' }} />{active ? 'Active account' : 'Inactive account'}
          </span>
        </div>
      </Card>

      {/* gate banner */}
      {!active && (
        <Card style={{ marginBottom: 16, borderColor: cs.ready ? '#CDE9D9' : '#F2E2BC', background: cs.ready ? '#F4FAF6' : '#FFFBF2' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: cs.ready ? '#E1F2E9' : '#FFF1D6', display: 'grid', placeItems: 'center', color: cs.ready ? 'var(--green)' : 'var(--amber-700)', flex: 'none' }}><Icon name={cs.ready ? 'checkCircle' : 'lock'} size={22} /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{cs.ready ? 'Ready to activate' : 'Blocked from billable services'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>{cs.ready ? 'All required credentialing is verified.' : cs.done + ' of ' + cs.total + ' required items verified. This account cannot be scheduled or bill until cleared — or an admin overrides.'}</div>
            </div>
            {cs.ready
              ? <Button variant="primary" icon="checkCircle" onClick={() => activate(false)}>Activate account</Button>
              : <Button variant="ghost" icon="shield" onClick={() => setOverride(true)}>Override &amp; activate</Button>}
          </div>
          {override && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F2E2BC' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--amber-700)', marginBottom: 8 }}>Admin override — reason (logged to audit trail)</div>
              <input defaultValue="Conditional start approved by agency director; items to clear within 14 days." style={{ width: '100%', border: '1px solid #F2E2BC', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" size="sm" onClick={() => setOverride(false)}>Cancel</Button>
                <div style={{ flex: 1 }} />
                <Button variant="primary" size="sm" icon="checkCircle" onClick={() => activate(true)}>Confirm override activation</Button>
              </div>
            </div>
          )}
        </Card>
      )}
      {active && (
        <Card style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="checkCircle" size={20} color="var(--green)" />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>This account is active and eligible to be scheduled, document services, and bill{sc.overridden ? ' (activated by admin override)' : ''}.</span>
          <Button variant="danger" size="sm" icon="x" onClick={deactivate}>Deactivate</Button>
        </Card>
      )}

      <window.CredentialingView creds={sc.creds} role={u.role} requirements={ctx.requirements} cs={cs} onWaive={() => flash('Requirement waived with admin reason — logged to the audit trail.')} />
    </div>
  );
}

/* ============================ REQUIREMENTS ENGINE ============================ */
function Requirements() {
  const ctx = React.useContext(window.AppCtx);
  const [toast, setToast] = React.useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const reqs = ctx.requirements;
  const cats = [...new Set(reqs.map(r => r.category))];

  const patch = (id, key, val) => {
    ctx.setRequirements(reqs.map(r => r.id === id ? { ...r, [key]: val } : r));
  };
  const toggleRequired = (r) => { patch(r.id, 'required', !r.required); flash(r.label + (r.required ? ' is now optional' : ' is now required') + ' — applied across all staff checklists.'); };
  const toggleGating = (r) => { patch(r.id, 'gating', !r.gating); flash(r.label + (r.gating ? ' no longer blocks activation' : ' now blocks activation')); };

  const requiredCount = reqs.filter(r => r.required).length;
  const gatingCount = reqs.filter(r => r.required && r.gating).length;

  return (
    <div>
      {toast && <div style={stToast}><Icon name="grid" size={16} color="#FFD27A" />{toast}</div>}

      <Card style={{ marginBottom: 18, background: 'linear-gradient(160deg,#EEF5FB,#FBFDFF)', borderColor: '#D6E4F1' }}>
        <div style={{ display: 'flex', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--navy)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="grid" size={21} color="#fff" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, marginBottom: 4 }}>Credentialing requirements — the rules that gate everything</div>
            <div style={{ fontSize: 13, color: '#3E5A73', lineHeight: 1.55, fontWeight: 500 }}>
              Turn requirements on/off and decide which ones <b>block</b> a hire from delivering billable services. These settings are foundational: every applicant and staff member's checklist, the activation gate, and (over time) scheduling and billing eligibility all read from here. No code changes needed when policy shifts.
            </div>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <Stat label="Requirements defined" value={reqs.length} sub="Across 4 categories" icon="clipboard" accent="var(--blue)" />
        <Stat label="Currently required" value={requiredCount} sub={(reqs.length - requiredCount) + ' optional'} icon="checkCircle" accent="var(--green)" tint="#E4F4EC" />
        <Stat label="Gating (block activation)" value={gatingCount} sub="Must clear before Active" icon="shield" accent="var(--amber-700)" tint="#FFF4DE" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <SectionTitle icon="grid">Requirement registry</SectionTitle>
        <Button size="sm" variant="ghost" icon="plus" onClick={() => flash('In production this adds a custom requirement (label, category, roles, automation, gating).')}>Add requirement</Button>
      </div>

      {cats.map(cat => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)', letterSpacing: '.04em', textTransform: 'uppercase', margin: '0 4px 9px' }}>{cat}</div>
          <Card pad={0}>
            {reqs.filter(r => r.category === cat).map((r, i, arr) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--line)' : 'none', opacity: r.required ? 1 : 0.62 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{r.label}</span>
                    {r.automated && <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--green)', background: '#E4F4EC', padding: '1px 6px', borderRadius: 5, letterSpacing: '.03em', whiteSpace: 'nowrap', flex: 'none' }}>AUTO {r.vendor ? '· ' + r.vendor : ''}</span>}
                    {r.renews && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber-700)', background: '#FFF4DE', padding: '1px 7px', borderRadius: 5, whiteSpace: 'nowrap', flex: 'none' }}>renews {r.renews}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginTop: 4 }}>{r.note} · applies to {r.appliesTo.length === 5 ? 'all roles' : r.appliesTo.join(', ')}</div>
                </div>
                <Toggle on={r.gating && r.required} disabled={!r.required} label="Gating" onClick={() => toggleGating(r)} small />
                <Toggle on={r.required} label="Required" onClick={() => toggleRequired(r)} />
              </div>
            ))}
          </Card>
        </div>
      ))}
      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.5, padding: '4px 4px 0' }}>
        <b style={{ color: 'var(--ink)' }}>Required</b> adds the item to every matching staff member's checklist. <b style={{ color: 'var(--ink)' }}>Gating</b> means it must be verified (or admin-waived) before the account can go Active. Toggle a required item off and watch the activation math update across Staff &amp; the hiring pipeline.
      </div>
    </div>
  );
}

function Toggle({ on, onClick, label, disabled, small }) {
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: disabled ? 0.4 : 1 }}>
      {label && <span style={{ fontSize: 11.5, fontWeight: 800, color: on ? 'var(--ink)' : 'var(--muted)', width: small ? 44 : 58, textAlign: 'right' }}>{label}</span>}
      <span style={{ width: 40, height: 23, borderRadius: 999, background: on ? 'var(--green)' : '#CBD5E1', position: 'relative', transition: 'background .18s', flex: 'none' }}>
        <span style={{ position: 'absolute', top: 2.5, left: on ? 20 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .18s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
      </span>
    </button>
  );
}

Object.assign(window, { Staff, StaffDetail, Requirements, Toggle });

const stToast = { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--navy)', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, zIndex: 70, boxShadow: '0 10px 30px rgba(10,25,45,.3)', display: 'flex', alignItems: 'center', gap: 9, maxWidth: '90vw' };
