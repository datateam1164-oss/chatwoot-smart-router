import { useState, useEffect, useMemo, useCallback } from 'react';
import { agentsApi } from '../../api/agents';

const getTodayStr = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

export function ResolveAuditModal({ isOpen, onClose, allAgents = [] }) {
  // Date & Source state
  const [selectedDate, setSelectedDate] = useState(() => getTodayStr());
  const [selectedSource, setSelectedSource] = useState('chatwoot'); // 'chatwoot' | 'system'

  // Audit data state
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState({});
  const [showOnlyViolations, setShowOnlyViolations] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('ALL');
  const [activeTab, setActiveTab] = useState('violations'); // 'violations' | 'agents'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedNotification, setCopiedNotification] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Load audit data
  const loadAudit = useCallback(async (targetDate, targetSource, force = false) => {
    const d = targetDate || selectedDate;
    const s = targetSource || selectedSource;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await agentsApi.getResolveAudit({
        date: d,
        source: s,
        forceRefresh: force
      });
      if (res?.success && res.data) {
        setAuditData(res.data);
        const violCount = (res.data.all_violations || []).length;
        if (violCount > 0) {
          setActiveTab('violations');
        } else {
          setActiveTab('agents');
        }
      } else {
        setFetchError('تعذر جلب بيانات التقرير');
      }
    } catch (err) {
      console.error(err);
      setFetchError(err.message || 'فشل الاتصال بالسيرفر');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedSource]);

  // Trigger load when modal opens or date/source changes
  useEffect(() => {
    if (isOpen) {
      loadAudit(selectedDate, selectedSource, false);
    }
  }, [isOpen, selectedDate, selectedSource, loadAudit]);

  // Date selection helper
  const handleDateChange = (newDate) => {
    setSelectedDate(newDate);
    setSelectedAgentId('ALL');
  };

  // Source selection helper
  const handleSourceChange = (newSource) => {
    setSelectedSource(newSource);
    setSelectedAgentId('ALL');
  };

  // Single Agent Quick Check
  const handleSingleAgentCheck = async (agId) => {
    setSingleLoading(prev => ({ ...prev, [agId]: true }));
    try {
      const res = await agentsApi.getResolveAudit({
        agentId: agId,
        date: selectedDate,
        source: selectedSource,
        forceRefresh: true
      });
      if (res?.success && res.data) {
        setAuditData(prev => {
          if (!prev) return res.data;
          const updatedAgent = (res.data.agents || [])[0];
          if (!updatedAgent) return prev;

          const exists = prev.agents.some(a => a.agent_id === agId);
          const newAgents = exists
            ? prev.agents.map(a => a.agent_id === agId ? updatedAgent : a)
            : [...prev.agents, updatedAgent];

          const otherViolations = (prev.all_violations || []).filter(v => v.agent_id !== agId);
          const newViolations = [...otherViolations, ...(res.data.all_violations || [])].sort(
            (a, b) => (b.assigned_at || '').localeCompare(a.assigned_at || '')
          );

          const totRouted = newAgents.reduce((s, a) => s + (a.total_routed || 0), 0);
          const totResolved = newAgents.reduce((s, a) => s + (a.total_resolved || 0), 0);
          const totViol = newAgents.reduce((s, a) => s + (a.total_violations || 0), 0);
          const totCompliant = newAgents.reduce((s, a) => s + (a.properly_resolved_count || 0), 0);

          return {
            ...prev,
            summary: {
              ...prev.summary,
              total_routed: totRouted,
              total_resolved: totResolved,
              total_violations: totViol,
              total_compliant: totCompliant,
              resolution_rate: totRouted > 0 ? Number(((totResolved / totRouted) * 100).toFixed(1)) : 0,
              compliance_rate: totResolved > 0 ? Number(((totCompliant / totResolved) * 100).toFixed(1)) : 100,
            },
            agents: newAgents,
            all_violations: newViolations
          };
        });
      }
    } catch (err) {
      console.error('Single check failed:', err);
    } finally {
      setSingleLoading(prev => ({ ...prev, [agId]: false }));
    }
  };

  // Copy Summary Report to Clipboard
  const handleCopyReport = () => {
    if (!auditData) return;
    const summary = auditData.summary || {};
    const violations = auditData.all_violations || [];

    let text = `📋 تقرير فحص جودة وإغلاق الشاتات (Resolve Audit)\n`;
    text += `📅 التاريخ: ${summary.date || selectedDate} | المصدر: ${selectedSource === 'chatwoot' ? 'شات ووت مباشرة' : 'سجل التوجيه'}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚡ إجمالي الشاتات المحلولة: ${summary.total_resolved || summary.total_routed || 0}\n`;
    text += `🚨 المخالفات المرصودة: ${summary.total_violations || 0}\n`;
    text += `✅ شاتات محلولة بالتزام وسليم: ${summary.total_compliant || 0} (${summary.compliance_rate || 100}%)\n\n`;

    if (violations.length > 0) {
      text += `🚨 تفاصيل الشاتات المخالفة:\n`;
      violations.forEach((v, idx) => {
        text += `${idx + 1}. [${v.agent_name}] شات #${v.conv_id}\n`;
        text += `   - الحالة: ${v.classification_label || ''}\n`;
        if (v.last_content) text += `   - آخر رسالة: "${v.last_content}"\n`;
        if (v.sender_phone) text += `   - العميل: ${v.sender_name || 'غير معروف'} (${v.sender_phone})\n`;
        text += `   - الرابط: ${v.chatwoot_url || ''}\n\n`;
      });
    } else {
      text += `🎉 لا توجد أي مخالفات مرصودة لهذا التاريخ، جميع الشاتات تم حلها بشكل سليم!\n`;
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    });
  };

  // Filtered Violations
  const filteredViolations = useMemo(() => {
    let list = auditData?.all_violations || [];
    if (selectedAgentId !== 'ALL') {
      list = list.filter(v => v.agent_id === selectedAgentId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(v =>
        (v.conv_id || '').includes(q) ||
        (v.agent_name || '').toLowerCase().includes(q) ||
        (v.sender_name || '').toLowerCase().includes(q) ||
        (v.sender_phone || '').includes(q) ||
        (v.last_content || '').toLowerCase().includes(q) ||
        (v.classification_label || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [auditData, selectedAgentId, searchQuery]);

  // Filtered Agents
  const filteredAgents = useMemo(() => {
    let list = auditData?.agents || [];
    if (showOnlyViolations) {
      list = list.filter(a => (a.total_violations || 0) > 0);
    }
    if (selectedAgentId !== 'ALL') {
      list = list.filter(a => a.agent_id === selectedAgentId);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(a =>
        (a.agent_name || '').toLowerCase().includes(q) ||
        (a.agent_id || '').includes(q)
      );
    }
    return list;
  }, [auditData, showOnlyViolations, selectedAgentId, searchQuery]);

  if (!isOpen) return null;

  const todayStr = getTodayStr();
  const yesterdayStr = getYesterdayStr();
  const isYesterday = selectedDate === yesterdayStr;
  const isToday = selectedDate === todayStr;

  const summary = auditData?.summary || {
    total_routed: 0,
    total_resolved: 0,
    total_violations: 0,
    total_compliant: 0,
    resolution_rate: 0,
    compliance_rate: 100,
    audited_at: ''
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(5px)',
          zIndex: 1100,
          animation: 'fadeIn 0.18s ease'
        }}
      />

      {/* Modal Dialog */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '96vw',
        maxWidth: 1140,
        maxHeight: '94vh',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 16,
        zIndex: 1101,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-card)',
        color: 'var(--text-main)',
        direction: 'rtl',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 22px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-elevated)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'var(--primary-bg)',
              border: '1px solid var(--primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20
            }}>
              🎯
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: 'var(--text-main)' }}>
                  Resolve & Quality Audit
                </h2>
                <span style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 6,
                  background: 'var(--primary-bg)',
                  border: '1px solid var(--primary-border)',
                  color: 'var(--primary)',
                  fontWeight: 800
                }}>
                  {selectedSource === 'chatwoot' ? '🌐 شات ووت مباشرة' : '⚡ سجل التوجيه'}
                </span>
                {summary.audited_at && (
                  <span style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)'
                  }}>
                    🕒 {summary.audited_at}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                فحص جودة الشاتات المغلقة، كشف الأسئلة المعلقة، ورصد الشاتات المحلولة بدون رد
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Copy Report */}
            <button
              type="button"
              onClick={handleCopyReport}
              disabled={loading || !auditData}
              style={{
                background: 'var(--bg-surface)',
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
              title="نسخ تقرير المخالفات والإحصائيات"
            >
              <span>{copiedNotification ? '✅' : '📋'}</span>
              <span>{copiedNotification ? 'تم النسخ!' : 'Copy Summary'}</span>
            </button>

            {/* Refresh Audit Button */}
            <button
              type="button"
              onClick={() => loadAudit(selectedDate, selectedSource, true)}
              disabled={loading}
              style={{
                background: 'var(--primary-bg)',
                border: '1px solid var(--primary-border)',
                color: 'var(--primary)',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
              title="إعادة فحص الشاتات لهذا التاريخ من شات ووت"
            >
              <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                {loading ? '⏳' : '🔄'}
              </span>
              <span>{loading ? 'Auditing...' : 'Refresh Full Audit'}</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: 18,
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: 6
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Date & Source Selector Bar */}
        <div style={{
          padding: '10px 22px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10
        }}>
          {/* Left: Quick Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
              تاريخ الفحص:
            </span>

            <button
              type="button"
              onClick={() => handleDateChange(todayStr)}
              style={{
                background: isToday ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                color: isToday ? '#fff' : 'var(--text-main)',
                border: `1px solid ${isToday ? 'var(--primary)' : 'var(--border-subtle)'}`,
                padding: '5px 12px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              📅 اليوم ({todayStr.slice(5)})
            </button>

            <button
              type="button"
              onClick={() => handleDateChange(yesterdayStr)}
              style={{
                background: isYesterday ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                color: isYesterday ? '#fff' : 'var(--text-main)',
                border: `1px solid ${isYesterday ? 'var(--primary)' : 'var(--border-subtle)'}`,
                padding: '5px 12px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              📅 أمس - يوم 30 ({yesterdayStr.slice(5)})
            </button>

            {/* Custom Date Input */}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '4px 10px',
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
              title="اختيار تاريخ مخصص"
            />
          </div>

          {/* Right: Data Source Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)' }}>
              مصدر البيانات:
            </span>
            <button
              type="button"
              onClick={() => handleSourceChange('chatwoot')}
              style={{
                background: selectedSource === 'chatwoot' ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                color: selectedSource === 'chatwoot' ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${selectedSource === 'chatwoot' ? 'var(--primary-border)' : 'var(--border-subtle)'}`,
                padding: '4px 10px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer'
              }}
              title="جلب جميع شاتات السيلز المحلولة في شات ووت لهذا التاريخ مباشرة"
            >
              🌐 شات ووت مباشرة (Chatwoot Direct)
            </button>
            <button
              type="button"
              onClick={() => handleSourceChange('system')}
              style={{
                background: selectedSource === 'system' ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                color: selectedSource === 'system' ? 'var(--primary)' : 'var(--text-muted)',
                border: `1px solid ${selectedSource === 'system' ? 'var(--primary-border)' : 'var(--border-subtle)'}`,
                padding: '4px 10px',
                borderRadius: 7,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer'
              }}
              title="فحص الشاتات الموزعة عبر راوتر السيستم المسجلة في السجل فقط"
            >
              ⚡ سجل السيستم (System Log)
            </button>
          </div>
        </div>

        {/* Top KPI Metrics Bar */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 12,
          padding: '14px 22px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          {/* Card 1: Total Resolved Handled */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Total Resolved Handled</span>
              <span style={{ fontSize: 16 }}>✔️</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {summary.total_resolved || summary.total_routed || 0}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              إجمالي الشاتات المحلولة في {selectedDate}
            </div>
          </div>

          {/* Card 2: Violations Detected */}
          <div style={{
            background: summary.total_violations > 0 ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface-elevated)',
            border: summary.total_violations > 0 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: summary.total_violations > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 800 }}>
                Violations Detected
              </span>
              <span style={{ fontSize: 16 }}>🚨</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: summary.total_violations > 0 ? '#ef4444' : 'var(--text-main)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {summary.total_violations}
            </div>
            <div style={{ fontSize: 11, color: summary.total_violations > 0 ? '#ef4444' : 'var(--text-muted)', marginTop: 2 }}>
              {summary.total_no_reply || 0} بدون رد • {summary.total_unanswered_inquiries || 0} أسئلة معلقة
            </div>
          </div>

          {/* Card 3: Compliant Resolves */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Compliant Resolves</span>
              <span style={{ fontSize: 16 }}>✅</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--badge-ready-text)', fontVariantNumeric: 'tabular-nums' }}>
                {summary.total_compliant}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
                ({summary.compliance_rate}%)
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              شاتات سليمة ومردود عليها أو إغلاق طبيعي
            </div>
          </div>

          {/* Card 4: Audited Agents */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '12px 14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Audited Sales Agents</span>
              <span style={{ fontSize: 16 }}>👥</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-main)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {(auditData?.agents || []).length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              موظف تعامل مع شاتات في هذا التاريخ
            </div>
          </div>
        </div>

        {/* Toolbar: Filters & Tab Switching */}
        <div style={{
          padding: '12px 22px',
          background: 'var(--bg-surface-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          {/* Left: View Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setActiveTab('violations')}
              style={{
                background: activeTab === 'violations' ? 'var(--primary)' : 'var(--bg-surface)',
                color: activeTab === 'violations' ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>🚨 Flagged Violations</span>
              <span style={{
                background: activeTab === 'violations' ? 'rgba(255,255,255,0.25)' : 'var(--badge-paused-bg)',
                color: activeTab === 'violations' ? '#fff' : 'var(--badge-paused-text)',
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 900
              }}>
                {(auditData?.all_violations || []).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agents')}
              style={{
                background: activeTab === 'agents' ? 'var(--primary)' : 'var(--bg-surface)',
                color: activeTab === 'agents' ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>👥 Agents Breakdown</span>
              <span style={{
                background: activeTab === 'agents' ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface-elevated)',
                color: activeTab === 'agents' ? '#fff' : 'var(--text-muted)',
                padding: '1px 6px',
                borderRadius: 10,
                fontSize: 11
              }}>
                {(auditData?.agents || []).length}
              </span>
            </button>
          </div>

          {/* Right: Controls & Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Show Only Violations Switch Button */}
            <button
              type="button"
              onClick={() => setShowOnlyViolations(prev => !prev)}
              style={{
                background: showOnlyViolations ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
                border: showOnlyViolations ? '1px solid #ef4444' : '1px solid var(--border-subtle)',
                color: showOnlyViolations ? '#ef4444' : 'var(--text-main)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
              title="إظهار الموظفين والشاتات المخالفة فقط"
            >
              <span>{showOnlyViolations ? '🎯' : '👁️'}</span>
              <span>{showOnlyViolations ? 'Showing Violations Only' : 'Show Only Violations'}</span>
            </button>

            {/* Agent Filter Selector */}
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              <option value="ALL">👥 All Sales Agents</option>
              {(auditData?.agents || []).map(a => (
                <option key={a.agent_id} value={a.agent_id}>
                  {a.agent_name} ({a.total_violations > 0 ? `🚨 ${a.total_violations}` : '✅ 0'})
                </option>
              ))}
            </select>

            {/* Search Input */}
            <input
              type="text"
              placeholder="Search chat ID, name, message..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                width: 200,
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Modal Body / Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading && !auditData ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1.2s linear infinite' }}>⏳</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                جاري فحص وتدقيق شاتات تاريخ ({selectedDate}) مباشرة من شات ووت...
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                يتم فحص حالة الردود، كشف الأسئلة المعلقة، ورصد الشاتات المحلولة بدون رد بدقة
              </div>
            </div>
          ) : fetchError ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>
              <div style={{ fontSize: 32 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{fetchError}</div>
              <button
                type="button"
                onClick={() => loadAudit(selectedDate, selectedSource, true)}
                style={{
                  marginTop: 12,
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 16px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                إعادة المحاولة
              </button>
            </div>
          ) : activeTab === 'violations' ? (
            /* Tab 1: Violations Queue */
            <div>
              {filteredViolations.length === 0 ? (
                <div style={{
                  padding: '50px 20px',
                  textAlign: 'center',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 12,
                  border: '1px dashed var(--border-subtle)'
                }}>
                  <div style={{ fontSize: 36 }}>🎉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 10, color: 'var(--badge-ready-text)' }}>
                    لا توجد أي شاتات مخالفة مرصودة لتاريخ ({selectedDate})!
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    جميع الشاتات المحلولة تم الرد عليها بشكل سليم، أو أُغلقت برسائل شكر وتأكيد طبيعية من العملاء.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                    تم رصد <strong>{filteredViolations.length}</strong> شات يستوجب المراجعة لتاريخ ({selectedDate}):
                  </div>

                  {filteredViolations.map((v) => {
                    const isNoReply = v.classification === 'no_reply';
                    const badgeBg = isNoReply ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)';
                    const badgeBorder = isNoReply ? 'rgba(239, 68, 68, 0.4)' : 'rgba(245, 158, 11, 0.4)';
                    const badgeColor = isNoReply ? '#ef4444' : '#f59e0b';

                    return (
                      <div
                        key={v.conv_id}
                        style={{
                          background: 'var(--bg-surface)',
                          border: `1px solid ${badgeBorder}`,
                          borderRadius: 12,
                          padding: '14px 18px',
                          boxShadow: 'var(--shadow-card)'
                        }}
                      >
                        {/* Card Header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 10,
                          borderBottom: '1px solid var(--border-subtle)',
                          paddingBottom: 10,
                          marginBottom: 10
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {/* Chat ID & Link */}
                            <a
                              href={v.chatwoot_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: 14,
                                fontWeight: 900,
                                color: 'var(--primary)',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title="فتح المحادثة في شات ووت بتبويب جديد"
                            >
                              <span>#{v.conv_id}</span>
                              <span style={{ fontSize: 11 }}>↗</span>
                            </a>

                            {/* Classification Badge */}
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: '3px 10px',
                              borderRadius: 6,
                              background: badgeBg,
                              border: `1px solid ${badgeBorder}`,
                              color: badgeColor
                            }}>
                              {v.classification_label || (isNoReply ? '🚨 بدون رد نهائياً' : '⚠️ سؤال معلق')}
                            </span>

                            {/* Label Tag */}
                            {v.label && (
                              <span style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)'
                              }}>
                                🏷️ {v.label}
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Assigned Agent */}
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                              👤 {v.agent_name}
                            </div>

                            {/* Quick Agent Check Button */}
                            <button
                              type="button"
                              onClick={() => handleSingleAgentCheck(v.agent_id)}
                              disabled={singleLoading[v.agent_id]}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                              title={`إعادة فحص وتحديث شاتات ${v.agent_name}`}
                            >
                              {singleLoading[v.agent_id] ? '⏳ Checking...' : '🔍 Check Agent'}
                            </button>

                            {/* Time */}
                            {v.assigned_at && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {v.assigned_at.slice(11, 16)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Customer & Message Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 2fr', gap: 14 }}>
                          {/* Client Info */}
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <div><strong>العميل:</strong> {v.sender_name || 'غير معروف'}</div>
                            {v.sender_phone && (
                              <div style={{ marginTop: 2 }}>
                                <strong>الهاتف:</strong>{' '}
                                <span style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                  {v.sender_phone}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Last Message Quote Box */}
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700 }}>
                              {isNoReply ? 'حالة الشات:' : 'آخر رسالة من العميل قبل الإغلاق:'}
                            </div>
                            <div style={{
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 8,
                              padding: '8px 12px',
                              fontSize: 13,
                              color: isNoReply ? 'var(--text-muted)' : 'var(--text-main)',
                              fontStyle: isNoReply ? 'italic' : 'normal',
                              lineHeight: 1.5
                            }}>
                              {isNoReply ? (
                                '⚠️ العميل لم يتلق أي رد من الموظف، وتم تغيير حالة الشات إلى Resolved مباشرة!'
                              ) : (
                                `« ${v.last_content || 'رسالة فارغة'} »`
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Tab 2: Agents Breakdown Table */
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 12,
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 800 }}>Employee</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 800 }}>Resolved Handled</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 800 }}>Violations</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 800 }}>Compliant</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 800 }}>Compliance Rate</th>
                    <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 800 }}>Single Quick Check</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        لا توجد بيانات تطابق الفلتر الحالي لتاريخ ({selectedDate})
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map(ag => {
                      const hasViolations = (ag.total_violations || 0) > 0;
                      const isChecking = Boolean(singleLoading[ag.agent_id]);

                      return (
                        <tr
                          key={ag.agent_id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                            background: hasViolations ? 'rgba(239, 68, 68, 0.03)' : 'transparent'
                          }}
                        >
                          {/* Employee */}
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-main)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span>👤</span>
                              <span>{ag.agent_name}</span>
                            </div>
                          </td>

                          {/* Resolved Handled */}
                          <td style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 800, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
                            {ag.total_resolved || ag.total_routed || 0}
                          </td>

                          {/* Violations */}
                          <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                            {hasViolations ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedAgentId(ag.agent_id);
                                  setActiveTab('violations');
                                }}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  color: '#ef4444',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  fontSize: 12
                                }}
                                title="عرض الشاتات المخالفة لهذا الموظف"
                              >
                                🚨 {ag.total_violations}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--badge-ready-text)', fontWeight: 800 }}>
                                ✅ 0
                              </span>
                            )}
                          </td>

                          {/* Compliant */}
                          <td style={{ textAlign: 'center', padding: '12px 14px', color: 'var(--badge-ready-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {ag.properly_resolved_count || 0}
                          </td>

                          {/* Compliance Rate */}
                          <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                            <span style={{
                              fontWeight: 900,
                              fontSize: 12,
                              color: ag.compliance_rate >= 90 ? 'var(--badge-ready-text)' : ag.compliance_rate >= 70 ? '#f59e0b' : '#ef4444'
                            }}>
                              {ag.compliance_rate || 100}%
                            </span>
                          </td>

                          {/* Single Agent Quick Check */}
                          <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                            <button
                              type="button"
                              onClick={() => handleSingleAgentCheck(ag.agent_id)}
                              disabled={isChecking}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-main)',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isChecking ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                              title={`فحص شاتات ${ag.agent_name} لهذا التاريخ`}
                            >
                              <span>{isChecking ? '⏳' : '🔍'}</span>
                              <span>{isChecking ? 'Checking...' : 'Check'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
