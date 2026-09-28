/* ─── Theme Colors ─── */
export const C = {
  bg:           '#0f172a',
  bgLight:      '#1e293b',
  bgLighter:    '#334155',
  accent:       '#38bdf8',
  accentDark:   '#0ea5e9',
  accentGlow:   'rgba(56,189,248,.15)',
  accentBorder: 'rgba(56,189,248,.12)',
  text:         '#e2e8f0',
  textBright:   '#f8fafc',
  textMuted:    '#94a3b8',
  textDim:      '#64748b',
  border:       'rgba(148,163,184,.1)',
  borderLight:  'rgba(148,163,184,.05)',
  green:        '#22c55e',
  greenLight:   '#4ade80',
  greenBg:      'rgba(34,197,94,.12)',
  greenBorder:  'rgba(34,197,94,.3)',
  red:          '#ef4444',
  redLight:     '#f87171',
  redBg:        'rgba(239,68,68,.1)',
  redBorder:    'rgba(239,68,68,.25)',
  redText:      '#fca5a5',
  yellow:       '#f59e0b',
  yellowLight:  '#fbbf24',
  yellowBg:     'rgba(245,158,11,.1)',
  purple:       '#a78bfa',
  purpleBg:     'rgba(167,139,250,.1)',
};

/* ─── Global CSS ─── */
export const GLOBAL_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Cairo', sans-serif;
    background: ${C.bg};
    color: ${C.text};
    direction: rtl;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* ─── Keyframes ─── */
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: .55; transform: scale(1.35); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(.92); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* ─── Cards ─── */
  .card {
    background: ${C.bgLight};
    border: 1px solid ${C.accentBorder};
    border-radius: 16px;
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease;
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
    background: linear-gradient(135deg, ${C.accentGlow} 0%, transparent 60%);
    pointer-events: none;
  }
  .card:hover {
    transform: translateY(-3px);
    box-shadow: 0 10px 30px rgba(56,189,248,.1);
    border-color: rgba(56,189,248,.25);
  }

  /* ─── Buttons ─── */
  .btn {
    border: none;
    padding: 9px 20px;
    border-radius: 10px;
    font-family: 'Cairo', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: transform .2s ease, box-shadow .2s ease, opacity .2s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn:hover:not(:disabled) { transform: translateY(-1px); }
  .btn:active:not(:disabled) { transform: scale(.97); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }

  .btn-accent {
    background: linear-gradient(135deg, ${C.accentDark}, ${C.accent});
    color: #fff;
  }
  .btn-accent:hover:not(:disabled) {
    box-shadow: 0 4px 18px rgba(56,189,248,.35);
  }
  .btn-danger {
    background: linear-gradient(135deg, #dc2626, ${C.red});
    color: #fff;
  }
  .btn-danger:hover:not(:disabled) {
    box-shadow: 0 4px 18px rgba(239,68,68,.3);
  }
  .btn-ghost {
    background: transparent;
    color: ${C.textMuted};
    border: 1px solid ${C.border};
  }
  .btn-ghost:hover:not(:disabled) {
    background: rgba(148,163,184,.06);
    color: ${C.text};
  }
  .btn-sm { padding: 5px 12px; font-size: 13px; border-radius: 8px; }

  /* ─── Inputs ─── */
  .input, .select {
    background: ${C.bg};
    color: ${C.text};
    border: 1px solid ${C.border};
    border-radius: 10px;
    padding: 10px 14px;
    font-family: 'Cairo', sans-serif;
    font-size: 14px;
    outline: none;
    transition: border-color .2s ease, box-shadow .2s ease;
    width: 100%;
  }
  .input:focus, .select:focus {
    border-color: ${C.accent};
    box-shadow: 0 0 0 3px ${C.accentGlow};
  }
  .input::placeholder { color: ${C.textDim}; }
  .select { cursor: pointer; appearance: none; }
  .select option { background: ${C.bgLight}; color: ${C.text}; }

  /* ─── Table ─── */
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th {
    text-align: right;
    padding: 14px 20px;
    font-size: 13px;
    font-weight: 600;
    color: ${C.textDim};
    border-bottom: 1px solid ${C.border};
    white-space: nowrap;
  }
  .tbl td {
    padding: 14px 20px;
    border-bottom: 1px solid ${C.borderLight};
    font-size: 14px;
  }
  .tbl tbody tr { transition: background .2s ease; }
  .tbl tbody tr:hover { background: rgba(56,189,248,.04); }
  .tbl tbody tr:last-child td { border-bottom: none; }

  /* ─── Badge ─── */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* ─── Modal ─── */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn .2s ease;
    padding: 20px;
  }
  .modal-content {
    background: ${C.bgLight};
    border: 1px solid ${C.accentBorder};
    border-radius: 20px;
    padding: 32px;
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    animation: scaleIn .25s ease;
  }

  /* ─── Tabs ─── */
  .tabs {
    display: flex;
    gap: 4px;
    background: ${C.bg};
    border-radius: 12px;
    padding: 4px;
    margin-bottom: 24px;
  }
  .tab {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 10px;
    font-family: 'Cairo', sans-serif;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all .2s ease;
    background: transparent;
    color: ${C.textMuted};
  }
  .tab.active {
    background: linear-gradient(135deg, ${C.accentDark}, ${C.accent});
    color: #fff;
    box-shadow: 0 2px 10px rgba(56,189,248,.25);
  }
  .tab:not(.active):hover { color: ${C.text}; background: rgba(148,163,184,.06); }

  /* ─── Sidebar ─── */
  .sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 260px;
    height: 100vh;
    background: ${C.bg};
    border-left: 1px solid ${C.border};
    display: flex;
    flex-direction: column;
    z-index: 100;
    transition: transform .3s ease;
  }
  .sidebar-logo {
    padding: 24px 20px;
    border-bottom: 1px solid ${C.border};
  }
  .sidebar-nav { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; gap: 4px; }
  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    text-decoration: none;
    color: ${C.textMuted};
    font-size: 15px;
    font-weight: 600;
    transition: all .2s ease;
  }
  .sidebar-link:hover { color: ${C.text}; background: rgba(148,163,184,.06); }
  .sidebar-link.active {
    color: #fff;
    background: linear-gradient(135deg, ${C.accentDark}, ${C.accent});
    box-shadow: 0 2px 12px rgba(56,189,248,.2);
  }
  .sidebar-link .icon { font-size: 20px; width: 28px; text-align: center; }
  .main-content {
    margin-right: 260px;
    min-height: 100vh;
    padding: 24px 32px 48px;
  }

  /* ─── Hamburger (mobile) ─── */
  .hamburger {
    display: none;
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 200;
    background: ${C.bgLight};
    border: 1px solid ${C.border};
    border-radius: 10px;
    padding: 10px;
    cursor: pointer;
    color: ${C.text};
    font-size: 20px;
    line-height: 1;
  }
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.5);
    z-index: 99;
  }

  /* ─── Scrollbar ─── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.bgLighter}; border-radius: 3px; }

  /* ─── Responsive ─── */
  @media (max-width: 768px) {
    .sidebar { transform: translateX(100%); }
    .sidebar.open { transform: translateX(0); animation: slideInRight .3s ease; }
    .sidebar-overlay.open { display: block; }
    .hamburger { display: block; }
    .main-content { margin-right: 0; padding: 20px 16px 40px; padding-top: 64px; }
  }
`;
