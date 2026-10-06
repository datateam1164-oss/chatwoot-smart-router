import { memo } from 'react';
import { getAgentStatus } from './constants';

export const AgentStatusBadge = memo(function AgentStatusBadge({ agent, compact = false }) {
  const status = getAgentStatus(agent);

  return (
    <span
      title={status.reason}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 4 : 6,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 8,
        fontSize: compact ? 11 : 12,
        fontWeight: 700,
        background: status.bg,
        color: status.color,
        border: `1px solid ${status.border}`,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        lineHeight: 1.3
      }}
    >
      <span style={{ fontSize: compact ? 10 : 12 }}>{status.icon}</span>
      <span>{status.label}</span>
    </span>
  );
});
