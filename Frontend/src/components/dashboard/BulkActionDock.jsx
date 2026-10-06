import { memo } from 'react';

export const BulkActionDock = memo(function BulkActionDock({
  selectedCount,
  showOnlySelected,
  onToggleShowOnlySelected,
  onClearSelection,
  onOpenBulkLimit,
  onOpenBulkDailyLimit,
  onOpenBulkLabels,
  onBulkPause,
  onBulkResume
}) {
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 900,
      background: 'var(--bg-surface)',
      border: '1px solid var(--primary)',
      borderRadius: 16,
      padding: '10px 18px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: 'var(--shadow-card)',
      backdropFilter: 'blur(12px)',
      animation: 'slideInBottom 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      flexWrap: 'wrap',
      direction: 'rtl'
    }}>
      {/* Selected Counter (Clickable Filter Toggle) */}
      <button
        type="button"
        onClick={onToggleShowOnlySelected}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          borderRadius: 10,
          background: showOnlySelected ? 'var(--primary)' : 'var(--bg-surface-elevated)',
          border: `1px solid ${showOnlySelected ? 'var(--primary)' : 'var(--border-subtle)'}`,
          cursor: 'pointer',
          transition: 'all 0.15s'
        }}
        title={showOnlySelected ? 'إلغاء التصفية وعرض جميع الموظفين' : 'اضغط لتصفية الجدول وعرض المحددين فقط'}
      >
        <span style={{
          background: showOnlySelected ? '#ffffff' : 'var(--primary)',
          color: showOnlySelected ? 'var(--primary)' : '#ffffff',
          fontWeight: 900,
          borderRadius: 8,
          padding: '2px 8px',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums'
        }}>
          {selectedCount}
        </span>
        <span style={{
          fontSize: 13,
          fontWeight: 700,
          color: showOnlySelected ? '#ffffff' : 'var(--text-main)',
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          {showOnlySelected ? '👁️ معروضين فقط' : 'Selected (فلترة 🔍)'}
        </span>
      </button>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={onOpenBulkLimit}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--primary)',
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="تعديل ليمت النصف ساعة للموظفين المحددين"
        >
          ⏱️ 30m Limit
        </button>

        <button
          type="button"
          onClick={onOpenBulkDailyLimit}
          style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-main)',
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="تعديل ماكس شات اليوم الكامل للموظفين المحددين"
        >
          🎯 Daily Max
        </button>

        <button
          type="button"
          onClick={onOpenBulkLabels}
          style={{
            background: 'var(--primary)',
            border: 'none',
            color: '#ffffff',
            padding: '7px 14px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
          title="تخصيص تصنيفات الشاتات للمجموعة المحددة"
        >
          🏷️ Group Labels
        </button>

        <button
          type="button"
          onClick={onBulkPause}
          style={{
            background: 'var(--badge-paused-bg)',
            border: '1px solid var(--badge-paused-border)',
            color: 'var(--badge-paused-text)',
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer'
          }}
          title="إيقاف مؤقت للموظفين المحددين"
        >
          ⏸️ Pause
        </button>

        <button
          type="button"
          onClick={onBulkResume}
          style={{
            background: 'var(--badge-ready-bg)',
            border: '1px solid var(--badge-ready-border)',
            color: 'var(--badge-ready-text)',
            padding: '7px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer'
          }}
          title="استئناف توزيع الموظفين المحددين"
        >
          ▶️ Resume
        </button>
      </div>

      {/* Clear button */}
      <button
        type="button"
        onClick={onClearSelection}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          padding: '6px 8px',
          borderRadius: 6,
          fontSize: 12,
          cursor: 'pointer',
          marginRight: 4
        }}
        title="إلغاء التحديد"
      >
        ✕ Clear
      </button>
    </div>
  );
});
