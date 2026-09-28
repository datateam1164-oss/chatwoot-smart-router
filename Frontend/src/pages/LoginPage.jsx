import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/agents';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('يرجى كتابة اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.login(username.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'فشل تسجيل الدخول، تأكد من صحة البيانات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #1e293b 0%, #0f172a 100%)',
      padding: '20px',
      direction: 'rtl'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 440,
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 16,
        padding: '36px 28px',
        boxShadow: '0 20px 40px -15px rgba(0,0,0,0.5)',
        animation: 'fadeIn 0.3s ease-out'
      }}>
        {/* Header / Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.3)',
            fontSize: 32,
            marginBottom: 14
          }}>
            🔐
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
            نظام التوزيع الذكي
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8' }}>
            يرجى تسجيل الدخول للوصول إلى لوحة التحكم والتوزيع
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5',
            padding: '10px 14px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
              اسم المستخدم
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: admin"
              autoFocus
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 10,
                color: '#f8fafc',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
              onBlur={(e) => e.target.style.borderColor = '#334155'}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#cbd5e1', marginBottom: 6 }}>
              كلمة المرور
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 10,
                color: '#f8fafc',
                fontSize: 14,
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = '#38bdf8'}
              onBlur={(e) => e.target.style.borderColor = '#334155'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              padding: '13px',
              borderRadius: 10,
              background: loading ? '#64748b' : 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 14px rgba(14,165,233,0.35)'
            }}
          >
            {loading ? 'جاري التحقق...' : 'تسجيل الدخول 🚀'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', borderTop: '1px solid #334155', paddingTop: 16 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            نظام حماية التوزيع والتوجيه الآلي &bull; شركة الخطة 2026
          </span>
        </div>
      </div>
    </div>
  );
}
