import { useState, useEffect } from 'react';
import { AgentStatusBadge } from './AgentStatusBadge';
import { COORDINATOR_ARABIC_NAMES, formatHour12, getWindowTimingInfo } from './constants';
import { agentsApi } from '../../api/agents';

export function AgentInspectorDrawer({
  agent,
  isOpen,
  onClose,
  onToggleSelect,
  onTogglePause,
  onUpdateLimit,
  onUpdateDailyLimit,
  onSaveShift,
  onResetShift,
  onSaveLabels,
  onPullChats,
  availableSalesLabels,
  showNotification
}) {
  const [activeTab, setActiveTab] = useState('controls'); // 'controls', 'shift', 'labels', 'chats'
  
  // Shift state
  const [startHour, setStartHour] = useState(11);
  const [endHour, setEndHour] = useState(19);
  const [savingShift, setSavingShift] = useState(false);

  // Labels state
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [savingLabels, setSavingLabels] = useState(false);

  // Chats state
  const [chats, setChats] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);

  // Pull chats confirmation
  const [confirmPull, setConfirmPull] = useState(false);
  const [pulling, setPulling] = useState(false);

  // Sync state whenever active agent changes
  useEffect(() => {
    if (agent) {
      setStartHour(agent.shift_start ?? 11);
      setEndHour(agent.shift_end ?? 19);
      setSelectedLabels(agent.assigned_labels ? [...agent.assigned_labels] : []);
      setConfirmPull(false);
      
      if (activeTab === 'chats') {
        loadAgentChats(agent.id);
      }
    }
  }, [agent, activeTab]);

  const loadAgentChats = async (agentId) => {
    setLoadingChats(true);
    try {
      const res = await agentsApi.fetchAgentChats(agentId);
      setChats(res.chats || []);
    } catch {
      setChats([]);
    } finally {
      setLoadingChats(false);
    }
  };

  if (!isOpen || !agent) return null;

  const rawCoord = (agent.coordinator_name || '').trim();
  const coordAr = COORDINATOR_ARABIC_NAMES[rawCoord.toLowerCase()];
  const coordDisplay = coordAr ? `${coordAr} (${rawCoord})` : rawCoord || 'عام / بدون كوردينيتور';

  const windowChats = agent.current_window_chats || 0;
  const windowLimit = agent.chat_limit || 10;
  const todayChats = agent.today_chats_count || 0;
  const dailyLimit = agent.daily_chat_limit || 100;

  const handleSaveShiftClick = async () => {
    setSavingShift(true);
    try {
      await onSaveShift(agent, startHour, endHour);
    } finally {
      setSavingShift(false);
    }
  };

  const handleResetShiftClick = async () => {
    setSavingShift(true);
    try {
      await onResetShift(agent);
    } finally {
      setSavingShift(false);
    }
  };

  const handleSaveLabelsClick = async () => {
    setSavingLabels(true);
    try {
      await onSaveLabels(agent, selectedLabels);
    } finally {
      setSavingLabels(false);
    }
  };

  const handleExecutePull = async () => {
    setPulling(true);
    try {
      await onPullChats(agent);
      setConfirmPull(false);
    } finally {
      setPulling(false);
    }
  };

  const toggleLabel = (lbl) => {
    setSelectedLabels(prev =>
      prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]
    );
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

      {/* Drawer Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 580,
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
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>
                {agent.name}
              </h2>
              <AgentStatusBadge agent={agent} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, flexWrap: 'wrap', fontSize: 12 }}>
              {agent.crm_name && agent.crm_name !== agent.name && (
                <span style={{ color: 'var(--primary)' }}>
                  CRM: {agent.crm_name}
                </span>
              )}
              <span style={{ color: 'var(--text-muted)' }}>
                👥 {coordDisplay}
              </span>
              <span style={{ color: agent.is_manual_shift ? 'var(--badge-paused-text)' : 'var(--text-dim)' }}>
                ⏰ {agent.shift_text || 'بدون شيفت'} {agent.is_manual_shift ? '(معدل يدوياً)' : ''}
              </span>
            </div>
          </div>

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
            title="إغلاق اللوحة (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          padding: '4px 16px 0'
        }}>
          {[
            { id: 'controls', label: 'التحكم والقدرة', icon: '⚙️' },
            { id: 'shift', label: 'الشيفت والإذن', icon: '⏰' },
            { id: 'labels', label: 'التصنيفات المخصصة', icon: '🏷️' },
            { id: 'chats', label: 'شاتات اليوم', icon: '📋' }
          ].map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setActiveTab(t.id);
                  if (t.id === 'chats' && chats.length === 0) loadAgentChats(agent.id);
                }}
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: active ? 'var(--primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
                  padding: '12px 8px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'all 0.15s'
                }}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          
          {/* TAB 1: Controls & Capacity */}
          {activeTab === 'controls' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* Operational Toggles */}
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '16px 18px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 14
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                    المشاركة في التوزيع
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    تحديد الموظف في روليت التوزيع
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleSelect(agent)}
                    style={{
                      width: '100%',
                      background: agent.is_selected ? 'var(--badge-ready-bg)' : 'var(--bg-surface)',
                      border: agent.is_selected ? '1px solid var(--badge-ready-border)' : '1px solid var(--border-subtle)',
                      color: agent.is_selected ? 'var(--badge-ready-text)' : 'var(--text-muted)',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    {agent.is_selected ? '✓ محدد للتوزيع' : '✕ مستبعد حالياً'}
                  </button>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                    حالة الإيقاف المؤقت
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                    استراحة مؤقتة أو صلاة
                  </div>
                  <button
                    type="button"
                    onClick={() => onTogglePause(agent)}
                    style={{
                      width: '100%',
                      background: agent.is_paused ? 'var(--badge-paused-bg)' : 'var(--bg-surface)',
                      border: agent.is_paused ? '1px solid var(--badge-paused-border)' : '1px solid var(--border-subtle)',
                      color: agent.is_paused ? 'var(--badge-paused-text)' : 'var(--text-muted)',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    {agent.is_paused ? '⏸️ موقوف مؤقتاً' : '▶️ يعمل بشكل طبيعي'}
                  </button>
                </div>
              </div>

              {/* 30-Minute Capacity Control */}
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '16px 18px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                      ⏱️ سقف النصف ساعة (30 دقيقة)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      الحد الأقصى للشاتات في نافذة النصف ساعة الحالية
                    </div>
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {windowChats} / {windowLimit} شات
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{
                  height: 8,
                  background: 'var(--bar-bg)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  margin: '12px 0 16px'
                }}>
                  <div style={{
                    width: `${Math.min(100, (windowChats / (windowLimit || 1)) * 100)}%`,
                    height: '100%',
                    background: windowChats >= windowLimit ? '#f97316' : 'var(--bar-fill)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>

                {/* Steppers */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>تعديل الليمت:</span>
                  <button
                    type="button"
                    onClick={() => onUpdateLimit(agent, -1)}
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)',
                      width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontWeight: 800
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', minWidth: 30, textAlign: 'center' }}>
                    {windowLimit}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateLimit(agent, 1)}
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)',
                      width: 32, height: 32, borderRadius: 6, cursor: 'pointer', fontWeight: 800
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Window Timing Details (من كام لكام ومتبقي كام دقيقة) */}
                {(() => {
                  const timing = getWindowTimingInfo(agent);
                  return (
                    <div style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 10,
                      padding: '10px 14px',
                      marginTop: 14,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>⏱️</span>
                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                            فترة النصف ساعة الحالية:
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', marginTop: 2 }}>
                            {timing.hasActiveWindow ? `${timing.startFormatted} ⟵ ${timing.endFormatted}` : 'لم تبدأ بعد (بانتظار أول محادثة)'}
                          </div>
                        </div>
                      </div>

                      {timing.hasActiveWindow ? (
                        <div style={{
                          background: windowChats >= windowLimit ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                          color: windowChats >= windowLimit ? '#ef4444' : 'var(--primary)',
                          border: windowChats >= windowLimit ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontWeight: 800,
                          fontSize: 12
                        }}>
                          متبقي {timing.remainingMinutes} دقيقة
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                          ⚪ ستبدأ 30 دقيقة جديدة فور استلام شات
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Daily Max Capacity Control */}
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '16px 18px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                      🎯 ماكس اليوم الكامل (Daily Max)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      الحد الأقصى الإجمالي للشاتات طوال اليوم حتى نهاية الشيفت
                    </div>
                  </div>

                  <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {todayChats} / {dailyLimit} شات
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={{
                  height: 8,
                  background: 'var(--bar-bg)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  margin: '12px 0 16px'
                }}>
                  <div style={{
                    width: `${Math.min(100, (todayChats / (dailyLimit || 1)) * 100)}%`,
                    height: '100%',
                    background: todayChats >= dailyLimit ? '#ef4444' : 'var(--bar-fill)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>

                {/* Quick Add Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>إضافة سريعة للماكس:</span>
                  <button
                    type="button"
                    onClick={() => onUpdateDailyLimit(agent, -10)}
                    style={{
                      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)',
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12
                    }}
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateDailyLimit(agent, 10)}
                    style={{
                      background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', color: 'var(--primary)',
                      padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 12
                    }}
                  >
                    +10 شات
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateDailyLimit(agent, 25)}
                    style={{
                      background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', color: 'var(--primary)',
                      padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 800, fontSize: 12
                    }}
                  >
                    +25 شات
                  </button>
                </div>
              </div>

              {/* Emergency Zone: Pull Chats */}
              <div style={{
                background: 'var(--badge-capped-bg)',
                border: '1px solid var(--badge-capped-border)',
                borderRadius: 12,
                padding: '16px 18px'
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--badge-capped-text)', marginBottom: 4 }}>
                  🚨 إجراء طوارئ: سحب الشاتات المفتوحة
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
                  في حال خروج الموظف المفاجئ أو تراكم المحادثات دون رد، يمكنك سحب جميع محادثاته المفتوحة في شات ووت وإعادتها للانتظار (Unassigned) فوراً.
                </div>

                {!confirmPull ? (
                  <button
                    type="button"
                    onClick={() => setConfirmPull(true)}
                    style={{
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    📥 سحب جميع الشاتات من {agent.name}
                  </button>
                ) : (
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid #ef4444',
                    borderRadius: 8,
                    padding: 12
                  }}>
                    <div style={{ fontSize: 12, color: 'var(--badge-capped-text)', fontWeight: 700, marginBottom: 10 }}>
                      هل أنت متأكد من فك إسناد كل شاتات الموظف وإعادتها للانتظار؟
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleExecutePull}
                        disabled={pulling}
                        style={{
                          background: '#dc2626',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: 6,
                          fontWeight: 800,
                          fontSize: 12,
                          cursor: pulling ? 'wait' : 'pointer'
                        }}
                      >
                        {pulling ? 'جاري السحب...' : 'نعم، اسحب الآن'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPull(false)}
                        disabled={pulling}
                        style={{
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-subtle)',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          cursor: 'pointer'
                        }}
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: Shift & Permission */}
          {activeTab === 'shift' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '18px 20px'
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)', marginBottom: 4 }}>
                  ⏰ تعديل الشيفت / تسجيل إذن
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                  حدد ساعات الشيفت الفعلية لهذا الموظف. المواعيد المسجلة يدوياً هنا تصبح ذات حماية دائمة ولن يقوم الـ CRM بمسحها أثناء المزامنة.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
                      بداية الشيفت:
                    </label>
                    <select
                      value={startHour}
                      onChange={(e) => setStartHour(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-main)',
                        padding: '9px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700
                      }}
                    >
                      {Array.from({ length: 24 }).map((_, h) => (
                        <option key={h} value={h}>{formatHour12(h)}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
                      نهاية الشيفت:
                    </label>
                    <select
                      value={endHour}
                      onChange={(e) => setEndHour(Number(e.target.value))}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-main)',
                        padding: '9px 12px',
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 700
                      }}
                    >
                      {Array.from({ length: 25 }).map((_, h) => (
                        <option key={h} value={h === 0 ? 24 : h}>{formatHour12(h === 0 ? 24 : h)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16
                }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>الموعد المختار:</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>
                    {formatHour12(startHour)} - {formatHour12(endHour)}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {agent.is_manual_shift === 1 && (
                    <button
                      type="button"
                      onClick={handleResetShiftClick}
                      disabled={savingShift}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--badge-paused-border)',
                        color: 'var(--badge-paused-text)',
                        padding: '8px 14px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      🔄 استعادة شيفت الـ CRM الأصلي
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSaveShiftClick}
                    disabled={savingShift}
                    style={{
                      marginRight: 'auto',
                      background: '#10b981',
                      border: 'none',
                      color: '#fff',
                      padding: '8px 22px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: savingShift ? 'wait' : 'pointer',
                      boxShadow: '0 2px 10px rgba(16, 185, 129, 0.35)'
                    }}
                  >
                    {savingShift ? 'جاري الحفظ...' : '💾 حفظ وتثبيت الموعد'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Labels Specialization */}
          {activeTab === 'labels' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '18px 20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                      🏷️ التصنيفات الخاصة بالموظف
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      إذا لم تحدد أي تصنيف، سيستقبل الموظف <strong>جميع تصنيفات السيلز</strong> افتراضياً.
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedLabels([...availableSalesLabels, 'بدون ليبل (Unlabeled)'])}
                      style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--primary)', color: 'var(--primary)',
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      تحديد الكل
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLabels([])}
                      style={{
                        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      تفريغ (الكل)
                    </button>
                  </div>
                </div>

                {/* Checklist */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 8,
                  margin: '16px 0'
                }}>
                  {/* Unlabeled option */}
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: selectedLabels.includes('بدون ليبل (Unlabeled)') ? 'var(--primary-bg)' : 'var(--bg-surface)',
                    border: selectedLabels.includes('بدون ليبل (Unlabeled)') ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                    color: selectedLabels.includes('بدون ليبل (Unlabeled)') ? 'var(--primary)' : 'var(--text-main)'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedLabels.includes('بدون ليبل (Unlabeled)')}
                      onChange={() => toggleLabel('بدون ليبل (Unlabeled)')}
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontWeight: 700 }}>📥 بدون ليبل (Unlabeled)</span>
                  </label>

                  {availableSalesLabels.map(lbl => {
                    const isChecked = selectedLabels.includes(lbl);
                    return (
                      <label
                        key={lbl}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: isChecked ? 'var(--primary-bg)' : 'var(--bg-surface)',
                          border: isChecked ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                          color: isChecked ? 'var(--primary)' : 'var(--text-main)'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleLabel(lbl)}
                          style={{ accentColor: 'var(--primary)' }}
                        />
                        <span style={{ fontWeight: 600 }}>🏷️ {lbl}</span>
                      </label>
                    );
                  })}
                </div>

                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {selectedLabels.length === 0 ? (
                    <span style={{ color: 'var(--badge-ready-text)', fontWeight: 600 }}>
                      🌐 الوضع الافتراضي: يستقبل جميع محادثات السيلز بدون استثناء.
                    </span>
                  ) : (
                    <span>
                      تم تخصيص <strong style={{ color: 'var(--primary)' }}>{selectedLabels.length}</strong> تصنيف حصري لهذا الموظف.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleSaveLabelsClick}
                    disabled={savingLabels}
                    style={{
                      background: 'var(--primary)',
                      border: 'none',
                      color: '#ffffff',
                      padding: '8px 24px',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 13,
                      cursor: savingLabels ? 'wait' : 'pointer'
                    }}
                  >
                    {savingLabels ? 'جاري الحفظ...' : '💾 حفظ التصنيفات'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Today's Routed Chats */}
          {activeTab === 'chats' && (
            <div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
                  📋 المحادثات المستلمة اليوم ({chats.length})
                </div>
                <button
                  type="button"
                  onClick={() => loadAgentChats(agent.id)}
                  disabled={loadingChats}
                  style={{
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--primary)',
                    padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer'
                  }}
                >
                  {loadingChats ? 'جاري التحميل...' : '🔄 تحديث'}
                </button>
              </div>

              {loadingChats ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                  ⏳ جاري تحميل سجل شاتات الموظف من قاعدة البيانات...
                </div>
              ) : chats.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)'
                }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>لم يستلم الموظف أي محادثات اليوم حتى الآن</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {chats.map(chat => (
                    <div
                      key={chat.id}
                      style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <a
                            href={`https://crm.elkheta.com/app/accounts/3/conversations/${chat.conv_id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: 'var(--primary)',
                              fontWeight: 800,
                              fontSize: 13,
                              textDecoration: 'none'
                            }}
                          >
                            🔗 #{chat.conv_id}
                          </a>
                          <span style={{
                            fontSize: 11,
                            padding: '1px 7px',
                            borderRadius: 4,
                            background: 'var(--primary-bg)',
                            color: 'var(--primary)',
                            fontWeight: 700
                          }}>
                            {chat.label || 'عام'}
                          </span>
                        </div>

                        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-main)', fontWeight: 600 }}>
                          {chat.sender_name || 'عميل'} {chat.sender_phone ? `(${chat.sender_phone})` : ''}
                        </div>
                        {chat.last_message && (
                          <div style={{
                            fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
                            maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {chat.last_message}
                          </div>
                        )}
                      </div>

                      <div style={{ textAlign: 'left', fontSize: 11, color: 'var(--text-dim)', direction: 'ltr', fontVariantNumeric: 'tabular-nums' }}>
                        {chat.assigned_at ? new Date(chat.assigned_at).toLocaleTimeString('ar-EG') : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
