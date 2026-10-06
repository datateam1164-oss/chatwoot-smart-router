import { memo } from 'react';
import { AgentStatusBadge } from './AgentStatusBadge';
import { COORDINATOR_ARABIC_NAMES, getWindowTimingInfo } from './constants';

export const AgentTableView = memo(function AgentTableView({
  agents,
  selectedAgentIds,
  onToggleSelectAgent,
  onToggleSelectAll,
  onDeselectAll,
  onInspectAgent,
  onToggleSelect,
  onTogglePause,
  onUpdateLimit,
  onUpdateDailyLimit
}) {
  const allSelected = agents.length > 0 && agents.every(a => Boolean(a.is_selected));
  const someSelected = agents.some(a => Boolean(a.is_selected)) && !allSelected;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-card)'
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'right',
          fontSize: 13,
          color: 'var(--text-main)'
        }}>
          {/* Table Header */}
          <thead>
            <tr style={{
              background: 'var(--bg-surface-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              <th style={{ padding: '8px 10px', width: 54, textAlign: 'center' }}>
                {someSelected || allSelected ? (
                  <button
                    type="button"
                    onClick={() => onDeselectAll && onDeselectAll()}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      color: '#ef4444',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                    title="إلغاء تحديد الكل (تصفير الاختيار للبدء من جديد)"
                  >
                    🚫 إلغاء الكل
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700 }}>
                    تحديد
                  </span>
                )}
              </th>
              <th style={{ padding: '12px 14px' }}>Employee</th>
              <th style={{ padding: '12px 14px' }}>Coordinator</th>
              <th style={{ padding: '12px 14px' }}>Shift</th>
              <th style={{ padding: '12px 14px' }}>Status</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', minWidth: 150 }}>Limit (30m)</th>
              <th style={{ padding: '12px 14px', textAlign: 'center', minWidth: 160 }}>Daily Max</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>Open Chats</th>
              <th style={{ padding: '12px 14px' }}>Labels</th>
              <th style={{ padding: '12px 14px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {agents.map(agent => {
              const isChecked = Boolean(agent.is_selected);
              const windowChats = agent.current_window_chats || 0;
              const windowLimit = agent.chat_limit || 10;
              const todayChats = agent.today_chats_count || 0;
              const dailyLimit = agent.daily_chat_limit || 100;
              const isDailyCapped = Boolean(agent.is_daily_max_reached || todayChats >= dailyLimit);

              const rawCoord = (agent.coordinator_name || '').trim();
              const coordAr = COORDINATOR_ARABIC_NAMES[rawCoord.toLowerCase()];
              const coordDisplay = coordAr ? coordAr : (rawCoord && rawCoord.toLowerCase() !== 'none' ? rawCoord : 'عام');

              return (
                <tr
                  key={agent.id}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isChecked
                      ? (agent.is_paused
                          ? 'var(--badge-paused-bg)'
                          : isDailyCapped
                          ? 'var(--badge-capped-bg)'
                          : 'transparent')
                      : 'rgba(100, 116, 139, 0.05)',
                    opacity: !isChecked ? 0.6 : 1,
                    transition: 'background 0.15s ease, opacity 0.15s ease'
                  }}
                >
                  {/* Select Checkbox (Toggles Routing Eligibility) */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect ? onToggleSelect(agent) : (onToggleSelectAgent && onToggleSelectAgent(agent.id))}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
                      title={isChecked ? "محدد للتوزيع - انقر للاستبعاد" : "مستبعد من التوزيع - انقر للتحديد"}
                    />
                  </td>

                  {/* Agent Name */}
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        onClick={() => onInspectAgent(agent)}
                        style={{
                          fontWeight: 700,
                          color: 'var(--text-main)',
                          fontSize: 13,
                          cursor: 'pointer',
                          textDecoration: 'none'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-main)'}
                      >
                        {agent.name}
                      </span>
                      {agent.team === 'Data' && (
                        <span style={{ fontSize: 10, background: 'var(--border-highlight)', color: 'var(--text-muted)', padding: '1px 5px', borderRadius: 4 }}>
                          داتا
                        </span>
                      )}
                    </div>
                    {agent.crm_name && agent.crm_name !== agent.name && (
                      <div style={{ fontSize: 11, color: 'var(--primary)', marginTop: 2 }}>
                        {agent.crm_name}
                      </div>
                    )}
                  </td>

                  {/* Coordinator */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      fontSize: 11,
                      color: coordDisplay === 'عام' ? 'var(--text-dim)' : 'var(--text-muted)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      {coordDisplay}
                    </span>
                  </td>

                  {/* Shift */}
                  <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: agent.in_shift ? '#10b981' : 'var(--text-muted)'
                      }}>
                        {agent.shift_text || 'غير محدد'}
                      </span>
                      {agent.is_manual_shift === 1 && (
                        <span
                          title="تم تعديل هذا الشيفت يدوياً كإذن ومثبت في النظام"
                          style={{
                            fontSize: 10,
                            background: 'var(--badge-paused-bg)',
                            color: 'var(--badge-paused-text)',
                            border: '1px solid var(--badge-paused-border)',
                            padding: '1px 5px',
                            borderRadius: 4,
                            fontWeight: 700
                          }}
                        >
                          إذن
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Smart Status Badge */}
                  <td style={{ padding: '12px 14px' }}>
                    <AgentStatusBadge agent={agent} />
                  </td>

                  {/* 30-min Window Capacity */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => onUpdateLimit(agent, -1)}
                        style={{
                          background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)',
                          width: 22, height: 22, borderRadius: 4, cursor: 'pointer', fontSize: 12, lineHeight: 1
                        }}
                        title="إنقاص ليمت النصف ساعة"
                      >
                        -
                      </button>

                      <div style={{ width: 68, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: windowChats >= windowLimit ? '#f97316' : 'var(--text-main)',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {windowChats}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 2px' }}>/</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {windowLimit}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onUpdateLimit(agent, 1)}
                        style={{
                          background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)',
                          width: 22, height: 22, borderRadius: 4, cursor: 'pointer', fontSize: 12, lineHeight: 1
                        }}
                        title="زيادة ليمت النصف ساعة"
                      >
                        +
                      </button>
                    </div>

                    {/* Progress line */}
                    <div style={{
                      height: 3,
                      background: 'var(--bar-bg)',
                      borderRadius: 2,
                      overflow: 'hidden',
                      marginTop: 4,
                      width: '80%',
                      marginRight: 'auto',
                      marginLeft: 'auto'
                    }}>
                      <div style={{
                        width: `${Math.min(100, (windowChats / (windowLimit || 1)) * 100)}%`,
                        height: '100%',
                        background: windowChats >= windowLimit ? '#f97316' : 'var(--bar-fill)'
                      }} />
                    </div>

                    {/* Window Timing Details (من كام لكام ومتبقي كام دقيقة) */}
                    {(() => {
                      const timing = getWindowTimingInfo(agent);
                      if (timing.hasActiveWindow) {
                        return (
                          <div style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            marginTop: 5,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 4,
                            whiteSpace: 'nowrap'
                          }}>
                            <span style={{ fontSize: 10 }}>⏱️</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
                              {timing.startFormatted} - {timing.endFormatted}
                            </span>
                            <span style={{
                              background: windowChats >= windowLimit ? 'rgba(239, 68, 68, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                              color: windowChats >= windowLimit ? '#ef4444' : 'var(--primary)',
                              padding: '1px 5px',
                              borderRadius: 4,
                              fontWeight: 800,
                              fontSize: 9.5
                            }}>
                              باقي {timing.remainingMinutes}د
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div style={{
                          fontSize: 9.5,
                          color: 'var(--text-dim)',
                          marginTop: 4,
                          textAlign: 'center'
                        }}>
                          ⚪ 30د جديدة (لم تبدأ)
                        </div>
                      );
                    })()}
                  </td>

                  {/* Daily Max Capacity */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <div style={{ minWidth: 70, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: isDailyCapped ? '#ef4444' : 'var(--text-main)',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {todayChats}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)', margin: '0 2px' }}>/</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {dailyLimit}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onUpdateDailyLimit(agent, 10)}
                        style={{
                          background: 'var(--primary-bg)',
                          border: '1px solid var(--primary-border)',
                          color: 'var(--primary)',
                          padding: '2px 7px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        title="زيادة سريعة لماكس اليوم (+10 شات)"
                      >
                        +10
                      </button>
                    </div>

                    {/* Progress line */}
                    <div style={{
                      height: 3,
                      background: 'var(--bar-bg)',
                      borderRadius: 2,
                      overflow: 'hidden',
                      marginTop: 4,
                      width: '80%',
                      marginRight: 'auto',
                      marginLeft: 'auto'
                    }}>
                      <div style={{
                        width: `${Math.min(100, (todayChats / (dailyLimit || 1)) * 100)}%`,
                        height: '100%',
                        background: isDailyCapped ? '#ef4444' : 'var(--bar-fill)'
                      }} />
                    </div>
                  </td>

                  {/* Chatwoot Open Chats */}
                  <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: (agent.chatwoot_open_chats || 0) > 15
                        ? 'var(--badge-capped-bg)'
                        : 'var(--primary-bg)',
                      color: (agent.chatwoot_open_chats || 0) > 15 ? 'var(--badge-capped-text)' : 'var(--primary)',
                      border: `1px solid ${(agent.chatwoot_open_chats || 0) > 15 ? 'var(--badge-capped-border)' : 'var(--primary-border)'}`,
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {agent.chatwoot_open_chats ?? 0}
                    </span>
                  </td>

                  {/* Assigned Labels */}
                  <td style={{ padding: '12px 14px' }}>
                    {agent.assigned_labels && agent.assigned_labels.length > 0 ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                        {agent.assigned_labels.slice(0, 2).map(lbl => (
                          <span
                            key={lbl}
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: 'var(--primary-bg)',
                              color: 'var(--primary)',
                              border: '1px solid var(--primary-border)',
                              padding: '1px 6px',
                              borderRadius: 4
                            }}
                          >
                            {lbl}
                          </span>
                        ))}
                        {agent.assigned_labels.length > 2 && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                            +{agent.assigned_labels.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        🌐 عام (الكل)
                      </span>
                    )}
                  </td>

                  {/* Row Actions */}
                  <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => onTogglePause(agent)}
                        style={{
                          background: agent.is_paused ? 'var(--badge-ready-bg)' : 'var(--badge-paused-bg)',
                          border: agent.is_paused ? '1px solid var(--badge-ready-border)' : '1px solid var(--badge-paused-border)',
                          color: agent.is_paused ? 'var(--badge-ready-text)' : 'var(--badge-paused-text)',
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        title={agent.is_paused ? 'استئناف التوزيع' : 'إيقاف مؤقت'}
                      >
                        {agent.is_paused ? 'استئناف' : 'إيقاف'}
                      </button>

                      <button
                        type="button"
                        onClick={() => onInspectAgent(agent)}
                        style={{
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--primary)',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                        title="فتح بطاقة الموظف الكاملة (الشيفت، الليبولات، الشاتات)"
                      >
                        فحص ⚙️
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
