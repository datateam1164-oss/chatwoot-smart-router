import { useState, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { authStorage, authApi, agentsApi } from './api/agents';
import { useTheme } from './context/ThemeContext';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const fileInputRef = useRef(null);
  const { theme, toggleTheme } = useTheme();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  const handleSheetUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSheet(true);
    setUploadMsg(null);
    try {
      const res = await agentsApi.uploadCloudSheet(file);
      setUploadMsg(res.message || 'تم تحديث قاعدة البيانات السحابية بنجاح');
      setTimeout(() => setUploadMsg(null), 5000);
    } catch (err) {
      setUploadMsg(`❌ ${err.message || 'فشل رفع الملف'}`);
      setTimeout(() => setUploadMsg(null), 5000);
    } finally {
      setUploadingSheet(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

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
          <h2 style={{ fontSize: 18, color: 'var(--text-main)', fontWeight: 800 }}>⚡ نظام التوزيع</h2>
        </div>
        
        <nav className="sidebar-nav">
          <NavLink to="/" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">📊</span> لوحة المراقبة
          </NavLink>

          <NavLink to="/resolve-audit" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">🎯</span> تقرير الريسولف والجودة
          </NavLink>

          <NavLink to="/auto-resolver" onClick={closeSidebar} className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <span className="icon">🧹</span> Auto Resolver
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

        {/* ─── Theme Toggle & User Profile ─── */}
        <div style={{
          padding: '16px 14px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--bg-surface-elevated)'
        }}>
          {/* Cloud Sheet Upload (Excel/CSV -> HF Dataset) */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleSheetUpload}
          />
          <button
            type="button"
            disabled={uploadingSheet}
            onClick={() => fileInputRef.current?.click()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 12px',
              background: 'var(--primary-bg)',
              border: '1px solid var(--primary-border)',
              borderRadius: 8,
              color: 'var(--primary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: uploadingSheet ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
            title="رفع شيت إكسيل أو CSV وتحديث قاعدة البيانات السحابية مباشرة"
          >
            <span>{uploadingSheet ? '⏳' : '☁️'}</span>
            <span>{uploadingSheet ? 'جاري الرفع للسحابة...' : 'رفع شيت للسحابة (Excel/CSV)'}</span>
          </button>
          {uploadMsg && (
            <div style={{ fontSize: 11, color: 'var(--badge-ready-text)', fontWeight: 700, textAlign: 'center' }}>
              {uploadMsg}
            </div>
          )}

          {/* Quick Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              color: 'var(--text-main)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            title={theme === 'dark' ? 'التبديل إلى وضع النهار' : 'التبديل إلى وضع الليل'}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
              <span>{theme === 'dark' ? 'وضع الليل (Dark)' : 'وضع النهار (Light)'}</span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 800 }}>تغيير ↺</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--primary-bg)',
              border: '1px solid var(--primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16
            }}>
              👤
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {authStorage.getUser()?.username || 'admin'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>مسؤول النظام</div>
            </div>
          </div>

          <button
            onClick={() => authApi.logout()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '8px 12px',
              background: 'var(--badge-capped-bg)',
              border: '1px solid var(--badge-capped-border)',
              borderRadius: 8,
              color: 'var(--badge-capped-text)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
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
