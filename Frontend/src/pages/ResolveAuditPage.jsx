import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { agentsApi } from '../api/agents';
import { C } from '../styles';

const getTodayStr = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};

const getYesterdayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

export default function ResolveAuditPage() {
  // Date Range & Source state
  const [startDate, setStartDate] = useState(() => getTodayStr());
  const [endDate, setEndDate] = useState(() => getTodayStr());
  const [selectedSource, setSelectedSource] = useState('chatwoot'); // 'chatwoot' | 'system'

  // Audit data state
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [singleLoading, setSingleLoading] = useState({});
  const [fetchError, setFetchError] = useState(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // Tab & Filters
  const [activeTab, setActiveTab] = useState('agents'); // 'agents' | 'violations' | 'after_shift'
  const [showOnlyViolations, setShowOnlyViolations] = useState(false);
  const [showOnlyAfterShift, setShowOnlyAfterShift] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [coordinatorFilter, setCoordinatorFilter] = useState('ALL');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [sortField, setSortField] = useState('violations'); // 'violations' | 'after_shift' | 'resolved' | 'routed' | 'compliance' | 'name'
  const [sortOrder, setSortOrder] = useState('desc');

  // Inspect Single Agent Drawer/Modal
  const [inspectAgent, setInspectAgent] = useState(null);
  const [inspectFilter, setInspectFilter] = useState('all'); // 'all' | 'violations' | 'after_shift'

  // Load audit data
  const loadAudit = useCallback(async (startD, endD, targetSource, force = false) => {
    const sD = startD || startDate;
    const eD = endD || endDate;
    const s = targetSource || selectedSource;
    if (force) setRefreshing(true);
    else setLoading(true);
    setFetchError(null);

    try {
      const res = await agentsApi.getResolveAudit({
        startDate: sD,
        endDate: eD,
        source: s,
        forceRefresh: force
      });
      if (res?.success && res.data) {
        setAuditData(res.data);
      } else {
        setFetchError('تعذر جلب بيانات التقرير');
      }
    } catch (err) {
      console.error('Audit fetch error:', err);
      setFetchError(err.message || 'فشل الاتصال بالسيرفر أثناء فحص الشاتات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate, selectedSource]);

  // Initial load
  useEffect(() => {
    loadAudit(startDate, endDate, selectedSource, false);
  }, [loadAudit]);

  // Date selection presets
  const handlePresetRange = (preset) => {
    const today = getTodayStr();
    const yesterday = getYesterdayStr();
    let sD = today;
    let eD = today;
    if (preset === 'today') {
      sD = today;
      eD = today;
    } else if (preset === 'yesterday') {
      sD = yesterday;
      eD = yesterday;
    } else if (preset === '2days') {
      sD = yesterday;
      eD = today;
    }
    setStartDate(sD);
    setEndDate(eD);
    loadAudit(sD, eD, selectedSource, false);
  };

  const handleCustomDateSubmit = (e) => {
    if (e) e.preventDefault();
    loadAudit(startDate, endDate, selectedSource, false);
  };

  const handleSourceChange = (newSource) => {
    setSelectedSource(newSource);
    loadAudit(startDate, endDate, newSource, false);
  };

  // Single Agent Quick Check
  const handleSingleAgentCheck = async (agId) => {
    setSingleLoading(prev => ({ ...prev, [agId]: true }));
    try {
      const res = await agentsApi.getResolveAudit({
        agentId: agId,
        startDate: startDate,
        endDate: endDate,
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

          const otherAfterShift = (prev.all_after_shift || []).filter(v => v.agent_id !== agId);
          const newAfterShift = [...otherAfterShift, ...(res.data.all_after_shift || [])].sort(
            (a, b) => (b.assigned_at || '').localeCompare(a.assigned_at || '')
          );

          const totRouted = newAgents.reduce((s, a) => s + (a.total_routed || 0), 0);
          const totResolved = newAgents.reduce((s, a) => s + (a.total_resolved || 0), 0);
          const totOpen = newAgents.reduce((s, a) => s + (a.total_open || 0), 0);
          const totViol = newAgents.reduce((s, a) => s + (a.total_violations || 0), 0);
          const totAfterShift = newAgents.reduce((s, a) => s + (a.after_shift_resolves_count || 0), 0);
          const totCompliant = newAgents.reduce((s, a) => s + (a.properly_resolved_count || 0), 0);

          return {
            ...prev,
            summary: {
              ...prev.summary,
              total_routed: totRouted,
              total_resolved: totResolved,
              total_open: totOpen,
              total_violations: totViol,
              total_after_shift_resolves: totAfterShift,
              total_compliant: totCompliant,
              resolution_rate: totRouted > 0 ? Number(((totResolved / totRouted) * 100).toFixed(1)) : 0,
              compliance_rate: totResolved > 0 ? Number(((totCompliant / totResolved) * 100).toFixed(1)) : 100,
            },
            agents: newAgents,
            all_violations: newViolations,
            all_after_shift: newAfterShift
          };
        });

        // Also update inspectAgent if currently open
        if (inspectAgent && inspectAgent.agent_id === agId) {
          const freshAgent = (res.data.agents || [])[0];
          if (freshAgent) setInspectAgent(freshAgent);
        }
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

    let text = `📊 تقرير الريسولف وجودة الشاتات (Resolve & Quality Audit)\n`;
    text += `📅 التاريخ: ${summary.date || (startDate === endDate ? startDate : `${startDate} إلى ${endDate}`)} | المصدر: ${selectedSource === 'chatwoot' ? 'شات ووت مباشرة (Chatwoot Direct)' : 'سجل السيستم (System Log)'}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📥 إجمالي الشاتات: ${summary.total_routed || 0}\n`;
    text += `✅ الشاتات المحلولة: ${summary.total_resolved || 0} (${summary.resolution_rate || 0}%)\n`;
    text += `⏳ المتبقي مفتوح: ${summary.total_open || 0}\n`;
    text += `🚨 إجمالي المخالفات: ${summary.total_violations || 0}\n`;
    text += `⚠️ حل بعد انتهاء الشيفت: ${summary.total_after_shift_resolves || 0}\n`;
    text += `🛡️ نسبة الالتزام والجودة: ${summary.compliance_rate || 100}%\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `👥 تفاصيل الموظفين (كان عنده كام / ريسولف كام):\n`;
    (auditData.agents || []).forEach(ag => {
      text += `• ${ag.agent_name} [${ag.coordinator || '—'} - ${ag.shift || '—'}]: إجمالي: ${ag.total_routed} | ريسولف: ${ag.total_resolved} (${ag.resolution_rate}%) | بعد الشيفت: ${ag.after_shift_resolves_count || 0} | مخالفات: ${ag.total_violations}\n`;
    });

    if (violations.length > 0) {
      text += `\n🚨 تفاصيل الشاتات المخالفة المرصودة (${violations.length}):\n`;
      violations.forEach((v, idx) => {
        text += `${idx + 1}. [${v.agent_name}] شات #${v.conv_id}\n`;
        text += `   - المخالفة: ${v.classification_label || ''}\n`;
        if (v.last_content) text += `   - آخر رسالة: "${v.last_content}"\n`;
        if (v.sender_phone) text += `   - العميل: ${v.sender_name || 'غير معروف'} (${v.sender_phone})\n`;
        text += `   - الرابط: ${v.chatwoot_url || ''}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 3000);
    });
  };

  // Distinct Coordinators & Shifts for Filter Dropdowns
  const uniqueCoordinators = useMemo(() => {
    if (!auditData?.agents) return [];
    const set = new Set();
    auditData.agents.forEach(a => {
      const c = a.coordinator || a.coordinator_name;
      if (c && c !== '—') set.add(c);
    });
    return Array.from(set).sort();
  }, [auditData]);

  const uniqueShifts = useMemo(() => {
    if (!auditData?.agents) return [];
    const set = new Set();
    auditData.agents.forEach(a => {
      const s = a.shift || a.shift_text;
      if (s && s !== '—') set.add(s);
    });
    return Array.from(set).sort();
  }, [auditData]);

  // Filtered & Sorted Agents
  const filteredAgents = useMemo(() => {
    let list = auditData?.agents || [];

    if (showOnlyViolations) {
      list = list.filter(a => (a.total_violations || 0) > 0);
    }

    if (showOnlyAfterShift) {
      list = list.filter(a => (a.after_shift_resolves_count || 0) > 0);
    }

    if (coordinatorFilter !== 'ALL') {
      list = list.filter(a => (a.coordinator === coordinatorFilter || a.coordinator_name === coordinatorFilter));
    }

    if (shiftFilter !== 'ALL') {
      list = list.filter(a => (a.shift === shiftFilter || a.shift_text === shiftFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(a =>
        (a.agent_name || '').toLowerCase().includes(q) ||
        (a.crm_name || '').toLowerCase().includes(q) ||
        (a.coordinator || '').toLowerCase().includes(q) ||
        (a.coordinator_name || '').toLowerCase().includes(q) ||
        (a.shift || '').toLowerCase().includes(q) ||
        (a.shift_text || '').toLowerCase().includes(q) ||
        String(a.agent_id || '').includes(q)
      );
    }

    return [...list].sort((a, b) => {
      let valA, valB;
      if (sortField === 'violations') {
        valA = a.total_violations || 0;
        valB = b.total_violations || 0;
      } else if (sortField === 'after_shift') {
        valA = a.after_shift_resolves_count || 0;
        valB = b.after_shift_resolves_count || 0;
      } else if (sortField === 'resolved') {
        valA = a.total_resolved || 0;
        valB = b.total_resolved || 0;
      } else if (sortField === 'routed') {
        valA = a.total_routed || 0;
        valB = b.total_routed || 0;
      } else if (sortField === 'compliance') {
        valA = a.compliance_rate || 0;
        valB = b.compliance_rate || 0;
      } else if (sortField === 'name') {
        valA = a.agent_name || '';
        valB = b.agent_name || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });
  }, [auditData, showOnlyViolations, showOnlyAfterShift, coordinatorFilter, shiftFilter, searchQuery, sortField, sortOrder]);

  // Filtered Violations
  const filteredViolations = useMemo(() => {
    let list = auditData?.all_violations || [];

    if (coordinatorFilter !== 'ALL') {
      list = list.filter(v => (v.coordinator === coordinatorFilter || v.coordinator_name === coordinatorFilter));
    }

    if (shiftFilter !== 'ALL') {
      list = list.filter(v => (v.shift === shiftFilter || v.shift_text === shiftFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(v =>
        String(v.conv_id || '').includes(q) ||
        (v.agent_name || '').toLowerCase().includes(q) ||
        (v.coordinator || '').toLowerCase().includes(q) ||
        (v.shift || '').toLowerCase().includes(q) ||
        (v.sender_name || '').toLowerCase().includes(q) ||
        (v.sender_phone || '').includes(q) ||
        (v.last_content || '').toLowerCase().includes(q) ||
        (v.classification_label || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [auditData, coordinatorFilter, shiftFilter, searchQuery]);

  // Filtered After-Shift Chats
  const filteredAfterShift = useMemo(() => {
    let list = auditData?.all_after_shift || [];

    if (coordinatorFilter !== 'ALL') {
      list = list.filter(v => (v.coordinator === coordinatorFilter || v.coordinator_name === coordinatorFilter));
    }

    if (shiftFilter !== 'ALL') {
      list = list.filter(v => (v.shift === shiftFilter || v.shift_text === shiftFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(v =>
        String(v.conv_id || '').includes(q) ||
        (v.agent_name || '').toLowerCase().includes(q) ||
        (v.coordinator || '').toLowerCase().includes(q) ||
        (v.shift || '').toLowerCase().includes(q) ||
        (v.sender_name || '').toLowerCase().includes(q) ||
        (v.sender_phone || '').includes(q) ||
        (v.last_content || '').toLowerCase().includes(q) ||
        (v.after_shift_desc || '').toLowerCase().includes(q) ||
        (v.classification_label || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [auditData, coordinatorFilter, shiftFilter, searchQuery]);

  const summary = auditData?.summary || {
    total_routed: 0,
    total_resolved: 0,
    total_open: 0,
    total_violations: 0,
    total_after_shift_resolves: 0,
    total_compliant: 0,
    resolution_rate: 0,
    compliance_rate: 100,
    audited_at: ''
  };

  const todayStr = getTodayStr();
  const yesterdayStr = getYesterdayStr();
  const isToday = startDate === todayStr && endDate === todayStr;
  const isYesterday = startDate === yesterdayStr && endDate === yesterdayStr;
  const isTwoDays = startDate === yesterdayStr && endDate === todayStr;
  const isRange = startDate !== endDate;
  const dateDisplay = summary.date || (isRange ? `${startDate} إلى ${endDate}` : startDate);

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '24px 20px', direction: 'rtl', color: 'var(--text-main)' }}>
      {/* ─── Top Header ─── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'var(--primary-bg)',
            border: '1px solid var(--primary-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24
          }}>
            🎯
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-main)', margin: 0 }}>
                تقرير الريسولف وجودة الشاتات
              </h1>
              <span style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 20,
                background: selectedSource === 'chatwoot' ? 'var(--primary-bg)' : 'var(--badge-paused-bg)',
                border: `1px solid ${selectedSource === 'chatwoot' ? 'var(--primary-border)' : 'var(--badge-paused-border)'}`,
                color: selectedSource === 'chatwoot' ? 'var(--primary)' : 'var(--badge-paused-text)',
                fontWeight: 800
              }}>
                {selectedSource === 'chatwoot' ? '🌐 فحص شات ووت مباشرة (Live)' : '⚡ سجل السيستم (Local)'}
              </span>
              {summary.audited_at && (
                <span style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)'
                }}>
                  🕒 آخر فحص: {summary.audited_at}
                </span>
              )}
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              متابعة إنجاز كل موظف: كم شات كان عنده وكم ريسولف عمل، مع كشف الشاتات المحلولة بدون رد والأسئلة المعلقة
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Copy Report */}
          <button
            type="button"
            onClick={handleCopyReport}
            disabled={loading || !auditData}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s'
            }}
            title="نسخ ملخص تقرير الموظفين والمخالفات للحافظة"
          >
            <span>{copiedNotification ? '✅' : '📋'}</span>
            <span>{copiedNotification ? 'تم النسخ بنجاح!' : 'نسخ ملخص التقرير'}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => loadAudit(startDate, endDate, selectedSource, true)}
            disabled={loading || refreshing}
            style={{
              background: 'var(--primary)',
              border: 'none',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: (loading || refreshing) ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}
            title="إعادة فحص الشاتات للفترة المحددة وتحديث كافة البيانات"
          >
            <span style={{ display: 'inline-block', animation: (loading || refreshing) ? 'spin 1s linear infinite' : 'none' }}>
              🔄
            </span>
            <span>{(loading || refreshing) ? 'جاري الفحص من شات ووت...' : 'فحص وتحديث كامل'}</span>
          </button>
        </div>
      </div>

      {/* ─── Control Bar: Date Selector & Source ─── */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14
      }}>
        {/* Date Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>
            📅 فترة الفحص:
          </span>

          {/* Preset: Today */}
          <button
            type="button"
            onClick={() => handlePresetRange('today')}
            style={{
              background: isToday ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: isToday ? '#fff' : 'var(--text-main)',
              border: `1px solid ${isToday ? 'var(--primary)' : 'var(--border-subtle)'}`,
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            اليوم ({todayStr.slice(5)})
          </button>

          {/* Preset: Yesterday */}
          <button
            type="button"
            onClick={() => handlePresetRange('yesterday')}
            style={{
              background: isYesterday ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: isYesterday ? '#fff' : 'var(--text-main)',
              border: `1px solid ${isYesterday ? 'var(--primary)' : 'var(--border-subtle)'}`,
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            أمس - يوم 30 ({yesterdayStr.slice(5)})
          </button>

          {/* Preset: Last 2 Days */}
          <button
            type="button"
            onClick={() => handlePresetRange('2days')}
            style={{
              background: isTwoDays ? 'var(--primary)' : 'var(--bg-surface-elevated)',
              color: isTwoDays ? '#fff' : 'var(--text-main)',
              border: `1px solid ${isTwoDays ? 'var(--primary)' : 'var(--border-subtle)'}`,
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
          >
            <span>📆</span>
            <span>آخر يومين (يوم 30 و 1 مع بعض)</span>
          </button>

          {/* Custom Date Range Inputs */}
          <form onSubmit={handleCustomDateSubmit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '5px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer'
              }}
              title="تطبيق نطاق التاريخ المخصص"
            >
              🔍 تطبيق
            </button>
          </form>
        </div>

        {/* Source Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)' }}>
            مصدر البيانات:
          </span>
          <div style={{
            display: 'flex',
            background: 'var(--bg-surface-elevated)',
            borderRadius: 8,
            padding: 3,
            border: '1px solid var(--border-subtle)'
          }}>
            <button
              type="button"
              onClick={() => handleSourceChange('chatwoot')}
              style={{
                background: selectedSource === 'chatwoot' ? 'var(--primary)' : 'transparent',
                color: selectedSource === 'chatwoot' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              title="جلب وفحص جميع شاتات السيلز المحلولة في شات ووت لهذا اليوم"
            >
              🌐 شات ووت مباشرة (Chatwoot Direct)
            </button>
            <button
              type="button"
              onClick={() => handleSourceChange('system')}
              style={{
                background: selectedSource === 'system' ? 'var(--primary)' : 'transparent',
                color: selectedSource === 'system' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '5px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              title="فحص الشاتات الموزعة المسجلة في سجل راوتر السيستم"
            >
              ⚡ سجل السيستم (System Log)
            </button>
          </div>
        </div>
      </div>

      {/* ─── Top KPI Statistics Bar ─── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
        marginBottom: 20
      }}>
        {/* KPI 1: Total Chats (كان عنده كام شات؟) */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: '16px 18px',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
              كان عنده كام شات؟ (إجمالي الموزع)
            </span>
            <span style={{ fontSize: 18 }}>📥</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-main)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {summary.total_routed || 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            إجمالي الشاتات التي تعامل معها الفريق في {dateDisplay}
          </div>
        </div>

        {/* KPI 2: Total Resolved (عمل ريسولف لـ كام؟) */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: '16px 18px',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
              عمل ريسولف لـ كام؟ (الشاتات المحلولة)
            </span>
            <span style={{ fontSize: 18 }}>✅</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--primary)', fontVariantNumeric: 'tabular-nums' }}>
              {summary.total_resolved || 0}
            </span>
            <span style={{
              fontSize: 12,
              fontWeight: 800,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'var(--primary-bg)',
              color: 'var(--primary)'
            }}>
              {summary.resolution_rate || 0}% إنجاز
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            من أصل {summary.total_routed || 0} شات مسند للفريق
          </div>
        </div>

        {/* KPI 3: Still Open / In Progress */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: '16px 18px',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
              متبقي قيد المتابعة (Open)
            </span>
            <span style={{ fontSize: 18 }}>⏳</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: summary.total_open > 0 ? 'var(--badge-paused-text)' : 'var(--text-main)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {summary.total_open || 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            شاتات ما زالت مفتوحة ولم يتم عمل ريسولف لها بعد
          </div>
        </div>

        {/* KPI 4: Violations Detected */}
        <div style={{
          background: summary.total_violations > 0 ? 'var(--badge-capped-bg)' : 'var(--bg-surface)',
          border: summary.total_violations > 0 ? '1px solid var(--badge-capped-border)' : '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: '16px 18px',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: summary.total_violations > 0 ? 'var(--badge-capped-text)' : 'var(--text-muted)', fontWeight: 800 }}>
              المخالفات المرصودة (Violations)
            </span>
            <span style={{ fontSize: 18 }}>🚨</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: summary.total_violations > 0 ? 'var(--badge-capped-text)' : 'var(--text-main)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
            {summary.total_violations || 0}
          </div>
          <div style={{ fontSize: 11, color: summary.total_violations > 0 ? 'var(--badge-capped-text)' : 'var(--text-muted)', marginTop: 4 }}>
            {summary.total_no_reply || 0} إغلاق بدون رد • {summary.total_unanswered_inquiries || 0} أسئلة معلقة
          </div>
        </div>

        {/* KPI 5: Off-Shift Resolves (حل بعد نهاية الشيفت) */}
        <div
          onClick={() => setActiveTab('after_shift')}
          style={{
            background: (summary.total_after_shift_resolves || 0) > 0 ? 'var(--badge-paused-bg)' : 'var(--bg-surface)',
            border: (summary.total_after_shift_resolves || 0) > 0 ? '1px solid var(--badge-paused-border)' : '1px solid var(--border-subtle)',
            borderRadius: 14,
            padding: '16px 18px',
            boxShadow: 'var(--shadow-card)',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
          title="اضغط لعرض كافة الشاتات التي حُلت بعد موعد انتهاء الشيفت"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: (summary.total_after_shift_resolves || 0) > 0 ? 'var(--badge-paused-text)' : 'var(--text-muted)', fontWeight: 800 }}>
              حل بعد موعد الشيفت (Off-Shift)
            </span>
            <span style={{ fontSize: 18 }}>🕒</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: (summary.total_after_shift_resolves || 0) > 0 ? 'var(--badge-paused-text)' : 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>
              {summary.total_after_shift_resolves || 0}
            </span>
            {(summary.total_after_shift_resolves || 0) > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--badge-paused-text)' }}>
                ⚠️ تنبيه
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: (summary.total_after_shift_resolves || 0) > 0 ? 'var(--badge-paused-text)' : 'var(--text-muted)', marginTop: 4 }}>
            تم حلها بعد نهاية الشيفت بساعة أو أكثر
          </div>
        </div>

        {/* KPI 6: Compliance & Quality Rate */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 14,
          padding: '16px 18px',
          boxShadow: 'var(--shadow-card)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 800 }}>
              نسبة الالتزام والجودة
            </span>
            <span style={{ fontSize: 18 }}>🛡️</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--badge-ready-text)', fontVariantNumeric: 'tabular-nums' }}>
              {summary.compliance_rate || 100}%
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              ({summary.total_compliant || 0} شات سليم)
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            شاتات تم الرد عليها بالكامل أو إغلاق طبيعي مستوفي
          </div>
        </div>
      </div>

      {/* ─── Main Tabs & Filtering Controls ─── */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        marginBottom: 16,
        overflow: 'hidden'
      }}>
        {/* Tabs Bar */}
        <div style={{
          padding: '12px 18px',
          background: 'var(--bg-surface-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          {/* Main View Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTab('agents')}
              style={{
                background: activeTab === 'agents' ? 'var(--primary)' : 'var(--bg-surface)',
                color: activeTab === 'agents' ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s'
              }}
            >
              <span>👥 إحصائيات الموظفين (كان عنده كام / ريسولف كام)</span>
              <span style={{
                background: activeTab === 'agents' ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface-elevated)',
                color: activeTab === 'agents' ? '#fff' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 900
              }}>
                {(auditData?.agents || []).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('violations')}
              style={{
                background: activeTab === 'violations' ? 'var(--primary)' : 'var(--bg-surface)',
                color: activeTab === 'violations' ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s'
              }}
            >
              <span>🚨 الشاتات المخالفة للمراجعة</span>
              <span style={{
                background: activeTab === 'violations' ? 'rgba(255,255,255,0.25)' : 'var(--badge-capped-bg)',
                color: activeTab === 'violations' ? '#fff' : 'var(--badge-capped-text)',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 900
              }}>
                {(auditData?.all_violations || []).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('after_shift')}
              style={{
                background: activeTab === 'after_shift' ? 'var(--badge-paused-text)' : 'var(--bg-surface)',
                color: activeTab === 'after_shift' ? '#fff' : 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.15s'
              }}
            >
              <span>⚠️ تم حلها بعد الشيفت (Off-Shift)</span>
              <span style={{
                background: activeTab === 'after_shift' ? 'rgba(255,255,255,0.25)' : 'var(--badge-paused-bg)',
                color: activeTab === 'after_shift' ? '#fff' : 'var(--badge-paused-text)',
                padding: '2px 8px',
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 900
              }}>
                {(auditData?.all_after_shift || []).length}
              </span>
            </button>
          </div>

          {/* Quick Filter Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setShowOnlyViolations(prev => !prev)}
              style={{
                background: showOnlyViolations ? 'var(--badge-capped-bg)' : 'var(--bg-surface)',
                border: `1px solid ${showOnlyViolations ? 'var(--badge-capped-border)' : 'var(--border-subtle)'}`,
                color: showOnlyViolations ? 'var(--badge-capped-text)' : 'var(--text-main)',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s'
              }}
              title="تصفية الجدول لإظهار الموظفين الذين لديهم مخالفات فقط"
            >
              <span>{showOnlyViolations ? '🚨' : '👁️'}</span>
              <span>{showOnlyViolations ? 'المخالفات فقط (مفعّل)' : 'المخالفات فقط'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowOnlyAfterShift(prev => !prev)}
              style={{
                background: showOnlyAfterShift ? 'var(--badge-paused-bg)' : 'var(--bg-surface)',
                border: `1px solid ${showOnlyAfterShift ? 'var(--badge-paused-border)' : 'var(--border-subtle)'}`,
                color: showOnlyAfterShift ? 'var(--badge-paused-text)' : 'var(--text-main)',
                padding: '7px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s'
              }}
              title="تصفية الجدول لإظهار الموظفين الذين قاموا بحل شاتات بعد نهاية الشيفت"
            >
              <span>{showOnlyAfterShift ? '⚠️' : '🕒'}</span>
              <span>{showOnlyAfterShift ? 'بعد الشيفت فقط (مفعّل)' : 'بعد الشيفت فقط'}</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div style={{
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          borderBottom: '1px solid var(--border-subtle)'
        }}>
          {/* Search Box */}
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 بحث باسم الموظف أو الكوردينيتور أو رقم الشات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: 12,
                outline: 'none'
              }}
            />
          </div>

          {/* Coordinator Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>الكوردينيتور:</span>
            <select
              value={coordinatorFilter}
              onChange={(e) => setCoordinatorFilter(e.target.value)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="ALL">كل الكوردينيتورز</option>
              {uniqueCoordinators.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Shift Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>الشيفت:</span>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="ALL">كل الشيفتات</option>
              {uniqueShifts.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {(searchQuery || coordinatorFilter !== 'ALL' || shiftFilter !== 'ALL' || showOnlyViolations) && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCoordinatorFilter('ALL');
                setShiftFilter('ALL');
                setShowOnlyViolations(false);
              }}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              مسح الفلاتر ✖
            </button>
          )}
        </div>

        {/* ─── Content Area ─── */}
        <div>
          {loading && !auditData ? (
            <div style={{ padding: '80px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 36, marginBottom: 16, animation: 'spin 1.2s linear infinite' }}>⏳</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>
                جاري تدقيق وفحص شاتات تاريخ ({dateDisplay}) مباشرة من شات ووت...
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                يتم فحص كل موظف: كم شات كان عنده وكم ريسولف عمل، مع كشف الشاتات المحلولة بدون رد والأسئلة المعلقة بدقة
              </div>
            </div>
          ) : fetchError ? (
            <div style={{ padding: '50px 20px', textAlign: 'center', color: 'var(--badge-capped-text)' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{fetchError}</div>
              <button
                type="button"
                onClick={() => loadAudit(startDate, endDate, selectedSource, true)}
                style={{
                  marginTop: 16,
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                إعادة المحاولة ↺
              </button>
            </div>
          ) : activeTab === 'agents' ? (
            /* ══════════════════════════════════════════════════════════════
               TAB 1: EMPLOYEE PERFORMANCE TABLE ("كان عنده كام / ريسولف كام")
               ══════════════════════════════════════════════════════════════ */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '2px solid var(--border-subtle)' }}>
                    <th
                      onClick={() => toggleSort('name')}
                      style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 800, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Employee / الموظف {sortField === 'name' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 800 }}>
                      Coordinator / الكوردينيتور
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 800 }}>
                      Shift / الشيفت
                    </th>
                    <th
                      onClick={() => toggleSort('routed')}
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontWeight: 900,
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: sortField === 'routed' ? 'var(--primary-bg)' : 'transparent'
                      }}
                      title="إجمالي الشاتات التي كانت لدى الموظف"
                    >
                      كان عنده كام شات؟ {sortField === 'routed' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th
                      onClick={() => toggleSort('resolved')}
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontWeight: 900,
                        color: 'var(--primary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: sortField === 'resolved' ? 'var(--primary-bg)' : 'transparent'
                      }}
                      title="كم شات قام الموظف بحله وعمل Resolve له"
                    >
                      عمل ريسولف لـ كام؟ {sortField === 'resolved' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 800 }}>
                      متبقي مفتوح (Open)
                    </th>
                    <th
                      onClick={() => toggleSort('violations')}
                      style={{
                        textAlign: 'center',
                        padding: '12px 16px',
                        fontWeight: 900,
                        color: 'var(--badge-capped-text)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: sortField === 'violations' ? 'var(--badge-capped-bg)' : 'transparent'
                      }}
                      title="عدد الشاتات التي أغلقت بدون رد أو تركت استفسار معلق للعميل"
                    >
                      المخالفات المرصودة {sortField === 'violations' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th
                      onClick={() => toggleSort('after_shift')}
                      style={{
                        textAlign: 'center',
                        padding: '12px 14px',
                        fontWeight: 900,
                        color: 'var(--badge-paused-text)',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: sortField === 'after_shift' ? 'var(--badge-paused-bg)' : 'transparent'
                      }}
                      title="عدد الشاتات التي تم حلها بعد نهاية موعد شيفت الموظف بساعة أو أكثر"
                    >
                      ⚠️ بعد الشيفت {sortField === 'after_shift' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th
                      onClick={() => toggleSort('compliance')}
                      style={{ textAlign: 'center', padding: '12px 14px', fontWeight: 800, cursor: 'pointer', userSelect: 'none' }}
                    >
                      نسبة الالتزام % {sortField === 'compliance' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 800 }}>
                      الإجراءات السريعة
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        لا توجد بيانات مطابقة للفلاتر المحددة للفترة ({summary.date || (startDate === endDate ? startDate : `${startDate} إلى ${endDate}`)})
                      </td>
                    </tr>
                  ) : (
                    filteredAgents.map(ag => {
                      const hasViolations = (ag.total_violations || 0) > 0;
                      const hasAfterShift = (ag.after_shift_resolves_count || 0) > 0;
                      const isChecking = Boolean(singleLoading[ag.agent_id]);
                      const resolutionPct = ag.resolution_rate || 0;

                      return (
                        <tr
                          key={ag.agent_id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                            background: hasViolations ? 'var(--badge-capped-bg)' : (hasAfterShift ? 'var(--badge-paused-bg)' : 'transparent'),
                            transition: 'background 0.15s'
                          }}
                        >
                          {/* Employee */}
                          <td style={{ padding: '14px 16px', fontWeight: 700 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: hasViolations ? 'var(--badge-capped-border)' : (hasAfterShift ? 'var(--badge-paused-border)' : 'var(--primary-bg)'),
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14
                              }}>
                                {hasViolations ? '🚨' : (hasAfterShift ? '⚠️' : '👤')}
                              </div>
                              <div>
                                <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: 13 }}>
                                  {ag.agent_name}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  ID: #{ag.agent_id} {ag.crm_name && ag.crm_name !== ag.agent_name && `• CRM: ${ag.crm_name}`}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Coordinator */}
                          <td style={{ textAlign: 'center', padding: '14px' }}>
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-subtle)',
                              fontWeight: 700,
                              color: 'var(--text-muted)'
                            }}>
                              {ag.coordinator || ag.coordinator_name || '—'}
                            </span>
                          </td>

                          {/* Shift */}
                          <td style={{ textAlign: 'center', padding: '14px' }}>
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-subtle)',
                              fontWeight: 700,
                              color: 'var(--text-muted)'
                            }}>
                              {ag.shift || ag.shift_text || '—'}
                            </span>
                          </td>

                          {/* كان عنده كام شات؟ (Total Chats) */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 46,
                              padding: '4px 10px',
                              borderRadius: 8,
                              background: 'var(--bg-surface-elevated)',
                              border: '1px solid var(--border-subtle)',
                              fontSize: 15,
                              fontWeight: 900,
                              color: 'var(--text-main)',
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {ag.total_routed || 0}
                            </div>
                          </td>

                          {/* عمل ريسولف لـ كام؟ (Resolved) */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 46,
                                padding: '4px 10px',
                                borderRadius: 8,
                                background: 'var(--primary-bg)',
                                border: '1px solid var(--primary-border)',
                                fontSize: 15,
                                fontWeight: 900,
                                color: 'var(--primary)',
                                fontVariantNumeric: 'tabular-nums'
                              }}>
                                {ag.total_resolved || 0}
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontWeight: 700 }}>
                                {resolutionPct}% تم الحل
                              </span>
                            </div>
                          </td>

                          {/* متبقي مفتوح (Open) */}
                          <td style={{ textAlign: 'center', padding: '14px' }}>
                            <span style={{
                              fontSize: 13,
                              fontWeight: 800,
                              color: (ag.total_open || 0) > 0 ? 'var(--badge-paused-text)' : 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {ag.total_open || 0}
                            </span>
                          </td>

                          {/* Violations */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            {hasViolations ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectAgent(ag);
                                  setInspectFilter('violations');
                                }}
                                style={{
                                  background: 'var(--badge-capped-bg)',
                                  border: '1px solid var(--badge-capped-border)',
                                  color: 'var(--badge-capped-text)',
                                  padding: '4px 10px',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                                title="اضغط لعرض الشاتات المخالفة لهذا الموظف"
                              >
                                <span>🚨</span>
                                <span>{ag.total_violations} مخالفات</span>
                              </button>
                            ) : (
                              <span style={{
                                background: 'var(--badge-ready-bg)',
                                border: '1px solid var(--badge-ready-border)',
                                color: 'var(--badge-ready-text)',
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800
                              }}>
                                ✅ 0 مخالفات
                              </span>
                            )}
                          </td>

                          {/* After Shift Resolves */}
                          <td style={{ textAlign: 'center', padding: '14px' }}>
                            {hasAfterShift ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectAgent(ag);
                                  setInspectFilter('after_shift');
                                }}
                                style={{
                                  background: 'var(--badge-paused-bg)',
                                  border: '1px solid var(--badge-paused-border)',
                                  color: 'var(--badge-paused-text)',
                                  padding: '4px 10px',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 900,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                                title="اضغط لعرض الشاتات التي تم حلها بعد نهاية الشيفت"
                              >
                                <span>⚠️</span>
                                <span>{ag.after_shift_resolves_count} بعد الشيفت</span>
                              </button>
                            ) : (
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>0</span>
                            )}
                          </td>

                          {/* Compliance Rate */}
                          <td style={{ textAlign: 'center', padding: '14px' }}>
                            <span style={{
                              fontWeight: 900,
                              fontSize: 13,
                              color: (ag.compliance_rate || 100) >= 95 ? 'var(--badge-ready-text)' : (ag.compliance_rate >= 80 ? 'var(--badge-paused-text)' : 'var(--badge-capped-text)')
                            }}>
                              {ag.compliance_rate !== undefined ? `${ag.compliance_rate}%` : '100%'}
                            </span>
                          </td>

                          {/* Quick Actions */}
                          <td style={{ textAlign: 'center', padding: '14px 16px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              {/* Inspect Agent Chats Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectAgent(ag);
                                  setInspectFilter('all');
                                }}
                                style={{
                                  background: 'var(--bg-surface-elevated)',
                                  border: '1px solid var(--border-subtle)',
                                  color: 'var(--text-main)',
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                                title={`عرض جميع شاتات ${ag.agent_name}`}
                              >
                                👁️ عرض الشاتات
                              </button>

                              {/* Single Agent Quick Check */}
                              <button
                                type="button"
                                onClick={() => handleSingleAgentCheck(ag.agent_id)}
                                disabled={isChecking}
                                style={{
                                  background: 'var(--primary-bg)',
                                  border: '1px solid var(--primary-border)',
                                  color: 'var(--primary)',
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  cursor: isChecking ? 'wait' : 'pointer'
                                }}
                                title={`إعادة فحص شاتات ${ag.agent_name} فقط من شات ووت`}
                              >
                                {isChecking ? '⏳' : '🔍 فحص سريع'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'violations' ? (
            /* ══════════════════════════════════════════════════════════════
               TAB 2: FLAGGED VIOLATIONS LIST ("الشاتات المخالفة للمراجعة")
               ══════════════════════════════════════════════════════════════ */
            <div style={{ padding: 18 }}>
              {filteredViolations.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 42, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--badge-ready-text)' }}>
                    لا توجد أي شاتات مخالفة مرصودة لهذا التاريخ!
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                    جميع الشاتات المحلولة تم الرد عليها بشكل سليم ومستوفي الشروط أو إغلاق طبيعي مستحق
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredViolations.map((v, idx) => {
                    const isNoReply = v.classification === 'no_reply';

                    return (
                      <div
                        key={v.conv_id || idx}
                        style={{
                          background: 'var(--bg-surface-elevated)',
                          border: '1px solid var(--badge-capped-border)',
                          borderRadius: 12,
                          padding: '14px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10
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
                          paddingBottom: 8
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {/* Chat ID Link */}
                            <a
                              href={v.chatwoot_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: 'var(--primary)',
                                fontWeight: 900,
                                textDecoration: 'none',
                                fontSize: 14,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>#{v.conv_id}</span>
                              <span style={{ fontSize: 12 }}>↗</span>
                            </a>

                            {/* Classification Badge */}
                            <span style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--badge-capped-bg)',
                              border: '1px solid var(--badge-capped-border)',
                              color: 'var(--badge-capped-text)',
                              fontWeight: 800
                            }}>
                              {v.classification_label || (isNoReply ? '🚨 بدون رد نهائياً' : '⚠️ سؤال معلق')}
                            </span>

                            {/* Label */}
                            {v.label && (
                              <span style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 6,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)'
                              }}>
                                🏷️ {v.label}
                              </span>
                            )}
                          </div>

                          {/* Agent Info & Quick Check */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                              👤 {v.agent_name}
                              {v.coordinator && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>({v.coordinator})</span>}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleSingleAgentCheck(v.agent_id)}
                              disabled={singleLoading[v.agent_id]}
                              style={{
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                                color: 'var(--text-muted)',
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                              title={`إعادة فحص وتدقيق شاتات ${v.agent_name}`}
                            >
                              {singleLoading[v.agent_id] ? '⏳ Checking...' : '🔍 فحص الموظف'}
                            </button>

                            {v.assigned_at && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {v.assigned_at.slice(11, 16)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Customer & Message Details */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 14 }}>
                          {/* Client Info */}
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            <div><strong>العميل:</strong> {v.sender_name || 'غير معروف'}</div>
                            {v.sender_phone && (
                              <div style={{ marginTop: 3 }}>
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
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 8,
                              padding: '8px 12px',
                              fontSize: 13,
                              color: isNoReply ? 'var(--badge-capped-text)' : 'var(--text-main)',
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
            /* ══════════════════════════════════════════════════════════════
               TAB 3: AFTER-SHIFT RESOLVED LIST ("شاتات حُلت بعد انتهاء الشيفت")
               ══════════════════════════════════════════════════════════════ */
            <div style={{ padding: 18 }}>
              {filteredAfterShift.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 42, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--badge-ready-text)' }}>
                    لا توجد أي شاتات تم حلها بعد مواعيد الشيفت لهذه الفترة!
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                    جميع عمليات الحل (Resolve) تمت خلال ساعات عمل الشيفات المقررة أو في نطاق التسامح المسموح
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filteredAfterShift.map((v, idx) => (
                    <div
                      key={v.conv_id || idx}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--badge-paused-border)',
                        borderRadius: 12,
                        padding: '14px 18px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10
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
                        paddingBottom: 8
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <a
                            href={v.chatwoot_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: 'var(--primary)',
                              fontWeight: 900,
                              textDecoration: 'none',
                              fontSize: 14,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <span>#{v.conv_id}</span>
                            <span style={{ fontSize: 12 }}>↗</span>
                          </a>

                          {/* Warning badge */}
                          <span style={{
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'var(--badge-paused-bg)',
                            border: '1px solid var(--badge-paused-border)',
                            color: 'var(--badge-paused-text)',
                            fontWeight: 800
                          }}>
                            ⚠️ {v.after_shift_desc || 'بعد الشيفت'}
                          </span>

                          {/* Resolved Time Badge */}
                          {v.resolved_time_str && (
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-main)',
                              fontWeight: 700
                            }}>
                              🕒 حُل الساعة: {v.resolved_time_str}
                            </span>
                          )}

                          {/* Label */}
                          {v.label && (
                            <span style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-muted)'
                            }}>
                              🏷️ {v.label}
                            </span>
                          )}
                        </div>

                        {/* Agent Info & Quick Check */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                            👤 {v.agent_name}
                            {(v.coordinator || v.coordinator_name) && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 6 }}>
                                [كوردينيتور: {v.coordinator || v.coordinator_name} • شيفت: {v.shift || v.shift_text || '—'}]
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleSingleAgentCheck(v.agent_id)}
                            disabled={singleLoading[v.agent_id]}
                            style={{
                              background: 'var(--bg-surface)',
                              border: '1px solid var(--border-subtle)',
                              color: 'var(--text-muted)',
                              padding: '3px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                            title={`إعادة فحص وتدقيق شاتات ${v.agent_name}`}
                          >
                            {singleLoading[v.agent_id] ? '⏳ Checking...' : '🔍 فحص الموظف'}
                          </button>
                        </div>
                      </div>

                      {/* Customer & Message Details */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) 2fr', gap: 14 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          <div><strong>العميل:</strong> {v.sender_name || 'غير معروف'}</div>
                          {v.sender_phone && (
                            <div style={{ marginTop: 3 }}>
                              <strong>الهاتف:</strong>{' '}
                              <span style={{ fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                {v.sender_phone}
                              </span>
                            </div>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 700 }}>
                            {v.classification_label || 'آخر رسالة:'}
                          </div>
                          <div style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 8,
                            padding: '8px 12px',
                            fontSize: 13,
                            color: 'var(--text-main)',
                            lineHeight: 1.5
                          }}>
                            « {v.last_content || 'رسالة فارغة'} »
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Inspect Agent Detail Modal / Drawer ─── */}
      {inspectAgent && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1200,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 16,
            width: '100%',
            maxWidth: 860,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card)',
            direction: 'rtl'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 22 }}>👤</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: 'var(--text-main)' }}>
                    تفاصيل شاتات الموظف: {inspectAgent.agent_name}
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    الكوردينيتور: {inspectAgent.coordinator || inspectAgent.coordinator_name || '—'} • الشيفت: {inspectAgent.shift || inspectAgent.shift_text || '—'} • التاريخ: {summary.date || (startDate === endDate ? startDate : `${startDate} إلى ${endDate}`)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => handleSingleAgentCheck(inspectAgent.agent_id)}
                  disabled={singleLoading[inspectAgent.agent_id]}
                  style={{
                    background: 'var(--primary-bg)',
                    border: '1px solid var(--primary-border)',
                    color: 'var(--primary)',
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: singleLoading[inspectAgent.agent_id] ? 'wait' : 'pointer'
                  }}
                >
                  {singleLoading[inspectAgent.agent_id] ? '⏳ جارِ الفحص...' : '🔄 فحص وتحديث'}
                </button>

                <button
                  type="button"
                  onClick={() => setInspectAgent(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: 20,
                    cursor: 'pointer',
                    padding: '4px 8px'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Quick Agent Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 10,
              padding: '12px 20px',
              background: 'var(--bg-surface)',
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>كان عنده كام شات؟</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-main)', marginTop: 2 }}>
                  {inspectAgent.total_routed || 0}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>عمل ريسولف لـ كام؟</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--primary)', marginTop: 2 }}>
                  {inspectAgent.total_resolved || 0}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>متبقي مفتوح</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: (inspectAgent.total_open || 0) > 0 ? 'var(--badge-paused-text)' : 'var(--text-main)', marginTop: 2 }}>
                  {inspectAgent.total_open || 0}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>المخالفات</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: (inspectAgent.total_violations || 0) > 0 ? 'var(--badge-capped-text)' : 'var(--badge-ready-text)', marginTop: 2 }}>
                  {inspectAgent.total_violations || 0}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>⚠️ بعد موعد الشيفت</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: (inspectAgent.after_shift_resolves_count || 0) > 0 ? 'var(--badge-paused-text)' : 'var(--text-main)', marginTop: 2 }}>
                  {inspectAgent.after_shift_resolves_count || 0}
                </div>
              </div>
            </div>

            {/* Modal Chats Filter */}
            <div style={{
              padding: '8px 20px',
              background: 'var(--bg-surface-elevated)',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              gap: 6
            }}>
              <button
                type="button"
                onClick={() => setInspectFilter('all')}
                style={{
                  background: inspectFilter === 'all' ? 'var(--primary)' : 'var(--bg-surface)',
                  color: inspectFilter === 'all' ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                كل الشاتات ({(inspectAgent.chats || []).length})
              </button>
              <button
                type="button"
                onClick={() => setInspectFilter('violations')}
                style={{
                  background: inspectFilter === 'violations' ? 'var(--badge-capped-text)' : 'var(--bg-surface)',
                  color: inspectFilter === 'violations' ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                المخالفات فقط ({inspectAgent.total_violations || 0})
              </button>
              <button
                type="button"
                onClick={() => setInspectFilter('after_shift')}
                style={{
                  background: inspectFilter === 'after_shift' ? 'var(--badge-paused-text)' : 'var(--bg-surface)',
                  color: inspectFilter === 'after_shift' ? '#fff' : 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⚠️ بعد الشيفت ({inspectAgent.after_shift_resolves_count || 0})
              </button>
            </div>

            {/* Chats List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {(inspectAgent.chats || []).length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  لا توجد تفاصيل شاتات مسجلة لهذا الموظف
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(inspectAgent.chats || [])
                    .filter(c => {
                      if (inspectFilter === 'violations') return c.is_violation;
                      if (inspectFilter === 'after_shift') return c.is_after_shift;
                      return true;
                    })
                    .map((ch, idx) => (
                      <div
                        key={ch.conv_id || idx}
                        style={{
                          background: ch.is_violation ? 'var(--badge-capped-bg)' : (ch.is_after_shift ? 'var(--badge-paused-bg)' : 'var(--bg-surface-elevated)'),
                          border: `1px solid ${ch.is_violation ? 'var(--badge-capped-border)' : (ch.is_after_shift ? 'var(--badge-paused-border)' : 'var(--border-subtle)')}`,
                          borderRadius: 10,
                          padding: '12px 14px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <a
                              href={ch.chatwoot_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: 'var(--primary)', fontWeight: 800, textDecoration: 'none', fontSize: 13 }}
                            >
                              #{ch.conv_id} ↗
                            </a>
                            <span style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: ch.is_violation ? 'var(--badge-capped-bg)' : 'var(--badge-ready-bg)',
                              color: ch.is_violation ? 'var(--badge-capped-text)' : 'var(--badge-ready-text)',
                              fontWeight: 700
                            }}>
                              {ch.classification_label || ch.status}
                            </span>
                            {ch.is_after_shift && (
                              <span style={{
                                fontSize: 11,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: 'var(--badge-paused-bg)',
                                color: 'var(--badge-paused-text)',
                                fontWeight: 800
                              }}>
                                ⚠️ {ch.after_shift_desc || 'بعد الشيفت'} {ch.resolved_time_str ? `(${ch.resolved_time_str})` : ''}
                              </span>
                            )}
                          </div>
                          {ch.assigned_at && (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {ch.assigned_at.slice(11, 16)}
                            </span>
                          )}
                        </div>

                        {ch.last_content && (
                          <div style={{
                            marginTop: 8,
                            fontSize: 12,
                            background: 'var(--bg-surface)',
                            padding: '6px 10px',
                            borderRadius: 6,
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-subtle)'
                          }}>
                            {ch.last_content}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
