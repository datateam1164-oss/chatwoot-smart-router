import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { agentsApi } from '../api/agents';
import { C } from '../styles';

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  // Filters & Controls
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all'); // 'all', 'Sales', 'Data'
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all', 'critical', 'warning', 'normal'
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' or 'agents'
  const [scanPages, setScanPages] = useState(6);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Unassign Single Chat Modal
  const [pullModalChat, setPullModalChat] = useState(null);
  const [pullingChat, setPullingChat] = useState(false);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadReport = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    setError(null);
    try {
      const data = await agentsApi.fetchDelaysReport(isManualRefresh, scanPages);
      if (data && data.success) {
        setReport(data);
        if (isManualRefresh) {
          showNotification('تم تحديث التقرير بنجاح', 'success');
        }
      } else {
        throw new Error('فشل جلب بيانات التقرير');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'حدث خطأ أثناء تحميل التقرير');
      if (isManualRefresh) {
        showNotification(err.message || 'فشل التحديث', 'error');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scanPages]);

  useEffect(() => {
    loadReport(false);
  }, [loadReport]);

  // Auto-refresh timer every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadReport(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadReport]);

  // Single Chat Unassign Handler
  const handleConfirmUnassign = async () => {
    if (!pullModalChat) return;
    setPullingChat(true);
    try {
      await agentsApi.unassignSingleChat(pullModalChat.conv_id, pullModalChat.agent_id);
      showNotification(`تم بنجاح سحب المحادثة #${pullModalChat.conv_id} وإعادتها لقائمة الانتظار`, 'success');
      setPullModalChat(null);
      // Reload report immediately to reflect changes
      loadReport(true);
    } catch (err) {
      showNotification(err.message || 'فشل سحب المحادثة', 'error');
    } finally {
      setPullingChat(false);
    }
  };

  // Copy Executive Report to Clipboard (WhatsApp / Management)
  const handleCopyReport = () => {
    if (!report) return;
    const s = report.summary || {};
    const pending = report.pending_chats || [];
    const agents = report.agents_summary || [];

    // Filter agents with pending chats
    const delayedAgents = agents.filter(a => (a.pending_count || 0) > 0).slice(0, 10);
    // Filter critical chats
    const criticalChats = pending.filter(c => c.severity === 'critical').slice(0, 10);

    let text = `📊 *تقرير تأخيرات الرد ومراقبة الأداء*\n`;
    text += `🕒 *الوقت:* ${s.timestamp || ''}\n`;
    text += `🔍 *نطاق الفحص:* فحص ${s.total_scanned_chats || 0} محادثة مفتوحة\n`;
    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚡ *الملخص العام:*\n`;
    text += `💬 إجمالي الشاتات المعلقة: *${s.total_pending_chats || 0}* محادثة\n`;
    text += `🚨 تأخير حرج (15+ دقيقة): *${s.critical_count || 0}*\n`;
    text += `⏳ تحذير تأخير (5-14 دقيقة): *${s.warning_count || 0}*\n`;
    text += `🟢 تأخير طبيعي (<5 دقيقة): *${s.normal_count || 0}*\n`;
    text += `🏃 أطول مدة انتظار: *${s.longest_delay_formatted || '0 د'}* (${s.most_delayed_agent || 'لا يوجد'})\n`;

    if (delayedAgents.length > 0) {
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `👥 *الموظفون الأكثر تأخراً في الرد:*\n`;
      delayedAgents.forEach((a, i) => {
        const flag = a.critical_count > 0 ? '🚨' : '⏳';
        text += `${i + 1}. *${a.agent_name}* (${a.team}) | ${a.pending_count} معلق | أقصى تأخير: ${a.max_delay_text} ${flag}\n`;
      });
    }

    if (criticalChats.length > 0) {
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🚨 *الشاتات الأكثر حرجاً (15+ دقيقة):*\n`;
      criticalChats.forEach(c => {
        const phone = c.customer_phone ? ` (${c.customer_phone})` : '';
        text += `• #${c.conv_id} | ${c.agent_name} | عميل: ${c.customer_name}${phone} | انتظار: ${c.waiting_since_text}\n`;
      });
    }

    text += `━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 تم الاستخراج آلياً عبر نظام التوزيع والمراقبة`;

    const copyFallback = () => {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('📋 تم نسخ التقرير بنجاح! جاهز للصق في واتساب أو أي مكان', 'success');
      } catch (e) {
        showNotification('تعذر النسخ التلقائي', 'error');
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showNotification('📋 تم نسخ التقرير بنجاح! جاهز للصق في واتساب أو أي مكان', 'success');
      }).catch(copyFallback);
    } else {
      copyFallback();
    }
  };

  // Filtered Pending Chats
  const filteredChats = useMemo(() => {
    if (!report || !report.pending_chats) return [];
    return report.pending_chats.filter(c => {
      // Team filter
      if (teamFilter !== 'all' && c.team !== teamFilter) return false;
      // Severity filter
      if (severityFilter !== 'all' && c.severity !== severityFilter) return false;
      // Search text
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchId = String(c.conv_id).toLowerCase().includes(q);
        const matchAgent = (c.agent_name || '').toLowerCase().includes(q);
        const matchCrm = (c.crm_name || '').toLowerCase().includes(q);
        const matchCustomer = (c.customer_name || '').toLowerCase().includes(q);
        const matchPhone = (c.customer_phone || '').toLowerCase().includes(q);
        const matchMsg = (c.last_message || '').toLowerCase().includes(q);
        if (!matchId && !matchAgent && !matchCrm && !matchCustomer && !matchPhone && !matchMsg) {
          return false;
        }
      }
      return true;
    });
  }, [report, teamFilter, severityFilter, search]);

  // Filtered Agents Summary
  const filteredAgents = useMemo(() => {
    if (!report || !report.agents_summary) return [];
    return report.agents_summary.filter(a => {
      if (teamFilter !== 'all' && a.team !== teamFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matchName = (a.agent_name || '').toLowerCase().includes(q);
        const matchCrm = (a.crm_name || '').toLowerCase().includes(q);
        if (!matchName && !matchCrm) return false;
      }
      return true;
    });
  }, [report, teamFilter, search]);

  const summary = report?.summary || {
    total_scanned_chats: 0,
    total_pending_chats: 0,
    critical_count: 0,
    warning_count: 0,
    normal_count: 0,
    longest_delay_formatted: '0 دقيقة',
    most_delayed_agent: 'لا يوجد',
    timestamp: '—',
    fetch_duration_seconds: 0
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 60 }}>
      {/* ── Toast Notification ── */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          padding: '12px 24px',
          borderRadius: 12,
          background: notification.type === 'error' ? 'rgba(239,68,68,0.95)' : 'rgba(16,185,129,0.95)',
          color: '#fff',
          fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          backdropFilter: 'blur(8px)',
          animation: 'fadeIn 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}>
          <span>{notification.type === 'error' ? '❌' : '✅'}</span>
          <span>{notification.msg}</span>
        </div>
      )}

      {/* ── Page Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 24,
        paddingBottom: 20,
        borderBottom: `1px solid ${C.border}`
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28 }}>⏱️</span>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.textBright }}>تقرير تأخيرات الرد ومراقبة الأداء</h1>
            <span style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(56,189,248,0.15)',
              color: C.accent,
              border: `1px solid ${C.accentBorder}`,
              fontWeight: 700
            }}>
              LIVE
            </span>
          </div>
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>
            مراقبة زمن استجابة الموظفين لاكتشاف الشاتات المتأخرة والتدخل السريع بدون أي تأثير على سرعة التوزيع
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Scan Range Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.bgLight, padding: '4px 10px', borderRadius: 10, border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 12, color: C.textDim }}>نطاق الفحص:</span>
            <select
              value={scanPages}
              onChange={(e) => setScanPages(Number(e.target.value))}
              disabled={refreshing || loading}
              style={{
                background: 'transparent',
                border: 'none',
                color: C.textBright,
                fontSize: 12,
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value={6} style={{ background: C.bgLight, color: C.text }}>150 شات (6 صفحات - سريع)</option>
              <option value={12} style={{ background: C.bgLight, color: C.text }}>300 شات (12 صفحة)</option>
              <option value={24} style={{ background: C.bgLight, color: C.text }}>600 شات (24 صفحة)</option>
              <option value={48} style={{ background: C.bgLight, color: C.text }}>1200 شات (48 صفحة)</option>
              <option value={75} style={{ background: C.bgLight, color: C.text }}>🌟 شاتات اليوم كله (حتى 1800+ شات)</option>
            </select>
          </div>

          {/* Copy Report for WhatsApp / Management */}
          <button
            onClick={handleCopyReport}
            disabled={!report || loading || refreshing}
            className="btn btn-ghost"
            style={{
              background: 'rgba(56,189,248,0.12)',
              color: C.accent,
              border: `1px solid ${C.accentBorder}`,
              fontWeight: 700,
              fontSize: 13,
              padding: '7px 16px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: (!report || loading || refreshing) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: (!report || loading || refreshing) ? 0.6 : 1
            }}
            title="نسخ تقرير نصي شامل ومنظم للمشاركة على واتساب أو إرساله للمشرفين"
          >
            <span style={{ fontSize: 16 }}>📋</span>
            <span>نسخ تقرير (واتساب/إدارة)</span>
          </button>

          {/* Auto Refresh Toggle */}
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: autoRefresh ? C.accent : C.textMuted,
            cursor: 'pointer',
            userSelect: 'none',
            background: autoRefresh ? 'rgba(56,189,248,0.1)' : C.bgLight,
            padding: '7px 12px',
            borderRadius: 10,
            border: `1px solid ${autoRefresh ? C.accentBorder : C.border}`,
            transition: 'all 0.2s ease'
          }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ accentColor: C.accent, cursor: 'pointer' }}
            />
            <span>تحديث تلقائي (30ث)</span>
          </label>

          {/* Refresh Button */}
          <button
            onClick={() => loadReport(true)}
            disabled={refreshing || loading}
            className="btn btn-accent"
            style={{ minWidth: 140 }}
          >
            <span style={{
              display: 'inline-block',
              animation: refreshing ? 'spin 1s linear infinite' : 'none',
              fontSize: 15
            }}>
              🔄
            </span>
            <span>{refreshing ? 'جاري الفحص...' : 'تحديث التقرير'}</span>
          </button>
        </div>
      </div>

      {/* ── Timestamp Bar ── */}
      {report && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: C.textDim,
          marginBottom: 16,
          padding: '4px 8px'
        }}>
          <div>
            🕒 آخر فحص: <strong style={{ color: C.textMuted }}>{summary.timestamp}</strong> 
            {summary.fetch_duration_seconds > 0 && (
              <span style={{ marginRight: 8, color: C.textDim }}>
                (استغرق {summary.fetch_duration_seconds} ثانية — فحص {summary.total_scanned_chats} محادثة مفتوحة)
              </span>
            )}
          </div>
          {summary.total_pending_chats > 0 ? (
            <div style={{ color: summary.critical_count > 0 ? C.redLight : C.yellowLight, fontWeight: 600 }}>
              ⚠️ يوجد {summary.total_pending_chats} عميل بانتظار رد الموظفين حالياً
            </div>
          ) : (
            <div style={{ color: C.greenLight, fontWeight: 600 }}>
              ✨ ممتاز! لا توجد أي شاتات معلقة بدون رد حالياً
            </div>
          )}
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        {/* Card 1: Total Pending */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'rgba(56,189,248,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: C.accent
          }}>
            💬
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.textMuted, fontWeight: 600 }}>إجمالي الشاتات المعلقة</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.textBright, lineHeight: 1.2 }}>
              {loading ? '...' : summary.total_pending_chats}
            </div>
            <div style={{ fontSize: 11, color: C.textDim }}>عملاء ينتظرون الرد حالياً</div>
          </div>
        </div>

        {/* Card 2: Critical Delays (15+ mins) */}
        <div className="card" style={{
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          borderColor: summary.critical_count > 0 ? C.redBorder : C.border,
          boxShadow: summary.critical_count > 0 ? '0 0 20px rgba(239,68,68,0.1)' : 'none'
        }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: C.redBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: C.redLight
          }}>
            🚨
          </div>
          <div>
            <div style={{ fontSize: 13, color: summary.critical_count > 0 ? C.redLight : C.textMuted, fontWeight: 600 }}>تأخير حرج (15+ دقيقة)</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: summary.critical_count > 0 ? C.redLight : C.textBright, lineHeight: 1.2 }}>
              {loading ? '...' : summary.critical_count}
            </div>
            <div style={{ fontSize: 11, color: C.textDim }}>يحتاج تدخلاً أو سحباً فورياً</div>
          </div>
        </div>

        {/* Card 3: Warning Delays (5-14 mins) */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: C.yellowBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: C.yellowLight
          }}>
            ⏳
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.yellowLight, fontWeight: 600 }}>تحذير تأخير (5 - 14 د)</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: C.textBright, lineHeight: 1.2 }}>
              {loading ? '...' : summary.warning_count}
            </div>
            <div style={{ fontSize: 11, color: C.textDim }}>شاتات تقترب من مرحلة الخطر</div>
          </div>
        </div>

        {/* Card 4: Longest Wait / Most Delayed */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'rgba(167,139,250,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
            color: C.purple
          }}>
            🏃
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.purple, fontWeight: 600 }}>أطول مدة انتظار مسجلة</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.textBright, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {loading ? '...' : summary.longest_delay_formatted}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              الأكثر تأخراً: {summary.most_delayed_agent}
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters & Tabs Navigation ── */}
      <div style={{
        background: C.bgLight,
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 20,
        border: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
        {/* Row 1: Search and Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setActiveTab('chats')}
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                background: activeTab === 'chats' ? C.accent : 'rgba(255,255,255,0.05)',
                color: activeTab === 'chats' ? '#0f172a' : C.textMuted,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>📋 الشاتات المعلقة حالياً</span>
              <span style={{
                background: activeTab === 'chats' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
                padding: '2px 7px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 800
              }}>
                {filteredChats.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('agents')}
              style={{
                padding: '8px 18px',
                borderRadius: 10,
                border: 'none',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                background: activeTab === 'agents' ? C.accent : 'rgba(255,255,255,0.05)',
                color: activeTab === 'agents' ? '#0f172a' : C.textMuted,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              <span>👥 ملخص أداء الموظفين</span>
              <span style={{
                background: activeTab === 'agents' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)',
                padding: '2px 7px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 800
              }}>
                {filteredAgents.length}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div style={{ flex: '1 1 300px', maxWidth: 450 }}>
            <input
              type="text"
              className="input"
              placeholder="🔍 بحث برقم المحادثة، اسم الموظف، العميل، أو الهاتف..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ padding: '8px 14px', fontSize: 13 }}
            />
          </div>
        </div>

        {/* Row 2: Filter Chips */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 10, borderTop: `1px solid ${C.borderLight}` }}>
          {/* Team Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: C.textDim, marginLeft: 4 }}>التيم:</span>
            {[
              { id: 'all', label: 'الكل' },
              { id: 'Sales', label: 'Sales' },
              { id: 'Data', label: 'Data' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTeamFilter(t.id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  background: teamFilter === t.id ? 'rgba(56,189,248,0.2)' : 'transparent',
                  color: teamFilter === t.id ? C.accent : C.textDim,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: teamFilter === t.id ? C.accentBorder : 'transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Severity Filter (Only in Chats tab) */}
          {activeTab === 'chats' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: C.textDim, marginLeft: 4 }}>درجة التأخير:</span>
              {[
                { id: 'all', label: 'الجميع', color: C.textMuted },
                { id: 'critical', label: '🔴 حرج (15+ د)', color: C.redLight },
                { id: 'warning', label: '🟡 تحذير (5-14 د)', color: C.yellowLight },
                { id: 'normal', label: '🟢 طبيعي (<5 د)', color: C.greenLight }
              ].map(s => (
                <button
                  key={s.id}
                  onClick={() => setSeverityFilter(s.id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: severityFilter === s.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: severityFilter === s.id ? s.color : C.textDim,
                    border: severityFilter === s.id ? `1px solid ${C.border}` : '1px solid transparent',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content View ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: C.textMuted }}>
          <div style={{ fontSize: 36, animation: 'spin 1.2s linear infinite', display: 'inline-block', marginBottom: 16 }}>
            🔄
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.textBright }}>جاري فحص محادثات Chatwoot وتحليل أوقات الانتظار...</div>
          <div style={{ fontSize: 13, color: C.textDim, marginTop: 6 }}>يتم فحص ومطابقة المحادثات بالموظفين في ثوانٍ معدودة</div>
        </div>
      ) : error ? (
        <div style={{
          padding: 30,
          background: C.redBg,
          borderRadius: 16,
          border: `1px solid ${C.redBorder}`,
          textAlign: 'center',
          color: C.redLight
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>حدث خطأ أثناء جلب بيانات التقرير</div>
          <div style={{ fontSize: 13, color: C.redText, marginTop: 6 }}>{error}</div>
          <button
            onClick={() => loadReport(true)}
            className="btn btn-accent"
            style={{ marginTop: 16 }}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : activeTab === 'chats' ? (
        /* ════════════ TABLE 1: LIVE PENDING CHATS ════════════ */
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>💬</span>
              <strong style={{ fontSize: 16, color: C.textBright }}>قائمة الشاتات المعلقة بدون رد</strong>
              <span style={{ fontSize: 12, color: C.textDim }}>({filteredChats.length} محادثة مطابقة)</span>
            </div>
            {filteredChats.length > 0 && (
              <span style={{ fontSize: 11, color: C.textDim }}>
                💡 مرتبة تلقائياً من الأكثر تأخراً إلى الأقل
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}`, color: C.textDim }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700, width: 100 }}># المحادثة</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>العميل</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, minWidth: 220 }}>آخر رسالة من العميل</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>الموظف المسند إليه</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>مدة الانتظار</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center', width: 140 }}>درجة التأخير</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center', width: 150 }}>إجراء المشرف</th>
                </tr>
              </thead>
              <tbody>
                {filteredChats.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '50px 20px', color: C.textDim }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.textBright }}>لا توجد محادثات معلقة مطابقة للفلاتر المحددة</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>جميع الشاتات في النطاق المفحوص تم الرد عليها أو لا تنتظر رداً</div>
                    </td>
                  </tr>
                ) : (
                  filteredChats.map((chat) => {
                    const isCritical = chat.severity === 'critical';
                    const isWarning = chat.severity === 'warning';

                    return (
                      <tr
                        key={chat.conv_id}
                        style={{
                          borderBottom: `1px solid ${C.borderLight}`,
                          background: isCritical ? 'rgba(239,68,68,0.03)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Conversation ID & Link */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <a
                            href={chat.chatwoot_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: C.accent,
                              fontWeight: 700,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                            title="فتح المحادثة في Chatwoot"
                          >
                            <span>#{chat.conv_id}</span>
                            <span style={{ fontSize: 11, opacity: 0.7 }}>↗</span>
                          </a>
                        </td>

                        {/* Customer Info */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: C.textBright }}>{chat.customer_name}</div>
                          {chat.customer_phone ? (
                            <div style={{ fontSize: 11, color: C.textDim, direction: 'ltr', textAlign: 'right' }}>
                              {chat.customer_phone}
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: C.textDim }}>—</div>
                          )}
                        </td>

                        {/* Last Message Snippet */}
                        <td style={{ padding: '12px 16px', maxWidth: 280 }}>
                          <div style={{
                            color: C.text,
                            fontSize: 12,
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical'
                          }}>
                            {chat.last_message || '—'}
                          </div>
                        </td>

                        {/* Agent Info */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ color: C.textBright }}>{chat.agent_name}</strong>
                            <span style={{
                              fontSize: 10,
                              padding: '1px 6px',
                              borderRadius: 6,
                              background: chat.team === 'Sales' ? 'rgba(56,189,248,0.12)' : 'rgba(167,139,250,0.12)',
                              color: chat.team === 'Sales' ? C.accent : C.purple,
                              fontWeight: 700
                            }}>
                              {chat.team}
                            </span>
                          </div>
                          {chat.crm_name && (
                            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                              CRM: {chat.crm_name}
                            </div>
                          )}
                        </td>

                        {/* Waiting Time */}
                        <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                          <div style={{
                            fontWeight: 700,
                            color: isCritical ? C.redLight : (isWarning ? C.yellowLight : C.textBright)
                          }}>
                            {chat.waiting_since_text}
                          </div>
                          <div style={{ fontSize: 10, color: C.textDim }}>
                            ({chat.delay_minutes} دقيقة)
                          </div>
                        </td>

                        {/* Severity Badge */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {isCritical ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 8,
                              background: C.redBg,
                              color: C.redLight,
                              border: `1px solid ${C.redBorder}`,
                              fontSize: 11,
                              fontWeight: 700
                            }}>
                              🔴 تأخير حرج
                            </span>
                          ) : isWarning ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 8,
                              background: C.yellowBg,
                              color: C.yellowLight,
                              border: '1px solid rgba(245,158,11,0.3)',
                              fontSize: 11,
                              fontWeight: 700
                            }}>
                              🟡 تحذير
                            </span>
                          ) : (
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 8,
                              background: C.greenBg,
                              color: C.greenLight,
                              border: `1px solid ${C.greenBorder}`,
                              fontSize: 11,
                              fontWeight: 700
                            }}>
                              🟢 طبيعي
                            </span>
                          )}
                        </td>

                        {/* Supervisor Action Button */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            onClick={() => setPullModalChat(chat)}
                            className="btn btn-sm"
                            style={{
                              background: 'rgba(239,68,68,0.15)',
                              color: C.redLight,
                              border: `1px solid ${C.redBorder}`,
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '4px 10px'
                            }}
                            title="فك إسناد هذا الشات وإعادته للانتظار في Chatwoot فوراً"
                          >
                            <span>📥</span>
                            <span>سحب للانتظار</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ════════════ TABLE 2: AGENTS PERFORMANCE SUMMARY ════════════ */
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>👥</span>
              <strong style={{ fontSize: 16, color: C.textBright }}>ملخص سرعة الاستجابة وأداء الموظفين</strong>
              <span style={{ fontSize: 12, color: C.textDim }}>({filteredAgents.length} موظف نشط في العينة)</span>
            </div>
            <span style={{ fontSize: 11, color: C.textDim }}>
              💡 يوضح الموظفين الأكثر تأخراً في الرد على العملاء
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}`, color: C.textDim }}>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>الموظف</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700 }}>التيم</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>حالة الشيفت</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>الشاتات المفتوحة</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>المعلقة بدون رد</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>تأخير حرج (15+ د)</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>أقصى تأخير مسجل</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>تقييم السرعة</th>
                  <th style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'center' }}>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '50px 20px', color: C.textDim }}>
                      لا توجد بيانات موظفين مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filteredAgents.map((ag) => {
                    const hasCritical = ag.critical_count > 0;
                    const hasWarning = ag.warning_count > 0;

                    return (
                      <tr
                        key={ag.agent_id}
                        style={{
                          borderBottom: `1px solid ${C.borderLight}`,
                          background: hasCritical ? 'rgba(239,68,68,0.03)' : 'transparent',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        {/* Agent Name */}
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: C.textBright }}>{ag.agent_name}</div>
                          {ag.crm_name && (
                            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                              CRM: {ag.crm_name}
                            </div>
                          )}
                        </td>

                        {/* Team */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 6,
                            background: ag.team === 'Sales' ? 'rgba(56,189,248,0.12)' : 'rgba(167,139,250,0.12)',
                            color: ag.team === 'Sales' ? C.accent : C.purple,
                            fontWeight: 700
                          }}>
                            {ag.team}
                          </span>
                        </td>

                        {/* Shift Status */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {ag.in_grace_period ? (
                            <span style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(245,158,11,0.15)',
                              color: '#fbbf24',
                              fontWeight: 700
                            }} title="فترة سماح أول نصف ساعة من الشيفت - يبدأ التوزيع بعد مرور 30 دقيقة">
                              ⏳ فترة سماح (يبدأ :30)
                            </span>
                          ) : ag.in_shift ? (
                            <span style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: C.greenBg,
                              color: C.greenLight,
                              fontWeight: 700
                            }}>
                              🟢 داخل الشيفت
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: 'rgba(148,163,184,0.1)',
                              color: C.textDim,
                              fontWeight: 600
                            }}>
                              ⚪ خارج الشيفت
                            </span>
                          )}
                        </td>

                        {/* Open Scanned Chats */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, color: C.textBright }}>
                          {ag.open_chats_count}
                        </td>

                        {/* Pending Chats */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            fontWeight: 800,
                            fontSize: 14,
                            color: ag.pending_count > 0 ? (hasCritical ? C.redLight : C.yellowLight) : C.greenLight
                          }}>
                            {ag.pending_count}
                          </span>
                        </td>

                        {/* Critical Count */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {ag.critical_count > 0 ? (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: C.redBg,
                              color: C.redLight,
                              fontWeight: 800,
                              fontSize: 12
                            }}>
                              {ag.critical_count}
                            </span>
                          ) : (
                            <span style={{ color: C.textDim }}>0</span>
                          )}
                        </td>

                        {/* Max Delay */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{
                            fontWeight: 700,
                            color: hasCritical ? C.redLight : (hasWarning ? C.yellowLight : C.textMuted)
                          }}>
                            {ag.max_delay_text}
                          </div>
                        </td>

                        {/* Performance Speed Badge */}
                        <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {hasCritical ? (
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: C.redBg,
                              color: C.redLight,
                              fontWeight: 700
                            }}>
                              🚨 متأخر جداً
                            </span>
                          ) : hasWarning ? (
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: C.yellowBg,
                              color: C.yellowLight,
                              fontWeight: 700
                            }}>
                              ⚠️ بطيء
                            </span>
                          ) : ag.pending_count > 0 ? (
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: 'rgba(56,189,248,0.1)',
                              color: C.accent,
                              fontWeight: 700
                            }}>
                              ⚡ استجابة عادية
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 11,
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: C.greenBg,
                              color: C.greenLight,
                              fontWeight: 700
                            }}>
                              🌟 ممتاز (خالٍ)
                            </span>
                          )}
                        </td>

                        {/* Quick filter action */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              setSearch(ag.agent_name);
                              setActiveTab('chats');
                            }}
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: 11, padding: '3px 8px' }}
                            title="عرض شاتات هذا الموظف المعلقة في الجدول"
                          >
                            عرض شاتاته
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Single Chat Unassign Confirmation Modal ── */}
      {pullModalChat && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 16
        }}>
          <div className="card" style={{
            maxWidth: 480,
            width: '100%',
            padding: 24,
            animation: 'scaleIn 0.2s ease',
            border: `1px solid ${C.redBorder}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: C.redBg,
                color: C.redLight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22
              }}>
                📥
              </div>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: C.textBright, margin: 0 }}>
                  تأكيد سحب المحادثة للانتظار
                </h3>
                <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>
                  محادثة رقم #{pullModalChat.conv_id}
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 12,
              padding: 14,
              marginBottom: 20,
              fontSize: 13,
              lineHeight: 1.6,
              border: `1px solid ${C.borderLight}`
            }}>
              <div style={{ marginBottom: 6 }}>
                👤 <strong>الموظف الحالي:</strong> {pullModalChat.agent_name}
              </div>
              <div style={{ marginBottom: 6 }}>
                👥 <strong>العميل:</strong> {pullModalChat.customer_name} ({pullModalChat.customer_phone || 'لا يوجد هاتف'})
              </div>
              <div style={{ marginBottom: 6 }}>
                ⏱️ <strong>مدة الانتظار:</strong> <span style={{ color: C.redLight, fontWeight: 700 }}>{pullModalChat.waiting_since_text}</span>
              </div>
              {pullModalChat.last_message && (
                <div style={{ fontSize: 12, color: C.textMuted, marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}>
                  💬 <em>"{pullModalChat.last_message}"</em>
                </div>
              )}
            </div>

            <div style={{
              fontSize: 12,
              color: C.yellowLight,
              background: C.yellowBg,
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <span>⚠️</span>
              <span>سيتم فك إسناد المحادثة فوراً في Chatwoot، وإعادتها لقائمة الانتظار لحين إسنادها يدوياً أو معالجتها.</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setPullModalChat(null)}
                className="btn btn-ghost"
                disabled={pullingChat}
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmUnassign}
                className="btn btn-danger"
                disabled={pullingChat}
              >
                {pullingChat ? 'جاري السحب...' : 'تأكيد السحب الآن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
