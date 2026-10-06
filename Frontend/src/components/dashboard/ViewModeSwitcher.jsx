import { memo } from 'react';

export const VIEW_MODES = [
  { id: 'floor', label: 'In Shift', icon: '🟢', desc: 'طاقم العمل المتاح على مدار الساعة' },
  { id: 'attention', label: 'Needs Attention', icon: '⚠️', desc: 'مكتملين ماكس، موقوفين، أو شاتات مرتفعة' },
  { id: 'squads', label: 'Coordinator Squads', icon: '👥', desc: 'توزيع التيمات وتخصيص الليبولات للفرق' },
  { id: 'roster', label: 'All Roster', icon: '📋', desc: 'جميع الحسابات والفلاتر الشاملة' }
];

export const ViewModeSwitcher = memo(function ViewModeSwitcher({
  currentMode,
  onChangeMode,
  counts
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'var(--bg-surface)',
      padding: 4,
      borderRadius: 12,
      border: '1px solid var(--border-subtle)',
      marginBottom: 16,
      overflowX: 'auto',
      boxShadow: 'var(--shadow-card)'
    }}>
      {VIEW_MODES.map(mode => {
        const isActive = currentMode === mode.id;
        const count = counts?.[mode.id];

        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChangeMode(mode.id)}
            style={{
              flex: 1,
              minWidth: 150,
              background: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
              color: isActive ? 'var(--text-main)' : 'var(--text-muted)',
              border: isActive ? '1px solid var(--primary)' : '1px solid transparent',
              borderRadius: 9,
              padding: '9px 14px',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.15s',
              boxShadow: isActive ? 'var(--shadow-card)' : 'none',
              whiteSpace: 'nowrap'
            }}
            title={mode.desc}
          >
            <span style={{ fontSize: 14 }}>{mode.icon}</span>
            <span>{mode.label}</span>
            {count !== undefined && (
              <span style={{
                background: isActive ? 'var(--primary-bg)' : 'rgba(148, 163, 184, 0.1)',
                color: isActive ? 'var(--primary)' : 'var(--text-dim)',
                padding: '1px 7px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums'
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
});
