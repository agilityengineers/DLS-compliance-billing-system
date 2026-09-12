/* Durable Life Skills — icon set (inline SVG, stroke-based, 24x24 grid) */
function Icon({ name, size = 20, stroke = 1.8, color = 'currentColor', style }) {
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" {...p}/><rect x="14" y="3" width="7" height="5" rx="1.5" {...p}/><rect x="14" y="12" width="7" height="9" rx="1.5" {...p}/><rect x="3" y="16" width="7" height="5" rx="1.5" {...p}/></>,
    doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...p}/><path d="M14 3v5h5M9 13h6M9 17h6" {...p}/></>,
    pen: <><path d="M12 20h9" {...p}/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" {...p}/></>,
    check: <><path d="M20 6 9 17l-5-5" {...p}/></>,
    checkCircle: <><circle cx="12" cy="12" r="9" {...p}/><path d="m8.5 12 2.5 2.5L16 9" {...p}/></>,
    shield: <><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" {...p}/><path d="m9 12 2 2 4-4" {...p}/></>,
    billing: <><rect x="2" y="5" width="20" height="14" rx="2" {...p}/><path d="M2 10h20M6 15h4" {...p}/></>,
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" {...p}/><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2H9z" {...p}/><path d="M9 11h6M9 15h4" {...p}/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" {...p}/><path d="M3 9h18M8 3v4M16 3v4" {...p}/></>,
    users: <><circle cx="9" cy="8" r="3.2" {...p}/><path d="M3.5 20a5.5 5.5 0 0 1 11 0" {...p}/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M16.5 20a5.5 5.5 0 0 0-2-4.3" {...p}/></>,
    chart: <><path d="M4 4v16h16" {...p}/><path d="M7 14l3-4 3 2 4-6" {...p}/></>,
    pin: <><path d="M12 21s-6.5-5.5-6.5-11a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11-6.5 11z" {...p}/><circle cx="12" cy="10" r="2.4" {...p}/></>,
    clock: <><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7v5l3 2" {...p}/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...p}/><path d="M13.7 21a2 2 0 0 1-3.4 0" {...p}/></>,
    search: <><circle cx="11" cy="11" r="7" {...p}/><path d="m21 21-4.3-4.3" {...p}/></>,
    sparkle: <><path d="M12 3l1.8 4.7L18.5 9.5 13.8 11 12 16l-1.8-5L5.5 9.5l4.7-1.8z" {...p}/><path d="M19 14l.7 1.8L21.5 16.5 19.7 17 19 19l-.7-2-1.8-.5 1.8-.7z" {...p}/></>,
    lock: <><rect x="5" y="11" width="14" height="9" rx="2" {...p}/><path d="M8 11V8a4 4 0 0 1 8 0v3" {...p}/></>,
    alert: <><path d="M12 4 2.5 20h19z" {...p}/><path d="M12 10v4M12 17.5v.5" {...p}/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" {...p}/></>,
    chevron: <><path d="m9 6 6 6-6 6" {...p}/></>,
    chevronDown: <><path d="m6 9 6 6 6-6" {...p}/></>,
    plus: <><path d="M12 5v14M5 12h14" {...p}/></>,
    x: <><path d="M18 6 6 18M6 6l12 12" {...p}/></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...p}/><path d="M16 17l5-5-5-5M21 12H9" {...p}/></>,
    phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.5" {...p}/><path d="M11 18.5h2" {...p}/></>,
    gps: <><circle cx="12" cy="12" r="3" {...p}/><path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...p}/><circle cx="12" cy="12" r="8" {...p}/></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" {...p}/><path d="M14 3v5h5" {...p}/></>,
    fingerprint: <><path d="M12 11a2 2 0 0 1 2 2c0 2.5-.5 4.5-1.2 6" {...p}/><path d="M8.5 6.8a6 6 0 0 1 9 5.2c0 1 0 2-.3 3" {...p}/><path d="M6 12a6 6 0 0 1 .9-3.2" {...p}/><path d="M9.2 16.5c.5-1.1.8-2.3.8-3.5a2 2 0 0 0-2-2" {...p}/></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5" {...p}/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" {...p}/></>,
    money: <><circle cx="12" cy="12" r="9" {...p}/><path d="M12 7v10M9.5 9.2a2.2 2.2 0 0 1 2.5-1.2c1.4.2 2 1 2 1.8 0 2-4.5 1.2-4.5 3.2 0 .9.8 1.7 2.2 1.8a2.3 2.3 0 0 0 2.3-1.1" {...p}/></>,
    target: <><circle cx="12" cy="12" r="8.5" {...p}/><circle cx="12" cy="12" r="4.5" {...p}/><circle cx="12" cy="12" r="1" fill={color} stroke="none"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" {...p}/><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M3 12h18" {...p}/></>,
    pill: <><rect x="3.5" y="8" width="17" height="8" rx="4" transform="rotate(45 12 12)" {...p}/><path d="M9 9l6 6" {...p}/></>,
    grid: <><rect x="3" y="3" width="8" height="8" rx="1.5" {...p}/><rect x="13" y="3" width="8" height="8" rx="1.5" {...p}/><rect x="3" y="13" width="8" height="8" rx="1.5" {...p}/><rect x="13" y="13" width="8" height="8" rx="1.5" {...p}/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flex: 'none', ...style }} aria-hidden="true">
      {paths[name] || null}
    </svg>
  );
}

window.Icon = Icon;
