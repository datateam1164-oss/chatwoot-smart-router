import { useState, useEffect } from 'react';
import { agentsApi, authApi, authStorage } from '../api/agents';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('labels'); // 'labels', 'crm', 'chatwoot', 'mappings', 'security'
  const [settings, setSettings] = useState({});
  const [mappings, setMappings] = useState([]);
  const [agents, setAgents] = useState([]);
  const [allLabels, setAllLabels] = useState([]);
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [labelSearch, setLabelSearch] = useState('');
  const [savingLabels, setSavingLabels] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingCrm, setTestingCrm] = useState(false);
  const [notification, setNotification] = useState(null);

  // Security & Auth state
  const [currentUsername, setCurrentUsername] = useState(authStorage.getUser()?.username || 'admin');
  const [newUsername, setNewUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingSecurity, setSavingSecurity] = useState(false);

  // Multi-user team management state
  const [teamUsers, setTeamUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [newTeamUser, setNewTeamUser] = useState({ username: '', password: '', role: 'admin' });
  const [addingUser, setAddingUser] = useState(false);

  // New mapping form state
  const [newCrmName, setNewCrmName] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [sData, mData, aData, lData] = await Promise.all([
        agentsApi.fetchSettings(),
        agentsApi.fetchMappings(),
        agentsApi.fetchAgents(),
        agentsApi.fetchLabels()
      ]);
      setSettings(sData);
      setMappings(mData);
      setAgents(aData);
      setAllLabels(lData.all_labels || []);
      setSelectedLabels(lData.selected_labels || []);
    } catch (err) {
      showNotification('فشل تحميل الإعدادات', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const uList = await authApi.getUsers();
      setTeamUsers(uList);
    } catch (err) {
      // silent
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'security') {
      loadUsers();
    }
  }, [activeTab]);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await agentsApi.saveSettings(settings);
      showNotification('تم حفظ الإعدادات بنجاح');
    } catch (err) {
      showNotification('فشل حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestCrmLogin = async () => {
    if (!settings.crm_email || !settings.crm_password) {
      showNotification('يرجى إدخال البريد الإلكتروني وكلمة المرور للـ CRM', 'error');
      return;
    }
    setTestingCrm(true);
    try {
      const res = await agentsApi.loginCrm(settings.crm_email, settings.crm_password);
      showNotification(res.message || 'تم تسجيل الدخول بنجاح');
      await agentsApi.syncCrm();
      showNotification('تم تسجيل الدخول ومزامنة الشيفتات فوراً بنجاح!');
    } catch (err) {
      showNotification(err.message || 'فشل تسجيل الدخول في الـ CRM', 'error');
    } finally {
      setTestingCrm(false);
    }
  };

  const handleAddMapping = async (e) => {
    e.preventDefault();
    if (!newCrmName.trim() || !selectedAgentId) return;

    const agent = agents.find(a => a.id === selectedAgentId);
    if (!agent) return;

    try {
      await agentsApi.saveMapping(newCrmName.trim(), agent.id, agent.name);
      showNotification(`تم ربط "${newCrmName}" بـ "${agent.name}" بنجاح`);
      setNewCrmName('');
      setSelectedAgentId('');
      const updated = await agentsApi.fetchMappings();
      setMappings(updated);
    } catch (err) {
      showNotification('فشل حفظ الربط', 'error');
    }
  };

  // Label handlers
  const handleToggleLabel = (title) => {
    const lowerTitle = title.toLowerCase();
    setSelectedLabels(prev => {
      const exists = prev.some(l => l.toLowerCase() === lowerTitle);
      if (exists) {
        return prev.filter(l => l.toLowerCase() !== lowerTitle);
      } else {
        return [...prev, title];
      }
    });
  };

  const handleSelectAllLabels = () => {
    const allTitles = allLabels.map(l => l.title);
    setSelectedLabels(allTitles);
  };

  const handleClearAllLabels = () => {
    setSelectedLabels([]);
  };

  const handleMoveLabelUp = (index) => {
    if (index <= 0) return;
    setSelectedLabels(prev => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveLabelDown = (index) => {
    if (index >= selectedLabels.length - 1) return;
    setSelectedLabels(prev => {
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  };

  const handleMoveLabelToTop = (index) => {
    if (index <= 0) return;
    setSelectedLabels(prev => {
      const item = prev[index];
      const next = prev.filter((_, i) => i !== index);
      return [item, ...next];
    });
  };

  const handleMoveLabelToBottom = (index) => {
    if (index >= selectedLabels.length - 1) return;
    setSelectedLabels(prev => {
      const item = prev[index];
      const next = prev.filter((_, i) => i !== index);
      return [...next, item];
    });
  };

  const handleSaveLabels = async () => {
    setSavingLabels(true);
    try {
      await agentsApi.saveLabels(selectedLabels);
      showNotification(`Labels priority order saved successfully (${selectedLabels.length} labels)!`);
    } catch (err) {
      showNotification('Failed to save labels priority order', 'error');
    } finally {
      setSavingLabels(false);
    }
  };

  const handleUpdateSecurity = async (e) => {
    e.preventDefault();
    if (!oldPassword) {
      showNotification('يرجى إدخال كلمة المرور الحالية لتأكيد التغيير', 'error');
      return;
    }
    if (newPassword && newPassword !== confirmPassword) {
      showNotification('كلمة المرور الجديدة وتأكيدها غير متطابقين', 'error');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      showNotification('كلمة المرور الجديدة يجب أن تكون 6 خانات على الأقل', 'error');
      return;
    }

    setSavingSecurity(true);
    try {
      await authApi.changeCredentials({
        oldPassword,
        newUsername: newUsername.trim() || undefined,
        newPassword: newPassword || undefined
      });
      showNotification('تم تحديث بيانات الدخول بنجاح! احتفظ ببياناتك الجديدة.');
      if (newUsername.trim()) setCurrentUsername(newUsername.trim());
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNewUsername('');
    } catch (err) {
      showNotification(err.message || 'فشل تحديث بيانات الدخول', 'error');
    } finally {
      setSavingSecurity(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newTeamUser.username.trim() || !newTeamUser.password.trim()) {
      showNotification('اسم المستخدم وكلمة المرور مطلوبان', 'error');
      return;
    }
    if (newTeamUser.password.length < 6) {
      showNotification('كلمة المرور يجب أن تكون 6 خانات على الأقل', 'error');
      return;
    }
    setAddingUser(true);
    try {
      const res = await authApi.createUser(newTeamUser);
      showNotification(res.message || 'تم إنشاء الحساب بنجاح!');
      setTeamUsers(res.users || []);
      setNewTeamUser({ username: '', password: '', role: 'admin' });
    } catch (err) {
      showNotification(err.message || 'فشل إنشاء المستخدم', 'error');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (userId, uName) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في حذف حساب "${uName}" نهائياً؟`)) return;
    try {
      const res = await authApi.deleteUser(userId);
      showNotification(res.message || 'تم حذف الحساب بنجاح!');
      setTeamUsers(res.users || []);
    } catch (err) {
      showNotification(err.message || 'فشل حذف المستخدم', 'error');
    }
  };

  const filteredLabels = allLabels.filter(l => 
    l.title.toLowerCase().includes(labelSearch.toLowerCase()) ||
    (l.description && l.description.toLowerCase().includes(labelSearch.toLowerCase()))
  );

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
          background: notification.type === 'error' ? '#ef4444' : '#10b981',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
        }}>
          {notification.msg}
        </div>
      )}

      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-main)', marginBottom: 20 }}>
        ⚙️ إعدادات التوزيع والربط
      </h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'labels', label: `🏷️ تصنيفات السيلز (${selectedLabels.length} مصرح بها)` },
          { id: 'crm', label: '🏢 ربط الـ CRM (الشيفتات)' },
          { id: 'chatwoot', label: '💬 ربط Chatwoot (التوكن)' },
          { id: 'mappings', label: '🔗 مطابقة أسماء الموظفين' },
          { id: 'security', label: '🔐 أمان النظام وبيانات الدخول' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: activeTab === t.id ? 'var(--primary)' : 'var(--bg-surface)',
              color: activeTab === t.id ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)', padding: '10px 18px', borderRadius: 8,
              fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>جاري التحميل...</div>
      ) : (
        <div>
          {/* Labels Tab */}
          {activeTab === 'labels' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-main)' }}>
                    🏷️ تحديد ليبولات السيلز المصرح بتوزيعها
                  </h2>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                    ⚠️ أي محادثة تحتوي على ليبل آخر (مثل ليبولات الـ CS أو HR) أو بدون ليبل مصرح به، <strong>سيتم تخطيها ولن توزع نهائياً لموظفي السيلز</strong>.
                  </p>
                </div>

                <button
                  onClick={handleSaveLabels}
                  disabled={savingLabels}
                  style={{
                    background: '#10b981', color: '#fff', border: 'none', padding: '10px 24px',
                    borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: savingLabels ? 'wait' : 'pointer',
                    boxShadow: '0 2px 8px rgba(16,185,129,0.3)'
                  }}
                >
                  {savingLabels ? '⏳ جاري الحفظ...' : '💾 حفظ التصنيفات المعتمدة'}
                </button>
              </div>

              {/* Controls bar */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  placeholder="🔍 بحث في الليبولات..."
                  value={labelSearch}
                  onChange={(e) => setLabelSearch(e.target.value)}
                  style={{
                    flex: 1, minWidth: 200, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)', padding: '8px 14px', borderRadius: 6, fontSize: 13
                  }}
                />

                <button
                  onClick={handleSelectAllLabels}
                  style={{
                    background: 'var(--bg-surface-elevated)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', padding: '8px 14px',
                    borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  تحديد الكل
                </button>

                <button
                  onClick={handleClearAllLabels}
                  style={{
                    background: 'var(--bg-surface-elevated)', color: 'var(--text-main)', border: '1px solid var(--border-subtle)', padding: '8px 14px',
                    borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  إلغاء تحديد الكل
                </button>
              </div>

              {/* Labels Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 12,
                maxHeight: 480,
                overflowY: 'auto',
                paddingRight: 4
              }}>
                {filteredLabels.map((lbl) => {
                  const isSelected = selectedLabels.some(l => l.toLowerCase() === lbl.title.toLowerCase());
                  return (
                    <div
                      key={lbl.id || lbl.title}
                      onClick={() => handleToggleLabel(lbl.title)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 8,
                        border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}} // Handled by parent div
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }}
                        />
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                              background: lbl.color || 'var(--primary)'
                            }} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                              {lbl.title}
                            </span>
                          </div>
                          {lbl.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{lbl.description}</div>
                          )}
                        </div>
                      </div>

                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)',
                        color: isSelected ? 'var(--primary)' : 'var(--text-dim)',
                        border: '1px solid var(--border-subtle)'
                      }}>
                        {isSelected ? 'مسموح للسيلز ✅' : 'مستبعد ⛔'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* ───────────────────────────────────────────────────────────── */}
              {/* English Label Distribution Priority Queue (Ranked Order) */}
              {/* ───────────────────────────────────────────────────────────── */}
              <div style={{
                marginTop: 26,
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: 20
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>🎯</span>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-main)' }}>
                        Label Distribution Priority Queue
                      </h3>
                      <span style={{
                        background: 'var(--primary-bg)',
                        color: 'var(--primary)',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 800
                      }}>
                        {selectedLabels.length} Active Labels
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 12, maxWidth: 680, lineHeight: 1.5 }}>
                      Rank #1 is the highest priority. The smart router distributes all unassigned chats matching <strong>Rank #1</strong> first. Once completed, it dispatches Rank #2, Rank #3, etc., while ensuring fair, balanced round-robin among active agents.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveLabels}
                    disabled={savingLabels}
                    style={{
                      background: 'var(--primary)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 18px',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: savingLabels ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>{savingLabels ? '⏳ Saving...' : '💾 Save Priority Order'}</span>
                  </button>
                </div>

                {selectedLabels.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No sales labels currently selected. Please select labels from the catalog above.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedLabels.map((lblTitle, idx) => {
                      const foundObj = allLabels.find(l => l.title.toLowerCase() === lblTitle.toLowerCase());
                      const isTop = idx === 0;
                      const isBottom = idx === selectedLabels.length - 1;

                      return (
                        <div
                          key={lblTitle}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: 8,
                            background: isTop ? 'var(--primary-bg)' : 'var(--bg-surface)',
                            border: `1px solid ${isTop ? 'var(--primary)' : 'var(--border-subtle)'}`,
                            transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {/* Rank Badge */}
                            <span style={{
                              background: isTop ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                              color: isTop ? '#ffffff' : 'var(--text-muted)',
                              fontWeight: 900,
                              fontSize: 12,
                              padding: '3px 8px',
                              borderRadius: 6,
                              minWidth: 70,
                              textAlign: 'center',
                              fontVariantNumeric: 'tabular-nums'
                            }}>
                              {isTop ? '🥇 Rank #1' : idx === 1 ? '🥈 Rank #2' : idx === 2 ? '🥉 Rank #3' : `Rank #${idx + 1}`}
                            </span>

                            {/* Label Dot & Title */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: foundObj?.color || 'var(--primary)'
                              }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>
                                {lblTitle}
                              </span>
                              {isTop && (
                                <span style={{
                                  fontSize: 10,
                                  fontWeight: 800,
                                  background: 'var(--badge-ready-bg)',
                                  color: 'var(--badge-ready-text)',
                                  padding: '2px 6px',
                                  borderRadius: 4
                                }}>
                                  Top Priority (Distributed First)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Reorder Action Buttons (English) */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleMoveLabelToTop(idx)}
                              disabled={isTop}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: isTop ? 'var(--text-dim)' : 'var(--text-main)',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isTop ? 'not-allowed' : 'pointer',
                                opacity: isTop ? 0.4 : 1
                              }}
                              title="Move to Top"
                            >
                              🔝 Top
                            </button>

                            <button
                              type="button"
                              onClick={() => handleMoveLabelUp(idx)}
                              disabled={isTop}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: isTop ? 'var(--text-dim)' : 'var(--primary)',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 800,
                                cursor: isTop ? 'not-allowed' : 'pointer',
                                opacity: isTop ? 0.4 : 1
                              }}
                              title="Move Up"
                            >
                              ⬆️ Up
                            </button>

                            <button
                              type="button"
                              onClick={() => handleMoveLabelDown(idx)}
                              disabled={isBottom}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: isBottom ? 'var(--text-dim)' : 'var(--primary)',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 800,
                                cursor: isBottom ? 'not-allowed' : 'pointer',
                                opacity: isBottom ? 0.4 : 1
                              }}
                              title="Move Down"
                            >
                              ⬇️ Down
                            </button>

                            <button
                              type="button"
                              onClick={() => handleMoveLabelToBottom(idx)}
                              disabled={isBottom}
                              style={{
                                background: 'var(--bg-surface-elevated)',
                                border: '1px solid var(--border-subtle)',
                                color: isBottom ? 'var(--text-dim)' : 'var(--text-main)',
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: isBottom ? 'not-allowed' : 'pointer',
                                opacity: isBottom ? 0.4 : 1
                              }}
                              title="Move to Bottom"
                            >
                              🔻 Bottom
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20, textAlign: 'left' }}>
                <button
                  onClick={handleSaveLabels}
                  disabled={savingLabels}
                  style={{
                    background: '#10b981', color: '#fff', border: 'none', padding: '10px 24px',
                    borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: savingLabels ? 'wait' : 'pointer'
                  }}
                >
                  {savingLabels ? '⏳ Saving...' : '💾 Save Authorized Labels & Priority'}
                </button>
              </div>
            </div>
          )}

          {/* CRM Tab */}
          {activeTab === 'crm' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-main)' }}>
                🏢 إعدادات حساب الـ CRM (Sales Management System)
              </h2>
              <form onSubmit={handleSaveSettings}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    رابط السيرفر الأساسي (Base URL)
                  </label>
                  <input
                    type="text"
                    value={settings.crm_base_url || 'https://sales-management-system-obyr.onrender.com'}
                    onChange={(e) => setSettings({ ...settings, crm_base_url: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: 6 }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      البريد الإلكتروني للـ CRM
                    </label>
                    <input
                      type="email"
                      value={settings.crm_email || ''}
                      onChange={(e) => setSettings({ ...settings, crm_email: e.target.value })}
                      placeholder="data.team.116.4@gmail.com"
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: 6 }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: 260 }}>
                    <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      كلمة المرور (Password)
                    </label>
                    <input
                      type="password"
                      value={settings.crm_password || ''}
                      onChange={(e) => setSettings({ ...settings, crm_password: e.target.value })}
                      placeholder="••••••••"
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: 6 }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 24px',
                      borderRadius: 6, fontWeight: 700, cursor: saving ? 'wait' : 'pointer'
                    }}
                  >
                    {saving ? 'جاري الحفظ...' : 'حفظ بيانات الـ CRM'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestCrmLogin}
                    disabled={testingCrm}
                    style={{
                      background: '#059669', color: '#fff', border: 'none', padding: '10px 20px',
                      borderRadius: 6, fontWeight: 700, cursor: testingCrm ? 'wait' : 'pointer'
                    }}
                  >
                    {testingCrm ? '⏳ جاري الاختبار...' : '🔑 تسجيل دخول وتجربة المزامنة'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Chatwoot Tab */}
          {activeTab === 'chatwoot' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: 'var(--text-main)' }}>
                💬 إعدادات الاتصال بـ Chatwoot
              </h2>
              <form onSubmit={handleSaveSettings}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                    رابط منصة Chatwoot
                  </label>
                  <input
                    type="text"
                    value={settings.chatwoot_base_url || 'https://crm.elkheta.com'}
                    onChange={(e) => setSettings({ ...settings, chatwoot_base_url: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: 6 }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      رمز الوصول (API Access Token)
                    </label>
                    <input
                      type="text"
                      value={settings.chatwoot_access_token || ''}
                      onChange={(e) => setSettings({ ...settings, chatwoot_access_token: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: 6, fontFamily: 'monospace' }}
                    />
                  </div>

                  <div style={{ width: 140 }}>
                    <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                      Account ID
                    </label>
                    <input
                      type="text"
                      value={settings.chatwoot_account_id || '1'}
                      onChange={(e) => setSettings({ ...settings, chatwoot_account_id: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '10px 14px', borderRadius: 6 }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 24px',
                    borderRadius: 6, fontWeight: 700, cursor: saving ? 'wait' : 'pointer'
                  }}
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ إعدادات شات ووت'}
                </button>
              </form>
            </div>
          )}

          {/* Mappings Tab */}
          {activeTab === 'mappings' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-main)' }}>
                🔗 مطابقة أسماء الموظفين بين الـ CRM وشات ووت
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                النظام يطابق الموظفين تلقائياً بنسبة 99% من خلال الإيميل المشترك. يمكنك استخدام هذا النموذج لربط أي موظف لم يطابق اسمه آلياً.
              </p>

              {/* Add Mapping Form */}
              <form onSubmit={handleAddMapping} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    الاسم المسجل في الـ CRM
                  </label>
                  <input
                    type="text"
                    value={newCrmName}
                    onChange={(e) => setNewCrmName(e.target.value)}
                    placeholder="مثال: Maryam Hassan"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: 6 }}
                  />
                </div>

                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={{ display: 'block', color: 'var(--text-main)', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    الموظف المناظر في شات ووت
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)', padding: '8px 12px', borderRadius: 6 }}
                  >
                    <option value="">— اختر الموظف —</option>
                    {agents.map(a => (
                      <option key={a.id} value={a.id}>{a.name} (ID: {a.id})</option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  style={{
                    background: '#10b981', color: '#fff', border: 'none', padding: '9px 18px',
                    borderRadius: 6, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  ➕ إضافة ربط
                </button>
              </form>

              {/* Existing Mappings Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-elevated)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '10px 14px' }}>الاسم في الـ CRM</th>
                    <th style={{ padding: '10px 14px' }}>الموظف في شات ووت</th>
                    <th style={{ padding: '10px 14px' }}>Chatwoot ID</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.length === 0 ? (
                    <tr>
                      <td colSpan="3" style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>
                        لا توجد روابط مخصصة حالياً (السيستم يطابق الأسماء المتشابهة تلقائياً)
                      </td>
                    </tr>
                  ) : (
                    mappings.map((m, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-main)', fontWeight: 600 }}>{m.crm_name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--primary)' }}>{m.chatwoot_agent_name}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{m.chatwoot_agent_id}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                    🔐 أمان النظام وبيانات الدخول
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    تغيير اسم المستخدم أو كلمة المرور الخاصة بالدخول للنظام على هذا السيرفر أو السحابة
                  </p>
                </div>

                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--primary-bg)',
                  border: '1px solid var(--primary-border)',
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 13,
                  color: 'var(--primary)',
                  fontWeight: 700
                }}>
                  <span>👤 الحساب النشط:</span>
                  <span style={{ color: 'var(--text-main)' }}>{currentUsername}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(مسؤول النظام)</span>
                </div>
              </div>

              <div style={{
                background: 'var(--badge-paused-bg)',
                border: '1px solid var(--badge-paused-border)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 24,
                fontSize: 13,
                color: 'var(--badge-paused-text)',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}>
                <span style={{ fontSize: 18 }}>💡</span>
                <span>
                  <strong>ملاحظة هامة:</strong> كلمة المرور واسم المستخدم هما اللذان يستخدمهما أي شخص من التيم لتسجيل الدخول للنظام. إذا قمت بتغييرهما، شارك البيانات الجديدة مع من تثق بهم فقط.
                </span>
              </div>

              <form onSubmit={handleUpdateSecurity} style={{ maxWidth: 500, display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                    اسم المستخدم الجديد (اتركه فارغاً إذا كنت لا ترغب بتغييره)
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder={currentUsername}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                    كلمة المرور الحالية <span style={{ color: '#ef4444' }}>* (مطلوبة لتأكيد الهوية)</span>
                  </label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور الحالية"
                    required
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                    كلمة المرور الجديدة (اتركها فارغة إذا أردت تغيير اسم المستخدم فقط)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6 أحرف أو أرقام على الأقل"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 6 }}>
                    تأكيد كلمة المرور الجديدة
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد كتابة كلمة المرور الجديدة"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      color: 'var(--text-main)',
                      fontSize: 14,
                      outline: 'none'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingSecurity}
                  style={{
                    marginTop: 6,
                    padding: '11px 20px',
                    borderRadius: 8,
                    background: savingSecurity ? '#64748b' : 'var(--primary)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    border: 'none',
                    cursor: savingSecurity ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    alignSelf: 'flex-start',
                    boxShadow: '0 2px 10px var(--primary-bg)'
                  }}
                >
                  {savingSecurity ? 'جاري الحفظ...' : '💾 حفظ التعديلات الأمنية'}
                </button>
              </form>

              {/* Team Users Management Section */}
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-main)' }}>
                      👥 إدارة مستخدمي النظام وفريق العمل
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                      أنشئ حسابات دخول خاصة للزملاء في التيم لمتابعة وإدارة لوحة التحكم
                    </p>
                  </div>
                  <button
                    onClick={loadUsers}
                    disabled={loadingUsers}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      color: 'var(--primary)',
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {loadingUsers ? 'جاري التحديث...' : '🔄 تحديث القائمة'}
                  </button>
                </div>

                {/* Users List Table */}
                <div style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  marginBottom: 20
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'right' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '10px 14px' }}>المعرف</th>
                        <th style={{ padding: '10px 14px' }}>اسم المستخدم</th>
                        <th style={{ padding: '10px 14px' }}>الصلاحية</th>
                        <th style={{ padding: '10px 14px' }}>تاريخ الإنشاء</th>
                        <th style={{ padding: '10px 14px', textAlign: 'center' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teamUsers.map((u) => {
                        const isSelf = u.username === currentUsername;
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}>
                            <td style={{ padding: '10px 14px', color: 'var(--text-dim)' }}>#{u.id}</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                              {u.username}
                              {isSelf && (
                                <span style={{
                                  marginRight: 8,
                                  background: 'var(--primary)',
                                  color: '#fff',
                                  fontSize: 10,
                                  padding: '2px 6px',
                                  borderRadius: 4
                                }}>
                                  أنت (الحساب الحالي)
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                background: u.role === 'admin' ? 'var(--badge-ready-bg)' : 'var(--primary-bg)',
                                color: u.role === 'admin' ? 'var(--badge-ready-text)' : 'var(--primary)',
                                border: u.role === 'admin' ? '1px solid var(--badge-ready-border)' : '1px solid var(--primary-border)',
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: 4
                              }}>
                                {u.role === 'admin' ? '🛡️ مدير نظام' : '👤 مشرف'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                              {u.created_at ? new Date(u.created_at).toLocaleDateString('ar-EG') : 'افتراضي'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id, u.username)}
                                  style={{
                                    background: 'var(--badge-capped-bg)',
                                    border: '1px solid var(--badge-capped-border)',
                                    color: 'var(--badge-capped-text)',
                                    borderRadius: 6,
                                    padding: '4px 10px',
                                    fontSize: 11,
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                  }}
                                >
                                  🗑️ حذف
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add New User Form */}
                <form
                  onSubmit={handleCreateUser}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    padding: 16,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    alignItems: 'flex-end'
                  }}
                >
                  <div style={{ flex: '1 1 180px' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                      اسم المستخدم الجديد
                    </label>
                    <input
                      type="text"
                      value={newTeamUser.username}
                      onChange={(e) => setNewTeamUser({ ...newTeamUser, username: e.target.value })}
                      placeholder="مثال: ahmed_supervisor"
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6,
                        color: 'var(--text-main)',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ flex: '1 1 180px' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                      كلمة المرور
                    </label>
                    <input
                      type="password"
                      value={newTeamUser.password}
                      onChange={(e) => setNewTeamUser({ ...newTeamUser, password: e.target.value })}
                      placeholder="6 أحرف أو أرقام على الأقل"
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6,
                        color: 'var(--text-main)',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ flex: '0 0 140px' }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>
                      الصلاحية
                    </label>
                    <select
                      value={newTeamUser.role}
                      onChange={(e) => setNewTeamUser({ ...newTeamUser, role: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 6,
                        color: 'var(--text-main)',
                        fontSize: 13,
                        outline: 'none'
                      }}
                    >
                      <option value="admin">مدير نظام (كامل)</option>
                      <option value="supervisor">مشرف (متابعة وتوزيع)</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={addingUser}
                    style={{
                      padding: '8px 16px',
                      background: addingUser ? '#64748b' : '#10b981',
                      color: '#fff',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 700,
                      border: 'none',
                      cursor: addingUser ? 'not-allowed' : 'pointer',
                      height: 38
                    }}
                  >
                    {addingUser ? 'جاري الإضافة...' : '➕ إضافة مستخدم جديد'}
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
