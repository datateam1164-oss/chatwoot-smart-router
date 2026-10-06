import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 30,
          textAlign: 'center',
          direction: 'rtl',
          color: 'var(--text-main)'
        }}>
          <div style={{
            fontSize: 48,
            marginBottom: 16
          }}>
            ⚠️
          </div>
          <h2 style={{
            fontSize: 20,
            fontWeight: 800,
            marginBottom: 8,
            color: 'var(--badge-capped-text)'
          }}>
            حدث خطأ غير متوقع أثناء عرض هذه الصفحة
          </h2>
          <p style={{
            fontSize: 14,
            color: 'var(--text-muted)',
            maxWidth: 500,
            marginBottom: 20,
            lineHeight: 1.6
          }}>
            {this.state.error?.message || 'تعذر تحميل عناصر الصفحة بشكل سليم.'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleReload}
              style={{
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                padding: '10px 22px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🔄 إعادة تحميل الصفحة
            </button>
            <a
              href="/"
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '10px 22px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
                display: 'inline-block'
              }}
            >
              📊 العودة للرئيسية
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
