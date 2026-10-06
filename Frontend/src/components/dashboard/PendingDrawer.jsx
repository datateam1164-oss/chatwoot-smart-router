import { useState } from 'react';

export function PendingDrawer({
  isOpen,
  onClose,
  summary,
  loading,
  onRefresh,
  onReopenLabel,
  onOpenCalculator
}) {
  const [quickLabel, setQuickLabel] = useState('');
  const [quickCount, setQuickCount] = useState(20);
  const [reopenCounts, setReopenCounts] = useState({});
  const [reopeningLabel, setReopeningLabel] = useState(null);
  const [showZeroLabels, setShowZeroLabels] = useState(false);
  const [quickReopening, setQuickReopening] = useState(false);

  if (!isOpen) return null;

  const totalPending = summary?.total_unassigned_pending || 0;
  const labelsList = summary?.labels || [];
  const activeLabels = labelsList.filter(l => l.pending_count > 0);

  const handleQuickReopenSubmit = async () => {
    if (!quickLabel) return;
    setQuickReopening(true);
    try {
      await onReopenLabel(quickLabel, quickCount);
    } finally {
      setQuickReopening(false);
    }
  };

  const handleSingleReopen = async (label, count) => {
    setReopeningLabel(label);
    try {
      await onReopenLabel(label, count);
    } finally {
      setReopeningLabel(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          animation: 'fadeIn 0.2s ease'
        }}
      />

      {/* Drawer Container */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 780,
        background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border-subtle)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-card)',
        animation: 'slideInLeft 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        direction: 'rtl',
        color: 'var(--text-main)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-elevated)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>📬</span>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                المحادثات المعلقة (Pending Conversations)
              </h2>
            </div>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>
              المحادثات في حالة Pending لا يقوم النظام بتوجيهها. يمكنك هنا تحديد العدد المطلوب وإعادة فتحه ليتم توجيهه فوراً.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--primary)',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>{loading ? '⏳' : '🔄'}</span>
              <span>{loading ? 'جاري الفحص...' : 'تحديث الأرقام'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 22,
                cursor: 'pointer',
                padding: 4,
                lineHeight: 1
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          
          {/* Summary Box */}
          <div style={{
            background: 'var(--badge-paused-bg)',
            border: '1px solid var(--badge-paused-border)',
            borderRadius: 14,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 14
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: '#fff', boxShadow: '0 4px 12px var(--primary-bg)'
              }}>
                ⏳
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--badge-paused-text)', fontWeight: 700 }}>
                  إجمالي المحادثات المعلقة غير المعينة
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                  {loading && !summary ? 'جاري الفحص...' : `${totalPending.toLocaleString()} محادثة`}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'left', lineHeight: 1.6 }}>
              آخر فحص: {summary?.timestamp ? new Date(summary.timestamp).toLocaleTimeString('ar-EG') : 'الآن'}<br />
              <span style={{ color: 'var(--badge-ready-text)' }}>● جاهزة للفتح الفوري والتوزيع</span>
            </div>
          </div>

          {/* Calculator Callout Button */}
          {onOpenCalculator && (
            <button
              type="button"
              onClick={onOpenCalculator}
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(239, 68, 68, 0.12) 100%)',
                border: '1.5px solid #f59e0b',
                borderRadius: 12,
                padding: '12px 18px',
                color: '#d97706',
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.15)',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900 }}>حاسبة احتياج الـ Reopen حسب طاقة الفريق المتاح</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
                    عرض كم شات مطلوب فتحه من كل ليبل بناءً على ليمت الموظفين المتاحين الآن
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 900 }}>فتح الحاسبة 👈</span>
            </button>
          )}

          {/* Quick Bulk Reopen Card */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '16px 18px'
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚡</span>
              <span>إعادة فتح سريعة بالدفعة (Quick Bulk Reopen)</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>
                  اختر التصنيف (Label):
                </label>
                <select
                  value={quickLabel}
                  onChange={(e) => setQuickLabel(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700
                  }}
                >
                  <option value="">-- اختر التصنيف المراد فتحه --</option>
                  {activeLabels.map(l => (
                    <option key={l.label} value={l.label}>
                      {l.title} ({l.pending_count.toLocaleString()} معلقة)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ width: 110 }}>
                <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 700 }}>
                  العدد المطلوب:
                </label>
                <input
                  type="number"
                  min={1}
                  value={quickCount}
                  onChange={(e) => setQuickCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 800,
                    textAlign: 'center',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                />
              </div>

              {/* Preset buttons */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {[10, 25, 50].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setQuickCount(cnt)}
                    style={{
                      background: quickCount === cnt ? 'var(--primary)' : 'var(--bg-surface)',
                      color: quickCount === cnt ? '#ffffff' : 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      padding: '7px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    +{cnt}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleQuickReopenSubmit}
                disabled={quickReopening || !quickLabel}
                style={{
                  background: quickReopening || !quickLabel ? 'var(--border-highlight)' : '#10b981',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: quickReopening || !quickLabel ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span>{quickReopening ? '⏳' : '🔓'}</span>
                <span>{quickReopening ? 'جاري الفتح...' : 'إعادة فتح الآن'}</span>
              </button>
            </div>
          </div>

          {/* Breakdown Header & Filter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
              🏷️ تصنيفات المحادثات المعلقة ({labelsList.filter(l => showZeroLabels || l.pending_count > 0).length})
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showZeroLabels}
                onChange={(e) => setShowZeroLabels(e.target.checked)}
                style={{ accentColor: 'var(--primary)' }}
              />
              عرض التصنيفات الفارغة (0)
            </label>
          </div>

          {/* Labels Cards Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12
          }}>
            {labelsList
              .filter(l => showZeroLabels || l.pending_count > 0)
              .map(item => {
                const countVal = reopenCounts[item.label] ?? Math.min(20, Math.max(1, item.pending_count || 10));
                const isReopening = reopeningLabel === item.label;
                const hasPending = item.pending_count > 0;

                return (
                  <div
                    key={item.label}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: hasPending ? '1px solid var(--border-subtle)' : '1px solid transparent',
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      opacity: hasPending ? 1 : 0.6
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 10, height: 10, borderRadius: '50%',
                            background: item.color || 'var(--primary)'
                          }} />
                          <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-main)' }}>
                            {item.title}
                          </span>
                        </div>

                        <span style={{
                          background: hasPending ? 'var(--badge-ready-bg)' : 'rgba(148, 163, 184, 0.1)',
                          color: hasPending ? 'var(--badge-ready-text)' : 'var(--text-dim)',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 800,
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {item.pending_count.toLocaleString()} معلقة
                        </span>
                      </div>
                    </div>

                    {hasPending ? (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>العدد:</label>
                          <input
                            type="number"
                            min={1}
                            max={item.pending_count}
                            value={countVal}
                            onChange={(e) => {
                              const val = Math.max(1, Math.min(item.pending_count, parseInt(e.target.value, 10) || 1));
                              setReopenCounts(prev => ({ ...prev, [item.label]: val }));
                            }}
                            style={{
                              width: 60,
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-main)',
                              padding: '4px 6px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 800,
                              textAlign: 'center',
                              fontVariantNumeric: 'tabular-nums'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setReopenCounts(prev => ({ ...prev, [item.label]: item.pending_count }))}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--badge-ready-border)',
                              color: 'var(--badge-ready-text)',
                              padding: '3px 8px',
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            الكل
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSingleReopen(item.label, countVal)}
                          disabled={isReopening}
                          style={{
                            width: '100%',
                            background: isReopening ? 'var(--border-highlight)' : '#10b981',
                            color: '#fff',
                            border: 'none',
                            padding: '7px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: isReopening ? 'wait' : 'pointer'
                          }}
                        >
                          {isReopening ? 'جاري الفتح...' : `🔓 فتح ${Math.min(countVal, item.pending_count)} الآن`}
                        </button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                        لا توجد معلقات حالياً
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

        </div>
      </div>
    </>
  );
}
