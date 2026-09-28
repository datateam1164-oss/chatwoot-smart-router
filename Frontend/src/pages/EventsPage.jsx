import { useState, useEffect, useMemo } from 'react';
import { agentsApi } from '../api/agents';

export default function EventsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [labelFilter, setLabelFilter] = useState('all');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await agentsApi.fetchLogs();
      setLogs(data || []);
      setError(null);
    } catch (err) {
      setError('فشل جلب سجل التوزيع من قاعدة البيانات المحلية.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    } catch {
      return dateStr;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  // Extract distinct labels for filter
  const uniqueLabels = useMemo(() => {
    const set = new Set();
    logs.forEach(l => {
      if (l.label) set.add(l.label);
    });
    return Array.from(set);
  }, [logs]);

  // Unique agents count
  const uniqueAgentsCount = useMemo(() => {
    const set = new Set();
    logs.forEach(l => {
      if (l.agent_name) set.add(l.agent_name);
    });
    return set.size;
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const q = search.toLowerCase();
      const matchSearch =
        (log.conv_id && String(log.conv_id).includes(q)) ||
        (log.agent_name && log.agent_name.toLowerCase().includes(q)) ||
        (log.label && log.label.toLowerCase().includes(q)) ||
        (log.sender_phone && String(log.sender_phone).includes(q)) ||
        (log.sender_name && log.sender_name.toLowerCase().includes(q));

      if (!matchSearch) return false;
      if (labelFilter !== 'all' && log.label !== labelFilter) return false;
      return true;
    });
  }, [logs, search, labelFilter]);

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px', animation: 'fadeIn .4s ease' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            📋 سجل أحداث التوزيع اللحظي
          </h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 14 }}>
            تتبع مباشر وفوري لجميع المحادثات التي تم توزيعها وتوجيهها للموظفين عبر النظام المحلي
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={fetchLogs}
            disabled={loading}
            style={{
              background: '#1e293b', color: '#38bdf8', border: '1px solid #334155',
              padding: '10px 18px', borderRadius: 8, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.2s'
            }}
          >
            {loading ? '⏳ جاري التحديث...' : '🔄 تحديث السجل'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: 14, marginBottom: 20, color: '#f87171' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>إجمالي الشاتات الموزعة بالسجل</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>{logs.length}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>عدد الموظفين الذين استقبلوا شاتات</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{uniqueAgentsCount}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>آخر شات تم توزيعه</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', marginTop: 8 }}>
            {logs.length > 0 ? (
              <span>شات #{logs[0].conv_id} ({formatDateTime(logs[0].assigned_at)})</span>
            ) : (
              <span style={{ color: '#64748b' }}>لا يوجد بعد</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ background: '#1e293b', padding: '14px 18px', borderRadius: 12, border: '1px solid #334155', marginBottom: 20, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 260, flex: 1, maxWidth: 400 }}>
          <input
            type="text"
            placeholder="🔍 بحث برقم الشات، الموظف، الليبل، أو الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', background: '#0f172a', border: '1px solid #334155',
              color: '#fff', padding: '8px 14px', borderRadius: 6, fontSize: 13
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>تصفية حسب الليبل:</span>
          <button
            onClick={() => setLabelFilter('all')}
            style={{
              background: labelFilter === 'all' ? '#3b82f6' : '#0f172a',
              color: labelFilter === 'all' ? '#fff' : '#94a3b8',
              border: '1px solid #334155', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
            }}
          >
            الكل ({logs.length})
          </button>
          {uniqueLabels.map(lbl => (
            <button
              key={lbl}
              onClick={() => setLabelFilter(lbl)}
              style={{
                background: labelFilter === lbl ? '#3b82f6' : '#0f172a',
                color: labelFilter === lbl ? '#fff' : '#cbd5e1',
                border: '1px solid #334155', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Events Timeline / Cards */}
      <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: '24px 20px', minHeight: 300 }}>
        {loading && logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>⏳</span>
            جاري تحميل سجل التوزيع من قاعدة البيانات...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
            <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>📭</span>
            {search || labelFilter !== 'all' ? 'لا توجد نتائج مطابقة للبحث' : 'لم يتم تسجيل أي عمليات توزيع بعد. ستظهر الأحداث هنا فور بدء التوزيع.'}
          </div>
        ) : (
          <div style={{ position: 'relative', paddingRight: 10 }}>
            {/* Timeline line */}
            <div style={{ position: 'absolute', right: 24, top: 10, bottom: 10, width: 2, background: 'rgba(56, 189, 248, 0.15)' }} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredLogs.map((ev, i) => {
                const isUnlabeled = ev.label && (ev.label.includes('بدون') || ev.label.toLowerCase().includes('unlabeled'));
                return (
                  <div
                    key={ev.id || i}
                    style={{
                      display: 'flex', gap: 16, position: 'relative', zIndex: 1,
                      animation: `fadeIn .25s ease ${Math.min(i * 0.03, 0.5)}s both`
                    }}
                  >
                    {/* Timestamp bubble */}
                    <div style={{
                      width: 85, flexShrink: 0, textAlign: 'left',
                      color: '#94a3b8', fontSize: 12, paddingTop: 10,
                      direction: 'ltr', fontVariantNumeric: 'tabular-nums', fontWeight: 600
                    }}>
                      <div>{formatDateTime(ev.assigned_at)}</div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>{formatDate(ev.assigned_at)}</div>
                    </div>

                    {/* Timeline icon */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: '#0f172a', border: '2px solid #38bdf8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, flexShrink: 0, marginTop: 6,
                      boxShadow: '0 0 10px rgba(56, 189, 248, 0.2)'
                    }}>
                      ⚡
                    </div>

                    {/* Event Content Card */}
                    <div style={{
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 10, padding: '14px 18px', flex: 1,
                      transition: 'border-color 0.2s'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 800, color: '#38bdf8', fontSize: 15 }}>
                            شات #{ev.conv_id}
                          </span>
                          <span style={{
                            background: '#064e3b', color: '#34d399',
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700
                          }}>
                            ✓ تم التوزيع
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {ev.label && (
                            <span style={{
                              fontSize: 12, fontWeight: 700,
                              background: isUnlabeled ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                              color: isUnlabeled ? '#fbbf24' : '#60a5fa',
                              border: isUnlabeled ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                              padding: '2px 10px', borderRadius: 8
                            }}>
                              🏷️ {ev.label}
                            </span>
                          )}

                          <a
                            href={`https://crm.elkheta.com/app/accounts/1/conversations/${ev.conv_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 12, color: '#94a3b8', textDecoration: 'none',
                              padding: '2px 8px', border: '1px solid #334155', borderRadius: 6,
                              display: 'inline-flex', alignItems: 'center', gap: 4
                            }}
                          >
                            فتح في Chatwoot ↗
                          </a>
                        </div>
                      </div>

                      {/* Agent Info */}
                      <div style={{ color: '#e2e8f0', fontSize: 14, marginBottom: 4 }}>
                        إسناد إلى الموظف: <strong style={{ color: '#f8fafc' }}>{ev.agent_name || 'غير محدد'}</strong>
                        {ev.agent_id && (
                          <span style={{ color: '#64748b', fontSize: 12, marginRight: 6 }}>
                            (ID: {ev.agent_id})
                          </span>
                        )}
                      </div>

                      {/* Sender details if available */}
                      {(ev.sender_name || ev.sender_phone) && (
                        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4, display: 'flex', gap: 16 }}>
                          {ev.sender_name && <span>العميل: <strong style={{ color: '#cbd5e1' }}>{ev.sender_name}</strong></span>}
                          {ev.sender_phone && <span>الهاتف: <strong style={{ color: '#cbd5e1' }}>{ev.sender_phone}</strong></span>}
                        </div>
                      )}

                      {/* Message preview if available */}
                      {ev.last_message && (
                        <div style={{ marginTop: 8, background: '#1e293b', padding: '8px 12px', borderRadius: 6, color: '#cbd5e1', fontSize: 13 }}>
                          <span style={{ color: '#64748b', fontSize: 12 }}>نص الرسالة: </span>
                          {ev.last_message}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
