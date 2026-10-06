import { useState, useMemo } from 'react';
import { LABEL_ARABIC_NAMES } from './constants';

export function doesAgentMatchLabel(agent, labelKey) {
  const assigned = Array.isArray(agent.assigned_labels) ? agent.assigned_labels : [];
  const matchedClean = String(labelKey || '').trim().toLowerCase();
  const isUnlabeledTarget = matchedClean.includes('بدون ليبل') || 
                            matchedClean.includes('unlabeled') || 
                            matchedClean.includes('no_label') || 
                            matchedClean === 'بدون تصنيف';

  if (assigned.length > 0) {
    const assignedLower = assigned.map(l => String(l).trim().toLowerCase());
    if (isUnlabeledTarget) {
      return assignedLower.some(x => 
        x.includes('بدون ليبل') || x.includes('unlabeled') || x.includes('بدون تصنيف') || x.includes('no_label')
      );
    } else {
      return assignedLower.some(x => x === matchedClean || matchedClean.includes(x) || x.includes(matchedClean));
    }
  } else {
    // Agent has NO assigned labels configured (General sales agent)
    // Unlabeled chats require explicit assignment, so general agent does NOT take unlabeled
    if (isUnlabeledTarget) return false;
    return true;
  }
}

export function getAgentRemainingCapacity(agent) {
  if (!agent.in_shift || !agent.is_selected || agent.is_paused) return 0;

  const windowLimit = agent.chat_limit || 10;
  const currentWindow = agent.current_window_chats || 0;
  const windowRem = Math.max(0, windowLimit - currentWindow);

  const dailyLimit = agent.daily_chat_limit || 100;
  const todayCount = agent.today_chats_count || 0;
  const dailyRem = Math.max(0, dailyLimit - todayCount);

  return Math.min(windowRem, dailyRem);
}

export function calculateReopenDemand(baseAgents, pendingSummary, configuredLabels = []) {
  const salesAgents = (baseAgents || []).filter(a => a.team === 'Sales' || !a.team);

  const readyAgents = [];
  salesAgents.forEach(a => {
    const cap = getAgentRemainingCapacity(a);
    if (cap > 0) {
      readyAgents.push({ ...a, remainingCapacity: cap });
    }
  });

  const totalTeamCapacity = readyAgents.reduce((sum, a) => sum + a.remainingCapacity, 0);
  const totalPending = pendingSummary?.total_unassigned_pending || 0;

  const pendingLabelsList = pendingSummary?.labels || [];
  const labelMap = new Map();

  pendingLabelsList.forEach(l => {
    labelMap.set(l.label, {
      label: l.label,
      title: l.title || l.label,
      pending_count: l.pending_count || 0,
      color: l.color || '#3b82f6',
      is_sales_label: l.is_sales_label !== false
    });
  });

  configuredLabels.forEach(lbl => {
    if (!labelMap.has(lbl)) {
      labelMap.set(lbl, {
        label: lbl,
        title: lbl,
        pending_count: 0,
        color: '#3b82f6',
        is_sales_label: true
      });
    }
  });

  const labelBreakdown = [];
  let sumRecommended = 0;

  labelMap.forEach(item => {
    const eligible = readyAgents.filter(a => doesAgentMatchLabel(a, item.label));
    const labelCap = eligible.reduce((sum, a) => sum + a.remainingCapacity, 0);
    const needed = Math.min(labelCap, item.pending_count);
    sumRecommended += needed;

    const friendlyName = LABEL_ARABIC_NAMES[item.label] || item.title || item.label;

    labelBreakdown.push({
      ...item,
      friendlyName,
      eligibleAgents: eligible,
      eligibleCount: eligible.length,
      capacity: labelCap,
      recommendedReopen: needed
    });
  });

  labelBreakdown.sort((a, b) => {
    if (a.recommendedReopen > 0 && b.recommendedReopen === 0) return -1;
    if (b.recommendedReopen > 0 && a.recommendedReopen === 0) return 1;
    if (a.pending_count !== b.pending_count) return b.pending_count - a.pending_count;
    return a.friendlyName.localeCompare(b.friendlyName, 'ar');
  });

  const totalRecommendedReopen = Math.min(totalTeamCapacity, totalPending, sumRecommended);
  const shouldReopen = totalRecommendedReopen > 0;

  let statusReason = '';
  if (shouldReopen) {
    statusReason = `يوجد عجز في التغذية: مطلوب فتح محادثات الآن لتغذية الموظفين الجاهزين لاستقبال شاتات.`;
  } else if (readyAgents.length === 0) {
    statusReason = 'لا يوجد موظفين مستعدين حالياً (جميعهم خارج الشيفت أو مستبعدين أو مقفلين ليمت النصف ساعة وماكس اليوم).';
  } else if (totalPending === 0) {
    statusReason = 'صندوق المعلقات في شات ووت فارغ حالياً (0 معلق).';
  } else {
    statusReason = 'طاقة الاستيعاب مغطاة بالكامل — الفريق مكتفي حالياً ولا داعي لفتح محادثات إضافية تجنباً لتراكمها.';
  }

  return {
    shouldReopen,
    statusReason,
    readyAgentsCount: readyAgents.length,
    totalTeamCapacity,
    totalPending,
    totalRecommendedReopen,
    labelBreakdown
  };
}

export function ReopenCalculatorModal({
  isOpen,
  onClose,
  agents = [],
  pendingSummary,
  configuredLabels = [],
  onReopenLabel,
  onRefreshPending,
  loadingPending
}) {
  const [counts, setCounts] = useState({});
  const [reopeningLabel, setReopeningLabel] = useState(null);
  const [filterMode, setFilterMode] = useState('needed'); // 'needed' | 'all'

  const calculation = useMemo(() => {
    return calculateReopenDemand(agents, pendingSummary, configuredLabels);
  }, [agents, pendingSummary, configuredLabels]);

  if (!isOpen) return null;

  const {
    shouldReopen,
    statusReason,
    readyAgentsCount,
    totalTeamCapacity,
    totalPending,
    totalRecommendedReopen,
    labelBreakdown
  } = calculation;

  const displayedLabels = filterMode === 'needed'
    ? labelBreakdown.filter(l => l.recommendedReopen > 0)
    : labelBreakdown;

  const handleReopen = async (label, count) => {
    if (!onReopenLabel) return;
    setReopeningLabel(label);
    try {
      await onReopenLabel(label, count);
    } finally {
      setReopeningLabel(null);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1200,
      background: 'rgba(15, 23, 42, 0.72)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      direction: 'rtl',
      animation: 'fadeIn 0.2s ease'
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 18,
        maxWidth: 880,
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text-main)',
        overflow: 'hidden'
      }}>
        
        {/* Modal Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-elevated)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: shouldReopen ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: shouldReopen ? '1px solid #f59e0b' : '1px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22
            }}>
              {shouldReopen ? '⚡' : '🟢'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>
                حاسبة احتياج الـ Reopen (تغذية التوزيع حسب طاقة الفريق)
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                تحليل فوري لطاقة الموظفين المتاحين في الصالة وتحديد كم شات مطلوب فتحه من كل ليبل.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={onRefreshPending}
              disabled={loadingPending}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--primary)',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: loadingPending ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
              title="تحديث إحصائيات المعلقات من شات ووت"
            >
              <span>{loadingPending ? '⏳' : '🔄'}</span>
              <span>{loadingPending ? 'جاري الفحص...' : 'فحص المعلقات'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
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

        {/* Modal Scrollable Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Primary Diagnosis Hero Banner */}
          <div style={{
            background: shouldReopen
              ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(239, 68, 68, 0.1) 100%)'
              : 'rgba(16, 185, 129, 0.1)',
            border: shouldReopen ? '1.5px solid #f59e0b' : '1px solid rgba(16, 185, 129, 0.4)',
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
                fontSize: 32,
                filter: shouldReopen ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))' : 'none'
              }}>
                {shouldReopen ? '⚠️' : '✅'}
              </div>
              <div>
                <div style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: shouldReopen ? '#d97706' : '#10b981',
                  marginBottom: 2
                }}>
                  {shouldReopen ? 'مطلوب إعادة فتح محادثات الآن!' : 'الفريق مكتفي حالياً — لا داعي لعمل Reopen'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-main)', opacity: 0.9 }}>
                  {statusReason}
                </div>
              </div>
            </div>

            {shouldReopen && (
              <div style={{
                background: '#f59e0b',
                color: '#ffffff',
                padding: '8px 18px',
                borderRadius: 10,
                textAlign: 'center',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.4)'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700 }}>المطلوب فتحه إجمالياً</div>
                <div style={{ fontSize: 20, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {totalRecommendedReopen} شات
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12
          }}>
            {/* Metric 1 */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                👥 الموظفين المتاحين
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>
                {readyAgentsCount} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>موظف جاهز</span>
              </div>
            </div>

            {/* Metric 2 */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                ⚡ طاقة الاستيعاب المتبقية
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--badge-ready-text)' }}>
                {totalTeamCapacity} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>شات بالنصف ساعة</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                📬 المعلق في شات ووت
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#f59e0b' }}>
                {(totalPending || 0).toLocaleString()} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>شات معلق</span>
              </div>
            </div>

            {/* Metric 4 */}
            <div style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              padding: '12px 16px'
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                🎯 عجز التغذية المطلوب
              </div>
              <div style={{
                fontSize: 18,
                fontWeight: 900,
                color: totalRecommendedReopen > 0 ? '#ef4444' : '#10b981'
              }}>
                {totalRecommendedReopen} <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>شات مطلوب فتحه</span>
              </div>
            </div>
          </div>

          {/* Label Groups Breakdown Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🏷️</span>
                <span>تحديد الاحتياج لكل مجموعة ليبولات (Label Breakdown)</span>
              </div>

              {/* View Filter Switcher */}
              <div style={{
                display: 'inline-flex',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: 2
              }}>
                <button
                  type="button"
                  onClick={() => setFilterMode('needed')}
                  style={{
                    border: 'none',
                    borderRadius: 6,
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: filterMode === 'needed' ? 'var(--primary)' : 'transparent',
                    color: filterMode === 'needed' ? '#ffffff' : 'var(--text-muted)'
                  }}
                >
                  ⚡ التي تحتاج فتح فقط ({labelBreakdown.filter(l => l.recommendedReopen > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  style={{
                    border: 'none',
                    borderRadius: 6,
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: filterMode === 'all' ? 'var(--primary)' : 'transparent',
                    color: filterMode === 'all' ? '#ffffff' : 'var(--text-muted)'
                  }}
                >
                  الكل ({labelBreakdown.length})
                </button>
              </div>
            </div>

            {/* List / Cards of Labels */}
            {displayedLabels.length === 0 ? (
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: 12,
                padding: '30px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13
              }}>
                {filterMode === 'needed'
                  ? '🎉 رائع! لا يوجد أي ليبل به عجز حالياً (الفريق مكتفي بجميع التخصصات).'
                  : 'لا توجد تصنيفات معرفة حالياً.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayedLabels.map(item => {
                  const isNeeded = item.recommendedReopen > 0;
                  const defaultVal = item.recommendedReopen > 0 ? item.recommendedReopen : Math.min(10, item.pending_count || 1);
                  const countInput = counts[item.label] ?? defaultVal;
                  const isReopening = reopeningLabel === item.label;

                  return (
                    <div
                      key={item.label}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: isNeeded ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                        borderRadius: 12,
                        padding: '12px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                        transition: 'all 0.15s'
                      }}
                    >
                      {/* Label Info & Assigned Agents */}
                      <div style={{ flex: '1 1 260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: item.color || '#3b82f6'
                          }} />
                          <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--text-main)' }}>
                            {item.friendlyName}
                          </span>
                        </div>

                        {/* Agents Tag */}
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {item.eligibleCount > 0 ? (
                            <span>
                              👤 <b style={{ color: 'var(--text-main)' }}>{item.eligibleCount}</b> موظف جاهز لهذا الليبل 
                              {item.eligibleCount <= 3 && (
                                <span style={{ opacity: 0.8 }}> ({item.eligibleAgents.map(a => a.name).join('، ')})</span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-dim)' }}>
                              ⚪ لا يوجد موظفين مستعدين لهذا الليبل حالياً
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stat Counters: Capacity vs Pending */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {/* Capacity */}
                        <div style={{ textAlign: 'center', minWidth: 70 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>طاقة الموظفين</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--badge-ready-text)', fontVariantNumeric: 'tabular-nums' }}>
                            {item.capacity} شات
                          </div>
                        </div>

                        {/* Pending */}
                        <div style={{ textAlign: 'center', minWidth: 70 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>المعلق بالـ CRM</div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
                            {item.pending_count.toLocaleString()}
                          </div>
                        </div>

                        {/* Target Quota Recommendation (العدد المطلوب فتحه) */}
                        <div style={{
                          background: isNeeded ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.1)',
                          border: isNeeded ? '1px solid #f59e0b' : '1px solid var(--border-subtle)',
                          borderRadius: 8,
                          padding: '6px 12px',
                          textAlign: 'center',
                          minWidth: 100
                        }}>
                          <div style={{ fontSize: 10, color: isNeeded ? '#d97706' : 'var(--text-muted)', fontWeight: 700 }}>
                            المطلوب فتحه
                          </div>
                          <div style={{
                            fontSize: 16,
                            fontWeight: 900,
                            color: isNeeded ? '#d97706' : 'var(--text-dim)',
                            fontVariantNumeric: 'tabular-nums'
                          }}>
                            {item.recommendedReopen > 0 ? `${item.recommendedReopen} شات` : '0 (مكتفي)'}
                          </div>
                        </div>
                      </div>

                      {/* Action Controls */}
                      {item.pending_count > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number"
                            min={1}
                            max={item.pending_count}
                            value={countInput}
                            onChange={(e) => {
                              const val = Math.max(1, Math.min(item.pending_count, parseInt(e.target.value, 10) || 1));
                              setCounts(prev => ({ ...prev, [item.label]: val }));
                            }}
                            style={{
                              width: 60,
                              background: 'var(--bg-input)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-main)',
                              padding: '6px 8px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 800,
                              textAlign: 'center'
                            }}
                            title="تعديل عدد الشاتات المطلوب فتحها"
                          />

                          <button
                            type="button"
                            onClick={() => handleReopen(item.label, countInput)}
                            disabled={isReopening}
                            style={{
                              background: isNeeded ? '#10b981' : 'var(--bg-surface)',
                              color: isNeeded ? '#ffffff' : 'var(--text-main)',
                              border: isNeeded ? 'none' : '1px solid var(--border-subtle)',
                              padding: '6px 14px',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: isReopening ? 'wait' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              boxShadow: isNeeded ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                            }}
                            title="إعادة فتح هذا العدد ليتم توجييهه للموظفين فوراً"
                          >
                            <span>{isReopening ? '⏳' : '⚡'}</span>
                            <span>{isReopening ? 'جاري الفتح...' : `فتح (${countInput})`}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-elevated)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            💡 الحسبة مبنية على: ليمت النصف ساعة المتبقي + ماكس اليوم + مواعيد الشيفتات الحالية للموظفين المحددين.
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
}
