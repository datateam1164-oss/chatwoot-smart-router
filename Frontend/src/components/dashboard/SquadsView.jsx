import { memo, useState } from 'react';
import { AgentTableView } from './AgentTableView';

export const SquadsView = memo(function SquadsView({
  teamGroups,
  selectedAgentIds,
  onToggleSelectAgent,
  onToggleSelectAll,
  onDeselectAll,
  onInspectAgent,
  onToggleSelect,
  onTogglePause,
  onUpdateLimit,
  onUpdateDailyLimit,
  onOpenTeamLabels
}) {
  const [expandedTeams, setExpandedTeams] = useState(() => {
    // By default, open the first 2 teams
    const initial = {};
    teamGroups.slice(0, 2).forEach(g => { initial[g.key] = true; });
    return initial;
  });

  const toggleTeam = (key) => {
    setExpandedTeams(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = (open) => {
    const next = {};
    teamGroups.forEach(g => { next[g.key] = open; });
    setExpandedTeams(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Squads Controls Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--bg-surface)',
        padding: '10px 16px',
        borderRadius: 12,
        border: '1px solid var(--border-subtle)',
        flexWrap: 'wrap',
        gap: 10,
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>👥</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-main)' }}>
            Coordinator Squads ({teamGroups.length} Teams)
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            يمكنك تخصيص وتثبيت تصنيفات معينة لكل فريق دفعة واحدة
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => expandAll(true)}
            style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--primary)',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            🔽 Expand All
          </button>
          <button
            type="button"
            onClick={() => expandAll(false)}
            style={{
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            🔼 Collapse All
          </button>
        </div>
      </div>

      {/* Squads Grid / Cards */}
      {teamGroups.map(group => {
        const isExpanded = Boolean(expandedTeams[group.key]);
        const inShiftCount = group.agents.filter(a => a.in_shift).length;
        const totalSquadChats = group.agents.reduce((sum, a) => sum + (a.today_chats_count || 0), 0);

        // Calculate squad label summary
        const allLabels = group.agents.map(a => a.assigned_labels || []);
        const allDefault = allLabels.every(l => l.length === 0);
        let squadLabelsText = '🌐 All Sales Labels (Default)';
        let squadLabelsType = 'default';

        if (!allDefault) {
          const firstStr = JSON.stringify([...allLabels[0] || []].sort());
          const allSame = allLabels.every(l => JSON.stringify([...l || []].sort()) === firstStr);
          if (allSame && allLabels[0] && allLabels[0].length > 0) {
            squadLabelsText = allLabels[0].join(' • ');
            squadLabelsType = 'custom';
          } else {
            squadLabelsText = '⚠️ Mixed Labels Across Squad';
            squadLabelsType = 'mixed';
          }
        }

        return (
          <div
            key={group.key}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 14,
              border: group.isCoordinatorSquad
                ? '1px solid var(--primary)'
                : '1px solid var(--border-subtle)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-card)'
            }}
          >
            {/* Squad Card Header */}
            <div style={{
              padding: '14px 18px',
              background: group.isCoordinatorSquad
                ? 'var(--primary-bg)'
                : 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              borderBottom: isExpanded ? '1px solid var(--border-subtle)' : 'none'
            }}>
              {/* Left Title & Status */}
              <div
                onClick={() => toggleTeam(group.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <span style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.2s ease'
                }}>
                  ▼
                </span>

                <span style={{ fontSize: 20 }}>
                  {group.isCoordinatorSquad ? '👑' : group.isUnassignedSquad ? '📋' : '👥'}
                </span>

                <div>
                  <h3 style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 800,
                    color: 'var(--text-main)'
                  }}>
                    {group.displayName}
                  </h3>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {group.agents.length} Members • {inShiftCount} In Shift
                  </div>
                </div>
              </div>

              {/* Right Metrics & Team Label Action */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {/* Squad Chats */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--text-muted)'
                }}>
                  <span>Squad Chats Today: </span>
                  <strong style={{ color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {totalSquadChats}
                  </strong>
                </div>

                {/* Team Label Pill & Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontWeight: 700,
                    background: squadLabelsType === 'custom'
                      ? 'var(--primary-bg)'
                      : squadLabelsType === 'mixed'
                      ? 'var(--badge-paused-bg)'
                      : 'var(--badge-ready-bg)',
                    color: squadLabelsType === 'custom'
                      ? 'var(--primary)'
                      : squadLabelsType === 'mixed'
                      ? 'var(--badge-paused-text)'
                      : 'var(--badge-ready-text)',
                    border: `1px solid ${squadLabelsType === 'custom' ? 'var(--primary-border)' : squadLabelsType === 'mixed' ? 'var(--badge-paused-border)' : 'var(--badge-ready-border)'}`
                  }}>
                    {squadLabelsText}
                  </span>

                  <button
                    type="button"
                    onClick={() => onOpenTeamLabels(group)}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-main)',
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                    title="Manage labels for this squad"
                  >
                    ⚙️ Manage Labels
                  </button>
                </div>
              </div>
            </div>

            {/* Squad Members Roster */}
            {isExpanded && (
              <div style={{ padding: 12 }}>
                <AgentTableView
                  agents={group.agents}
                  selectedAgentIds={selectedAgentIds}
                  onToggleSelectAgent={onToggleSelectAgent}
                  onToggleSelectAll={(checked) => {
                    const groupIds = group.agents.map(a => a.id);
                    if (onToggleSelectAll) {
                      onToggleSelectAll(checked, groupIds);
                    }
                  }}
                  onInspectAgent={onInspectAgent}
                  onToggleSelect={onToggleSelect}
                  onDeselectAll={onDeselectAll}
                  onTogglePause={onTogglePause}
                  onUpdateLimit={onUpdateLimit}
                  onUpdateDailyLimit={onUpdateDailyLimit}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
