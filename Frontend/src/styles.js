/* ─── Theme Colors ─── */
export const C = {
  bg:           'var(--bg-page)',
  bgLight:      'var(--bg-surface)',
  bgLighter:    'var(--bg-surface-elevated)',
  accent:       'var(--primary)',
  accentDark:   'var(--primary-hover)',
  accentGlow:   'var(--primary-bg)',
  accentBorder: 'var(--border-subtle)',
  text:         'var(--text-main)',
  textBright:   'var(--text-main)',
  textMuted:    'var(--text-muted)',
  textDim:      'var(--text-dim)',
  border:       'var(--border-subtle)',
  borderLight:  'var(--border-subtle)',
  green:        '#10b981',
  greenLight:   '#34d399',
  greenBg:      'var(--badge-ready-bg)',
  greenBorder:  'var(--badge-ready-border)',
  red:          '#ef4444',
  redLight:     '#f87171',
  redBg:        'var(--badge-capped-bg)',
  redBorder:    'var(--badge-capped-border)',
  redText:      'var(--badge-capped-text)',
  yellow:       '#f59e0b',
  yellowLight:  '#fbbf24',
  yellowBg:     'var(--badge-paused-bg)',
  purple:       '#a78bfa',
  purpleBg:     'rgba(167,139,250,.1)',
};

/* ─── Global CSS with Light and Dark Tokens ─── */
export const GLOBAL_CSS = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  :root, :root[data-theme="dark"] {
    --bg-page: #090d16;
    --bg-surface: #111827;
    --bg-surface-elevated: #1a2234;
    --bg-input: #0b0f19;
    --border-subtle: #1e293b;
    --border-highlight: #334155;
    --text-main: #f8fafc;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --primary: #38bdf8;
    --primary-hover: #0ea5e9;
    --primary-bg: rgba(56, 189, 248, 0.12);
    --primary-border: rgba(56, 189, 248, 0.3);
    --badge-ready-bg: rgba(16, 185, 129, 0.12);
    --badge-ready-text: #10b981;
    --badge-ready-border: rgba(16, 185, 129, 0.3);
    --badge-capped-bg: rgba(239, 68, 68, 0.12);
    --badge-capped-text: #f87171;
    --badge-capped-border: rgba(239, 68, 68, 0.3);
    --badge-paused-bg: rgba(245, 158, 11, 0.12);
    --badge-paused-text: #fbbf24;
    --badge-paused-border: rgba(245, 158, 11, 0.3);
    --shadow-card: 0 4px 20px rgba(0,0,0,0.4);
    --bar-bg: #1e293b;
    --bar-fill: #38bdf8;
    --scrollbar-thumb: #334155;
  }

  :root[data-theme="light"] {
    --bg-page: #f1f5f9;
    --bg-surface: #ffffff;
    --bg-surface-elevated: #f8fafc;
    --bg-input: #ffffff;
    --border-subtle: #e2e8f0;
    --border-highlight: #cbd5e1;
    --text-main: #0f172a;
    --text-muted: #475569;
    --text-dim: #64748b;
    --primary: #0284c7;
    --primary-hover: #0369a1;
    --primary-bg: #e0f2fe;
    --primary-border: #bae6fd;
    --badge-ready-bg: #ecfdf5;
    --badge-ready-text: #059669;
    --badge-ready-border: #a7f3d0;
    --badge-capped-bg: #fef2f2;
    --badge-capped-text: #dc2626;
    --badge-capped-border: #fecaca;
    --badge-paused-bg: #fffbeb;
    --badge-paused-text: #d97706;
    --badge-paused-border: #fde68a;
    --shadow-card: 0 2px 12px rgba(15, 23, 42, 0.06);
    --bar-bg: #e2e8f0;
    --bar-fill: #0284c7;
    --scrollbar-thumb: #cbd5e1;
  }

  body {
    font-family: 'Cairo', sans-serif;
    background: var(--bg-page);
    color: var(--text-main);
    direction: rtl;
    min-height: 100vh;
    overflow-x: hidden;
    transition: background 0.2s ease, color 0.2s ease;
  }

  /* ─── Keyframes ─── */
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: .55; transform: scale(1.35); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
  }
  @keyframes slideInLeft {
    from { transform: translateX(-100%); }
    to   { transform: translateX(0); }
  }
  @keyframes slideInBottom {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(.95); }
    to   { opacity: 1; transform: scale(1); }
  }

  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }

  /* ─── Cards ─── */
  .card {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 14px;
    box-shadow: var(--shadow-card);
    transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
    position: relative;
    overflow: hidden;
  }
  .card:hover {
    border-color: var(--border-highlight);
  }

  /* ─── Buttons ─── */
  .btn {
    border: none;
    padding: 8px 18px;
    border-radius: 8px;
    font-family: 'Cairo', sans-serif;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: all .2s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn:hover:not(:disabled) { transform: translateY(-1px); }
  .btn:active:not(:disabled) { transform: scale(.98); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }

  .btn-accent {
    background: var(--primary);
    color: #ffffff;
  }
  .btn-accent:hover:not(:disabled) {
    background: var(--primary-hover);
    box-shadow: 0 4px 14px var(--primary-bg);
  }

  .btn-danger {
    background: #ef4444;
    color: #ffffff;
  }
  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
    box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3);
  }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }
  .btn-ghost:hover:not(:disabled) {
    background: var(--bg-surface-elevated);
    color: var(--text-main);
  }

  .btn-sm { padding: 5px 12px; font-size: 12px; border-radius: 6px; }

  /* ─── Inputs ─── */
  .input, .select {
    background: var(--bg-input);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 9px 12px;
    font-family: 'Cairo', sans-serif;
    font-size: 13px;
    outline: none;
    transition: border-color .2s ease, box-shadow .2s ease;
    width: 100%;
  }
  .input:focus, .select:focus {
    border-color: var(--primary);
    box-shadow: 0 0 0 2px var(--primary-bg);
  }
  .input::placeholder { color: var(--text-dim); }
  .select { cursor: pointer; }

  /* ─── Tables ─── */
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th {
    text-align: right;
    padding: 12px 16px;
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    background: var(--bg-surface-elevated);
    border-bottom: 1px solid var(--border-subtle);
    white-space: nowrap;
  }
  .tbl td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
    font-size: 13px;
    color: var(--text-main);
  }
  .tbl tbody tr { transition: background .15s ease; }
  .tbl tbody tr:hover { background: var(--primary-bg); }
  .tbl tbody tr:last-child td { border-bottom: none; }

  /* ─── Badge ─── */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* ─── Sidebar ─── */
  .sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 250px;
    height: 100vh;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    z-index: 100;
    transition: transform .3s ease, background .2s ease;
  }
  .sidebar-logo {
    padding: 20px 18px;
    border-bottom: 1px solid var(--border-subtle);
  }
  .sidebar-nav { flex: 1; padding: 14px 10px; display: flex; flex-direction: column; gap: 4px; }
  .sidebar-link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    text-decoration: none;
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
    transition: all .2s ease;
  }
  .sidebar-link:hover { color: var(--text-main); background: var(--bg-surface-elevated); }
  .sidebar-link.active {
    color: #ffffff;
    background: var(--primary);
    box-shadow: 0 2px 10px var(--primary-bg);
  }
  .sidebar-link .icon { font-size: 18px; width: 24px; text-align: center; }

  .main-content {
    margin-right: 250px;
    min-height: 100vh;
    padding: 20px 28px 48px;
    transition: background .2s ease;
  }

  /* ─── Hamburger (mobile) ─── */
  .hamburger {
    display: none;
    position: fixed;
    top: 14px;
    right: 14px;
    z-index: 200;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    color: var(--text-main);
    font-size: 18px;
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
  ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }

  /* ─── Responsive ─── */
  @media (max-width: 768px) {
    .sidebar { transform: translateX(100%); }
    .sidebar.open { transform: translateX(0); animation: slideInRight .3s ease; }
    .sidebar-overlay.open { display: block; }
    .hamburger { display: block; }
    .main-content { margin-right: 0; padding: 16px 14px 40px; padding-top: 60px; }
  }
`;
