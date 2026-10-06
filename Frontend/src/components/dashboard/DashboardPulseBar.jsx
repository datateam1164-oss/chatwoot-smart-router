import { memo } from 'react';
import { useTheme } from '../../context/ThemeContext';

export const DashboardPulseBar = memo(function DashboardPulseBar({
  status,
  routingRunning,
  onStartRouting,
  onStopRouting,
  triggeringCycle,
  onRunSingleCycle,
  syncingCrm,
  onSyncCrm,
  refreshingCw,
  onRefreshCw,
  pendingCount,
  onOpenPending,
  reopenDemand,
  onOpenReopenModal,
  inShiftCount,
  readyCount,
  todayRouted,
  onNavigateEvents,
  onOpenResolveAudit
}) {
  const isRoutingActive = status?.routing_enabled === true;
  const { isDark, toggleTheme } = useTheme();

  return (
    <div style={{
      position: 'sticky',
      top: 12,
      zIndex: 100,
      backdropFilter: 'blur(16px)',
      background: 'var(--bg-surface)',
      border: isRoutingActive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
      borderRadius: 14,
      padding: '12px 18px',
      marginBottom: 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 14,
      boxShadow: 'var(--shadow-card)'
    }}>
      {/* Left: Engine Status Indicator & Master Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260 }}>
        <div style={{
          position: 'relative',
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: isRoutingActive ? '#10b981' : '#ef4444',
          boxShadow: isRoutingActive ? '0 0 10px #10b981' : '0 0 10px #ef4444'
        }}>
          {isRoutingActive && (
            <span style={{
              position: 'absolute',
              inset: -3,
              borderRadius: '50%',
              background: '#10b981',
              opacity: 0.4,
              animation: 'pulse 2s infinite'
            }} />
          )}
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 15,
              fontWeight: 800,
              color: isRoutingActive ? '#10b981' : '#ef4444'
            }}>
              {isRoutingActive ? 'Auto Routing Active' : 'Routing Paused'}
            </span>
            <span style={{
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 4,
              background: isRoutingActive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: isRoutingActive ? '#059669' : '#dc2626',
              fontWeight: 700
            }}>
              {isRoutingActive ? 'Auto Loop' : 'Paused'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {isRoutingActive
              ? 'يتم فحص وتوجيه المحادثات للمتاحين تلقائياً كل 30 ثانية'
              : 'محرك التوزيع متوقف مؤقتاً'}
          </div>
        </div>

        {/* Master Toggle Button */}
        {isRoutingActive ? (
          <button
            onClick={onStopRouting}
            disabled={routingRunning}
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              padding: '7px 16px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: routingRunning ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
            title="إيقاف محرك التوزيع التلقائي"
          >
            <span>{routingRunning ? '⏳' : '⏸️'}</span>
            <span>{routingRunning ? 'Stopping...' : 'Pause'}</span>
          </button>
        ) : (
          <button
            onClick={onStartRouting}
            disabled={routingRunning}
            style={{
              background: '#10b981',
              color: '#fff',
              border: 'none',
              padding: '7px 18px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: routingRunning ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s'
            }}
            title="بدء تشغيل محرك التوزيع التلقائي"
          >
            <span>{routingRunning ? '⏳' : '▶️'}</span>
            <span>{routingRunning ? 'Starting...' : 'Start Engine'}</span>
          </button>
        )}
      </div>

      {/* Center: Live Pulse Metrics */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* Reopen Demand Smart Calculator Button */}
        {reopenDemand?.shouldReopen ? (
          <button
            type="button"
            onClick={onOpenReopenModal}
            style={{
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(239, 68, 68, 0.16) 100%)',
              border: '1.5px solid #f59e0b',
              borderRadius: 10,
              padding: '6px 14px',
              color: '#d97706',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 0 14px rgba(245, 158, 11, 0.3)',
              transition: 'all 0.15s'
            }}
            title="تنبيه: مطلوب إعادة فتح محادثات لتغذية الفريق المتاح - اضغط لعرض التفاصيل والأعداد المطلوبة"
          >
            <span style={{ fontSize: 18, animation: 'pulse 1.5s infinite' }}>⚡</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 800 }}>احتياج الـ Reopen</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
                مطلوب {reopenDemand.totalRecommendedReopen} شات 👈
              </div>
            </div>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenReopenModal}
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: 10,
              padding: '6px 14px',
              color: '#10b981',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s'
            }}
            title="الفريق مكتفي حالياً - اضغط لعرض حاسبة الطاقة والاستيعاب"
          >
            <span style={{ fontSize: 16 }}>🟢</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>حالة التغذية</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>
                الفريق مكتفي (0 مطلوب) 👈
              </div>
            </div>
          </button>
        )}

        {/* Pending Chats Pill */}
        <button
          type="button"
          onClick={onOpenPending}
          style={{
            background: 'var(--badge-paused-bg)',
            border: '1px solid var(--badge-paused-border)',
            borderRadius: 10,
            padding: '6px 14px',
            color: 'var(--badge-paused-text)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'all 0.15s'
          }}
          title="عرض المحادثات المعلقة وإعادة فتحها لتوزيعها"
        >
          <span style={{ fontSize: 16 }}>📬</span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>Pending Queue</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
              {(pendingCount ?? 0).toLocaleString()}
            </div>
          </div>
          <span style={{ fontSize: 12, marginRight: 4 }}>←</span>
        </button>

        {/* Ready Floor Agents */}
        <div style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 16 }}>🟢</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>In Shift</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--badge-ready-text)', fontVariantNumeric: 'tabular-nums' }}>
              {readyCount ?? 0} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Ready / {inShiftCount ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Today Routed Counter */}
        <div style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Today Routed</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
              {(todayRouted ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Operational Tooling + Theme Switcher */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {/* ☀️ / 🌙 Live Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-highlight)',
            color: 'var(--text-main)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          <span>{isDark ? '🌙' : '☀️'}</span>
          <span>{isDark ? 'Dark' : 'Light'}</span>
        </button>

        <button
          type="button"
          onClick={onRunSingleCycle}
          disabled={triggeringCycle}
          style={{
            background: 'var(--primary-bg)',
            border: '1px solid var(--primary-border)',
            color: 'var(--primary)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: triggeringCycle ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="تشغيل دورة فحص وتوزيع واحدة فورية بدون انتظار التايمر"
        >
          <span>{triggeringCycle ? '⏳' : '⚡'}</span>
          <span>{triggeringCycle ? 'Routing...' : 'Run Cycle'}</span>
        </button>

        <button
          type="button"
          onClick={onSyncCrm}
          disabled={syncingCrm}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: syncingCrm ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="مزامنة مواعيد الشيفتات اليومية من نظام الـ CRM"
        >
          <span>{syncingCrm ? '⏳' : '🔄'}</span>
          <span>{syncingCrm ? 'Syncing...' : 'Sync CRM'}</span>
        </button>

        <button
          type="button"
          onClick={onRefreshCw}
          disabled={refreshingCw}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: refreshingCw ? 'wait' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="تحديث أرقام الشاتات المفتوحة للموظفين من تقرير شات ووت المباشر"
        >
          <span>{refreshingCw ? '⏳' : '💬'}</span>
          <span>{refreshingCw ? 'Updating...' : 'Refresh CW'}</span>
        </button>

        <button
          type="button"
          onClick={onNavigateEvents}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="عرض سجل توزيع المحادثات وتفاصيل التوجيه"
        >
          <span>📋</span>
          <span>Events Log</span>
        </button>

        {/* 🎯 Resolve & Quality Audit Modal Button */}
        <button
          type="button"
          onClick={onOpenResolveAudit}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.15s'
          }}
          title="فحص جودة الشاتات المغلقة، كشف الأسئلة المعلقة، ورصد الشاتات المحلولة بدون رد"
        >
          <span>🎯</span>
          <span>Resolve Audit</span>
        </button>
      </div>
    </div>
  );
});
