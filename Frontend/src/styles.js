/* ─── Theme Colors ─── */
export const C = {
  bg:           'var(--bg-page)',
  bgLight:      'var(--bg-surface)',
  bgLighter:    'var(--bg-surface-elevated)',
  accent:       'var(--primary)',
  accentDark:   'var(--primary-hover)',
  accentGlow:   'var(--primary-bg)',
  accentBorder: 'var(--primary-border)',
  text:         'var(--text-main)',
  textBright:   'var(--text-main)',
  textMuted:    'var(--text-muted)',
  textDim:      'var(--text-dim)',
  border:       'var(--border-subtle)',
  borderLight:  'var(--border-subtle)',
  green:        'var(--badge-ready-solid, #10b981)',
  greenLight:   'var(--badge-ready-text)',
  greenBg:      'var(--badge-ready-bg)',
  greenBorder:  'var(--badge-ready-border)',
  red:          'var(--badge-capped-solid, #ef4444)',
  redLight:     'var(--badge-capped-text)',
  redBg:        'var(--badge-capped-bg)',
  redBorder:    'var(--badge-capped-border)',
  redText:      'var(--badge-capped-text)',
  yellow:       'var(--badge-paused-solid, #f59e0b)',
  yellowLight:  'var(--badge-paused-text)',
  yellowBg:     'var(--badge-paused-bg)',
  purple:       'var(--purple-text, #a78bfa)',
  purpleBg:     'var(--purple-bg, rgba(167,139,250,.1))',
};

/* ─── Global CSS with Light ("Warm Clay") and Dark Tokens ─── */
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
    --badge-ready-solid: #10b981;
    --badge-ready-bg: rgba(16, 185, 129, 0.12);
    --badge-ready-text: #34d399;
    --badge-ready-border: rgba(16, 185, 129, 0.3);
    --badge-capped-solid: #ef4444;
    --badge-capped-bg: rgba(239, 68, 68, 0.12);
    --badge-capped-text: #f87171;
    --badge-capped-border: rgba(239, 68, 68, 0.3);
    --badge-paused-solid: #f59e0b;
    --badge-paused-bg: rgba(245, 158, 11, 0.12);
    --badge-paused-text: #fbbf24;
    --badge-paused-border: rgba(245, 158, 11, 0.3);
    --purple-text: #a78bfa;
    --purple-bg: rgba(167, 139, 250, 0.12);
    --shadow-card: 0 4px 20px rgba(0,0,0,0.4);
    --bar-bg: #1e293b;
    --bar-fill: #38bdf8;
    --scrollbar-thumb: #334155;
    --card-radius: 14px;
  }

  /* ─── Light Theme: "Warm Clay" (from light-theme.json) ─── */
  :root[data-theme="light"] {
    --bg-page: #F5F0EA;
    --bg-surface: #FCF9F6;
    --bg-surface-elevated: #EDE5DC;
    --bg-input: #F5F0EA;
    --border-subtle: #E8DDD2;
    --border-highlight: #857565;
    --text-main: #3D3630;
    --text-muted: #5A524A;
    --text-dim: #7A7068;
    --primary: #B45F3A;
    --primary-hover: #964B2B;
    --primary-bg: #F2E9DD;
    --primary-border: #B45F3A;
    --badge-ready-solid: #5FA968;
    --badge-ready-bg: rgba(95, 169, 104, 0.15);
    --badge-ready-text: #3B8244;
    --badge-ready-border: rgba(95, 169, 104, 0.42);
    --badge-capped-solid: #B45F3A;
    --badge-capped-bg: rgba(180, 95, 58, 0.14);
    --badge-capped-text: #B45F3A;
    --badge-capped-border: rgba(180, 95, 58, 0.42);
    --badge-paused-solid: #C68A3A;
    --badge-paused-bg: rgba(198, 138, 58, 0.15);
    --badge-paused-text: #9A6524;
    --badge-paused-border: rgba(166, 123, 91, 0.42);
    --purple-text: #7A5F9E;
    --purple-bg: rgba(122, 95, 158, 0.14);
    --shadow-card: 0 4px 18px rgba(61, 54, 48, 0.07);
    --bar-bg: #EDE5DC;
    --bar-fill: #B45F3A;
    --scrollbar-thumb: #A67B5B;
    --card-radius: 20px;
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
    border-radius: var(--card-radius, 14px);
    box-shadow: var(--shadow-card);
    transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
    position: relative;
    overflow: hidden;
  }
  :root[data-theme="light"] .card {
    border-color: rgba(133, 117, 101, 0.35);
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

  /* Warm Clay Light Mode Table Styling (from light-theme.json) */
  :root[data-theme="light"] .tbl th,
  :root[data-theme="light"] .card table thead tr th {
    background: #B45F3A !important;
    color: #FCF9F6 !important;
    border-bottom: 1px solid #964B2B !important;
  }
  :root[data-theme="light"] .tbl tbody tr:nth-child(even),
  :root[data-theme="light"] .card table tbody tr:nth-child(even) {
    background-color: #F5F0EA;
  }
  :root[data-theme="light"] .tbl tbody tr:hover,
  :root[data-theme="light"] .card table tbody tr:hover {
    background-color: #F2E9DD !important;
  }

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
