import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { authStorage, authApi } from './api/agents';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <>
      {/* ─── Hamburger (Mobile) ─── */}
      <button className="hamburger" onClick={toggleSidebar}>
        {sidebarOpen ? '✖' : '☰'}
      </button>

      {/* ─── Sidebar Overlay (Mobile) ─── */}
      <div 
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`} 
        onClick={closeSidebar}
      />

      {/* ─── Sidebar ─── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h2 style={{ fontSize: 20, color: '#f8fafc', fontWeight: 700 }}>نظام التوزيع</h2>
        </div>
        
        <nav className="sidebar-nav">
          <NavLink to="/" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">📊</span> لوحة المراقبة
          </NavLink>
          
          <NavLink to="/reports" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">⏱️</span> تقرير التأخيرات
          </NavLink>

          <NavLink to="/events" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">📋</span> أحداث اليوم
          </NavLink>
          
          <NavLink to="/settings" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">⚙️</span> الإعدادات
          </NavLink>
        </nav>

        {/* ─── User Profile & Logout ─── */}
        <div style={{
          padding: '16px 14px',
          borderTop: '1px solid rgba(148,163,184,.1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          background: 'rgba(15,23,42,0.6)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(56,189,248,0.12)',
              border: '1px solid rgba(56,189,248,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18
            }}>
              👤
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {authStorage.getUser()?.username || 'admin'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>مسؤول النظام</div>
            </div>
          </div>

          <button
            onClick={() => authApi.logout()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '9px 12px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8,
              color: '#f87171',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
          >
            <span>🚪</span> تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="main-content">
        <Outlet />
      </main>
    </>
  );
}
