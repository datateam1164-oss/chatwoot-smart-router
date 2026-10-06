import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentsApi } from '../api/agents';

// Modular Dashboard Components
import { COORDINATOR_ARABIC_NAMES, normalizeArabic, formatHour12 } from '../components/dashboard/constants';
import { DashboardPulseBar } from '../components/dashboard/DashboardPulseBar';
import { ViewModeSwitcher } from '../components/dashboard/ViewModeSwitcher';
import { AgentTableView } from '../components/dashboard/AgentTableView';
import { SquadsView } from '../components/dashboard/SquadsView';
import { AgentInspectorDrawer } from '../components/dashboard/AgentInspectorDrawer';
import { PendingDrawer } from '../components/dashboard/PendingDrawer';
import { ReopenCalculatorModal, calculateReopenDemand } from '../components/dashboard/ReopenCalculatorModal';
import {
  BulkLimitModal,
  BulkDailyLimitModal,
  BulkLabelsModal,
  TeamLabelsModal
} from '../components/dashboard/BulkModals';
import { ResolveAuditModal } from '../components/dashboard/ResolveAuditModal';

export default function DashboardPage() {
  const navigate = useNavigate();

  // Core Data States
  const [agents, setAgents] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  // Operational Spinners
  const [syncingCrm, setSyncingCrm] = useState(false);
  const [routingRunning, setRoutingRunning] = useState(false);
  const [triggeringCycle, setTriggeringCycle] = useState(false);
  const [refreshingCwCounts, setRefreshingCwCounts] = useState(false);

  // View & Filter States
  const [viewMode, setViewMode] = useState('floor'); // 'floor', 'attention', 'squads', 'roster'
  const [deptFilter, setDeptFilter] = useState('sales'); // 'sales', 'all'
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState('all');
  const [coordinatorFilter, setCoordinatorFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');

  // Primary Distribution Selection Filter ('all' | 'selected' | 'unselected')
  const [selectionFilter, setSelectionFilter] = useState('all');

  // Multi-Selection State (Agents active for routing)
  const selectedAgentIds = useMemo(() => {
    return agents.filter(a => Boolean(a.is_selected)).map(a => a.id);
  }, [agents]);

  // Drawers & Modals States
  const [inspectingAgent, setInspectingAgent] = useState(null);
  const [pendingDrawerOpen, setPendingDrawerOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState(null);
  const [loadingPending, setLoadingPending] = useState(false);

  const [bulkLimitModalOpen, setBulkLimitModalOpen] = useState(false);
  const [bulkDailyLimitModalOpen, setBulkDailyLimitModalOpen] = useState(false);
  const [bulkLabelsModalOpen, setBulkLabelsModalOpen] = useState(false);
  const [teamLabelGroup, setTeamLabelGroup] = useState(null);
  const [resolveAuditOpen, setResolveAuditOpen] = useState(false);

  const [availableSalesLabels, setAvailableSalesLabels] = useState([
    'price_inquiry', 'discount_inquiry', 'high_price_complain',
    'package_compare', 'moasker', 'taqfel', 'complete_profile', 'unclassified'
  ]);

  const showNotification = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // ─── Data Loading ───
  const loadData = useCallback(async () => {
    try {
      const [agentsData, statusData, labelsData] = await Promise.all([
        agentsApi.fetchAgents(),
        agentsApi.fetchStatus(),
        agentsApi.fetchLabels().catch(() => null)
      ]);
      setAgents(agentsData || []);
      setStatus(statusData || null);
      if (labelsData?.selected_labels?.length > 0) {
        setAvailableSalesLabels(labelsData.selected_labels);
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPendingSummary = useCallback(async (force = false) => {
    setLoadingPending(true);
    try {
      const res = await agentsApi.getPendingSummary(force);
      setPendingSummary(res);
    } catch {
      showNotification('فشل جلب إحصائيات المعلقات', 'error');
    } finally {
      setLoadingPending(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadData();
    loadPendingSummary(false);
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, [loadData, loadPendingSummary]);

  // Keep inspected agent in sync with polled agents data
  useEffect(() => {
    if (inspectingAgent) {
      const updated = agents.find(a => a.id === inspectingAgent.id);
      if (updated) setInspectingAgent(updated);
    }
  }, [agents, inspectingAgent]);

  // ─── Department Base Agents ───
  const baseAgents = useMemo(() => {
    if (deptFilter === 'sales') {
      return agents.filter(a => a.team === 'Sales');
    }
    return agents;
  }, [agents, deptFilter]);

  const selectedCount = useMemo(() => {
    return baseAgents.filter(a => Boolean(a.is_selected)).length;
  }, [baseAgents]);

  const excludedCount = useMemo(() => {
    return baseAgents.filter(a => !a.is_selected).length;
  }, [baseAgents]);

  const pausedCount = useMemo(() => {
    return baseAgents.filter(a => Boolean(a.is_paused)).length;
  }, [baseAgents]);

  // ─── Real-time Reopen Demand Calculation ───
  const reopenDemand = useMemo(() => {
    return calculateReopenDemand(baseAgents, pendingSummary, availableSalesLabels);
  }, [baseAgents, pendingSummary, availableSalesLabels]);

  // ─── Dynamic Dropdown Options ───
  const availableShifts = useMemo(() => {
    const counts = {};
    let manualCount = 0;
    baseAgents.forEach(a => {
      if (a.is_manual_shift === 1) manualCount++;
      const s = (a.shift_text || '').trim();
      const key = s || '__none__';
      counts[key] = (counts[key] || 0) + 1;
    });

    const list = Object.keys(counts).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return counts[b] - counts[a];
    }).map(k => ({
      key: k,
      label: k === '__none__' ? '⚪ غير محدد / بدون شيفت' : (k.toLowerCase().includes('weekend') ? `🌴 إجازة ${k}` : `⏰ شيفت ${k}`),
      count: counts[k]
    }));

    if (manualCount > 0) {
      list.unshift({ key: '__manual__', label: '📝 أذونات يدوية معدلة', count: manualCount });
    }
    return list;
  }, [baseAgents]);

  const availableCoordinators = useMemo(() => {
    const map = {};
    baseAgents.forEach(a => {
      const raw = (a.coordinator_name || '').trim();
      let key = raw.toLowerCase();
      let label = raw;
      if (!raw || raw.toLowerCase() === 'none' || raw === 'بدون كوردينيتور') {
        key = '__unassigned__';
        label = 'عام / بدون كوردينيتور';
      } else if (raw.toLowerCase().includes('nada tarek')) {
        key = '__coordinators__';
        label = '👑 فريق الكوردينيتورز (ندى طارق)';
      } else {
        const ar = COORDINATOR_ARABIC_NAMES[raw.toLowerCase()];
        label = ar ? `فريق ${ar} (${raw})` : `فريق ${raw}`;
      }
      if (!map[key]) map[key] = { key, label, raw, count: 0 };
      map[key].count += 1;
    });

    return Object.values(map).sort((a, b) => {
      if (a.key === '__coordinators__') return -1;
      if (b.key === '__coordinators__') return 1;
      if (a.key === '__unassigned__') return 1;
      if (b.key === '__unassigned__') return -1;
      return a.label.localeCompare(b.label, 'ar');
    });
  }, [baseAgents]);

  // ─── Filter & Search Engine ───
  const filteredAgents = useMemo(() => {
    const normSearch = normalizeArabic(search);

    return baseAgents.filter(a => {
      // 1. Search matching
      if (normSearch) {
        const nameNorm = normalizeArabic(a.name);
        const crmNorm = normalizeArabic(a.crm_name);
        const coordNorm = normalizeArabic(a.coordinator_name);
        const coordArNorm = normalizeArabic(COORDINATOR_ARABIC_NAMES[(a.coordinator_name || '').toLowerCase()] || '');
        const shiftNorm = normalizeArabic(a.shift_text);
        const labelsNorm = (a.assigned_labels || []).map(l => normalizeArabic(l)).join(' ');

        const match = nameNorm.includes(normSearch) ||
                      crmNorm.includes(normSearch) ||
                      coordNorm.includes(normSearch) ||
                      coordArNorm.includes(normSearch) ||
                      shiftNorm.includes(normSearch) ||
                      labelsNorm.includes(normSearch);
        if (!match) return false;
      }

      // 2. Shift filter
      if (shiftFilter !== 'all') {
        if (shiftFilter === '__manual__') {
          if (a.is_manual_shift !== 1) return false;
        } else if (shiftFilter === '__none__') {
          if ((a.shift_text || '').trim()) return false;
        } else {
          if ((a.shift_text || '').trim() !== shiftFilter) return false;
        }
      }

      // 3. Coordinator filter
      if (coordinatorFilter !== 'all') {
        const raw = (a.coordinator_name || '').trim().toLowerCase();
        if (coordinatorFilter === '__unassigned__') {
          if (raw && raw !== 'none' && raw !== 'بدون كوردينيتور') return false;
        } else if (coordinatorFilter === '__coordinators__') {
          if (!raw.includes('nada tarek')) return false;
        } else {
          if (raw !== coordinatorFilter.toLowerCase()) return false;
        }
      }

      // 4. Label filter
      if (labelFilter !== 'all') {
        const assigned = a.assigned_labels || [];
        if (labelFilter === '__custom__') {
          if (assigned.length === 0) return false;
        } else if (labelFilter === '__default__') {
          if (assigned.length > 0) return false;
        } else {
          if (!assigned.includes(labelFilter)) return false;
        }
      }

      // 5. Distribution Selection Filter (Primary)
      if (selectionFilter === 'selected') {
        if (!a.is_selected) return false;
      } else if (selectionFilter === 'unselected') {
        if (a.is_selected) return false;
      } else if (selectionFilter === 'paused') {
        if (!a.is_paused) return false;
      }

      return true;
    });
  }, [baseAgents, search, shiftFilter, coordinatorFilter, labelFilter, selectionFilter]);

  // ─── Mode Specific Lists ───
  const floorAgents = useMemo(() => {
    return filteredAgents.filter(a => a.in_shift);
  }, [filteredAgents]);

  const attentionAgents = useMemo(() => {
    return filteredAgents.filter(a => {
      const isDailyFull = Boolean(a.is_daily_max_reached || (a.today_chats_count || 0) >= (a.daily_chat_limit || 100));
      const isWindowFull = (a.current_window_chats || 0) >= (a.chat_limit || 10);
      const isPaused = Boolean(a.is_paused);
      const highOpen = (a.chatwoot_open_chats || 0) >= 12;
      return isDailyFull || isWindowFull || isPaused || highOpen;
    });
  }, [filteredAgents]);

  const teamGroups = useMemo(() => {
    const groups = {};
    filteredAgents.forEach(agent => {
      const rawCoord = (agent.coordinator_name || '').trim();
      let key = rawCoord.toLowerCase();
      let displayName = rawCoord;
      let isCoordinatorSquad = false;
      let isUnassignedSquad = false;

      if (!rawCoord || rawCoord.toLowerCase() === 'none' || rawCoord === 'بدون كوردينيتور') {
        key = '__unassigned__';
        displayName = 'عام / بدون كوردينيتور';
        isUnassignedSquad = true;
      } else if (rawCoord.toLowerCase().includes('nada tarek')) {
        key = '__coordinators__';
        displayName = '👑 فريق الكوردينيتورز (إشراف: ندى طارق)';
        isCoordinatorSquad = true;
      } else {
        const arName = COORDINATOR_ARABIC_NAMES[rawCoord.toLowerCase()];
        displayName = arName ? `فريق ${arName} (${rawCoord})` : `فريق ${rawCoord}`;
      }

      if (!groups[key]) {
        groups[key] = {
          key,
          rawCoord,
          displayName,
          isCoordinatorSquad,
          isUnassignedSquad,
          agents: []
        };
      }
      groups[key].agents.push(agent);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.isCoordinatorSquad) return -1;
      if (b.isCoordinatorSquad) return 1;
      if (a.isUnassignedSquad) return 1;
      if (b.isUnassignedSquad) return -1;
      return a.displayName.localeCompare(b.displayName, 'ar');
    });
  }, [filteredAgents]);

  // Counts for ViewModeSwitcher
  const viewCounts = useMemo(() => ({
    floor: baseAgents.filter(a => a.in_shift).length,
    attention: baseAgents.filter(a => {
      const isDailyFull = Boolean(a.is_daily_max_reached || (a.today_chats_count || 0) >= (a.daily_chat_limit || 100));
      const isWindowFull = (a.current_window_chats || 0) >= (a.chat_limit || 10);
      const isPaused = Boolean(a.is_paused);
      const highOpen = (a.chatwoot_open_chats || 0) >= 12;
      return isDailyFull || isWindowFull || isPaused || highOpen;
    }).length,
    squads: teamGroups.length,
    roster: filteredAgents.length
  }), [baseAgents, filteredAgents, teamGroups]);

  // Ready agents count (in shift, selected, not paused, under window limit, under daily limit)
  const readyCount = useMemo(() => {
    return baseAgents.filter(a => {
      if (!a.in_shift || !a.is_selected || a.is_paused) return false;
      const isDailyFull = (a.today_chats_count || 0) >= (a.daily_chat_limit || 100);
      const isWindowFull = (a.current_window_chats || 0) >= (a.chat_limit || 10);
      return !isDailyFull && !isWindowFull;
    }).length;
  }, [baseAgents]);

  // ─── Actions & Handlers ───
  const handleToggleSelect = async (agent) => {
    const nextState = !agent.is_selected;
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_selected: nextState ? 1 : 0 } : a));
    try {
      await agentsApi.toggleSelect(agent.id, nextState);
      showNotification(
        nextState 
          ? `✅ تم تحديد ${agent.name} للتوزيع` 
          : `🚫 تم استبعاد ${agent.name} من التوزيع`,
        nextState ? 'success' : 'info'
      );
    } catch {
      showNotification('فشل تحديث حالة الاختيار', 'error');
      loadData();
    }
  };

  const handleToggleSelectAgent = (id) => {
    const ag = agents.find(a => a.id === id);
    if (ag) handleToggleSelect(ag);
  };

  const handleToggleSelectAll = async (checked, specificIds = null) => {
    const currentList = viewMode === 'floor' ? floorAgents : viewMode === 'attention' ? attentionAgents : filteredAgents;
    const targetIds = specificIds || currentList.map(a => a.id);
    if (targetIds.length === 0) return;

    const idSet = new Set(targetIds);
    setAgents(prev => prev.map(a => idSet.has(a.id) ? { ...a, is_selected: checked ? 1 : 0 } : a));

    try {
      await agentsApi.bulkSelect(deptFilter === 'sales' ? 'sales' : 'all', checked, targetIds);
      showNotification(
        checked 
          ? `✅ تم تحديد ${targetIds.length} موظف للتوزيع` 
          : `🚫 تم استبعاد ${targetIds.length} موظف من التوزيع`,
        checked ? 'success' : 'info'
      );
    } catch {
      showNotification('فشل تحديث حالة الاختيار للمجموعة', 'error');
      loadData();
    }
  };

  const handleDeselectAll = async () => {
    const allAgentIds = baseAgents.map(a => a.id);
    if (allAgentIds.length === 0) return;

    setAgents(prev => prev.map(a => ({ ...a, is_selected: 0 })));

    try {
      await agentsApi.bulkSelect(deptFilter === 'sales' ? 'sales' : 'all', false, allAgentIds);
      showNotification('🚫 تم إلغاء تحديد جميع الموظفين (0 محددين) — يمكنك الآن اختيار من تريده فقط للتوزيع', 'info');
    } catch {
      showNotification('فشل إلغاء التحديد', 'error');
      loadData();
    }
  };

  const handleTogglePause = async (agent) => {
    const nextState = !agent.is_paused;
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_paused: nextState ? 1 : 0 } : a));
    try {
      await agentsApi.togglePause(agent.id, nextState);
      showNotification(nextState ? `تم إيقاف التوزيع لـ ${agent.name} مؤقتاً` : `تم استئناف التوزيع لـ ${agent.name}`);
    } catch {
      showNotification('فشل تحديث حالة الإيقاف', 'error');
      loadData();
    }
  };

  const handleUpdateLimit = async (agent, delta) => {
    const newLimit = Math.max(1, (agent.chat_limit || 10) + delta);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, chat_limit: newLimit } : a));
    try {
      await agentsApi.updateLimit(agent.id, newLimit);
      showNotification(`تم تعديل ليمت النصف ساعة لـ ${agent.name} إلى ${newLimit}`);
    } catch {
      showNotification('فشل تعديل الليمت', 'error');
      loadData();
    }
  };

  const handleUpdateDailyLimit = async (agent, delta) => {
    const current = agent.daily_chat_limit || 100;
    const newLim = Math.max(1, current + delta);
    setAgents(prev => prev.map(a => a.id === agent.id ? {
      ...a,
      daily_chat_limit: newLim,
      is_daily_max_reached: ((a.today_chats_count || 0) >= newLim)
    } : a));
    try {
      await agentsApi.updateDailyLimit(agent.id, newLim);
      if (delta > 0) {
        showNotification(`➕ زيادة ماكس اليوم لـ ${agent.name} بـ +${delta} (الجديد: ${newLim})`);
      } else {
        showNotification(`تحديث ماكس اليوم لـ ${agent.name} إلى ${newLim}`);
      }
    } catch {
      showNotification('فشل تحديث ماكس اليوم', 'error');
      loadData();
    }
  };

  const handleSaveShift = async (agent, startH, endH) => {
    const startStr = formatHour12(startH);
    const endStr = formatHour12(endH);
    const shiftText = `${startStr} - ${endStr}`;
    try {
      const res = await agentsApi.updateAgentShift(agent.id, startH, endH, shiftText);
      showNotification(res.message || 'تم تحديث الشيفت وتثبيت الإذن بنجاح');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل حفظ الشيفت', 'error');
    }
  };

  const handleResetShift = async (agent) => {
    try {
      const res = await agentsApi.resetAgentShift(agent.id);
      showNotification(res.message || 'تمت استعادة شيفت الـ CRM الأصلي');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل استعادة شيفت الـ CRM', 'error');
    }
  };

  const handleSaveLabels = async (agent, labels) => {
    try {
      const res = await agentsApi.updateAgentLabels(agent.id, labels);
      showNotification(res.message || `تم تحديث تصنيفات ${agent.name} بنجاح`);
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, assigned_labels: labels } : a));
    } catch (err) {
      showNotification(err.message || 'فشل حفظ التصنيفات', 'error');
    }
  };

  const handlePullChats = async (agent) => {
    try {
      const res = await agentsApi.pullChats(agent.id, null);
      showNotification(res.message || 'تم سحب جميع المحادثات بنجاح', res.unassigned_count > 0 ? 'success' : 'info');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل سحب المحادثات', 'error');
    }
  };

  // Master Engine Controls
  const handleStartRouting = async () => {
    setRoutingRunning(true);
    try {
      const res = await agentsApi.startRouting();
      showNotification(res.message || 'تم تشغيل محرك التوزيع التلقائي بنجاح', 'success');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تشغيل التوزيع', 'error');
    } finally {
      setRoutingRunning(false);
    }
  };

  const handleStopRouting = async () => {
    setRoutingRunning(true);
    try {
      const res = await agentsApi.stopRouting();
      showNotification(res.message || 'تم إيقاف التوزيع مؤقتاً', 'success');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل إيقاف التوزيع', 'error');
    } finally {
      setRoutingRunning(false);
    }
  };

  const handleRunSingleCycle = async () => {
    setTriggeringCycle(true);
    try {
      const res = await agentsApi.runSingleCycle();
      showNotification(res.message || 'تم تشغيل دورة التوزيع بنجاح', res.routed_count > 0 ? 'success' : 'info');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تشغيل دورة التوزيع', 'error');
    } finally {
      setTriggeringCycle(false);
    }
  };

  const handleSyncCrm = async () => {
    setSyncingCrm(true);
    try {
      const res = await agentsApi.syncCrm();
      if (res.success) {
        showNotification(res.message || 'تمت مزامنة الشيفتات بنجاح');
        loadData();
      } else {
        showNotification(res.message || 'فشل مزامنة الـ CRM', 'error');
      }
    } catch (err) {
      showNotification(err.message || 'فشل الاتصال بنظام الـ CRM', 'error');
    } finally {
      setSyncingCrm(false);
    }
  };

  const handleRefreshChatwoot = async () => {
    setRefreshingCwCounts(true);
    try {
      const res = await agentsApi.refreshChatwootCounts();
      showNotification(res.message || 'تم تحديث أرقام الشاتات من شات ووت بنجاح');
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تحديث أرقام شات ووت', 'error');
    } finally {
      setRefreshingCwCounts(false);
    }
  };

  const handleReopenPendingLabel = async (label, count) => {
    try {
      const res = await agentsApi.reopenPending(label, count);
      showNotification(res.message || `تمت إعادة فتح ${res.reopened_count || count} محادثة بنجاح`, 'success');
      await loadPendingSummary(true);
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل إعادة فتح المحادثات', 'error');
    }
  };

  // Bulk operations
  const handleApplyBulkLimit = async (val, target) => {
    let targetIds = null;
    let team = 'all';
    if (target === 'selected') {
      targetIds = selectedAgentIds;
      if (targetIds.length === 0) {
        showNotification('يرجى تحديد موظف واحد على الأقل أولاً', 'error');
        return;
      }
    } else if (target === 'sales') {
      team = 'Sales';
    }
    try {
      const res = await agentsApi.bulkUpdateLimit(val, team, targetIds);
      showNotification(res.message || `تم بنجاح تطبيق ليمت النصف ساعة (${val})`);
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تطبيق الليمت', 'error');
    }
  };

  const handleApplyBulkDailyLimit = async (val, target) => {
    let targetIds = null;
    let team = 'all';
    if (target === 'selected') {
      targetIds = selectedAgentIds;
      if (targetIds.length === 0) {
        showNotification('يرجى تحديد موظف واحد على الأقل أولاً', 'error');
        return;
      }
    } else if (target === 'sales') {
      team = 'Sales';
    }
    try {
      const res = await agentsApi.bulkUpdateDailyLimit(val, team, targetIds);
      showNotification(res.message || `تم بنجاح تطبيق ماكس اليوم (${val})`);
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تطبيق ماكس اليوم', 'error');
    }
  };

  const handleApplyBulkLabels = async (agentIds, labels) => {
    try {
      const res = await agentsApi.applyPreset(agentIds, labels);
      showNotification(res.message || `تم تحديث تصنيفات ${agentIds.length} موظف بنجاح`);
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تطبيق التصنيفات', 'error');
    }
  };

  const handleApplyTeamLabels = async (group, labels) => {
    try {
      const res = await agentsApi.updateTeamLabels(group.rawCoord, labels);
      showNotification(res.message || `تم تحديث تصنيفات فريق ${group.displayName}`);
      setAgents(prev => prev.map(a => {
        const aCoord = (a.coordinator_name || '').trim();
        const isMatch = group.isUnassignedSquad
          ? (!aCoord || aCoord.toLowerCase() === 'none' || aCoord === 'بدون كوردينيتور')
          : (aCoord.toLowerCase() === group.rawCoord.toLowerCase());
        return isMatch ? { ...a, assigned_labels: labels } : a;
      }));
    } catch (err) {
      showNotification(err.message || 'فشل تحديث تصنيفات الفريق', 'error');
    }
  };

  const handleBulkPause = async (isPaused) => {
    if (selectedAgentIds.length === 0) return;
    const targetSet = new Set(selectedAgentIds);
    setAgents(prev => prev.map(a => targetSet.has(a.id) ? { ...a, is_paused: isPaused ? 1 : 0 } : a));
    try {
      await Promise.all(selectedAgentIds.map(id => agentsApi.togglePause(id, isPaused)));
      showNotification(isPaused ? `تم إيقاف ${selectedAgentIds.length} موظف مؤقتاً` : `تم استئناف توزيع ${selectedAgentIds.length} موظف`);
    } catch {
      showNotification('فشل تحديث حالة الإيقاف للمجموعة', 'error');
      loadData();
    }
  };

  const clearAllFilters = () => {
    setSearch('');
    setShiftFilter('all');
    setCoordinatorFilter('all');
    setLabelFilter('all');
    setSelectionFilter('all');
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px 80px', direction: 'rtl' }}>
      
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 22px', borderRadius: 10, color: '#fff', fontWeight: 700,
          background: notification.type === 'error' ? '#ef4444' : notification.type === 'info' ? '#38bdf8' : '#10b981',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.25s ease'
        }}>
          {notification.msg}
        </div>
      )}

      {/* Sticky Cockpit Pulse Bar */}
      <DashboardPulseBar
        status={status}
        routingRunning={routingRunning}
        onStartRouting={handleStartRouting}
        onStopRouting={handleStopRouting}
        triggeringCycle={triggeringCycle}
        onRunSingleCycle={handleRunSingleCycle}
        syncingCrm={syncingCrm}
        onSyncCrm={handleSyncCrm}
        refreshingCw={refreshingCwCounts}
        onRefreshCw={handleRefreshChatwoot}
        pendingCount={pendingSummary?.total_unassigned_pending}
        onOpenPending={() => {
          setPendingDrawerOpen(true);
          loadPendingSummary(false);
        }}
        reopenDemand={reopenDemand}
        onOpenReopenModal={() => {
          setReopenModalOpen(true);
          loadPendingSummary(false);
        }}
        inShiftCount={viewCounts.floor}
        readyCount={readyCount}
        todayRouted={status?.today_routed}
        onNavigateEvents={() => navigate('/events')}
        onOpenResolveAudit={() => navigate('/resolve-audit')}
      />

      {/* View Mode Switcher (Floor / Attention / Squads / Roster) */}
      <ViewModeSwitcher
        currentMode={viewMode}
        onChangeMode={setViewMode}
        counts={viewCounts}
      />

      {/* Filter & Search Bar */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        {/* Row 1: Search & Department Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* Global Search Input */}
          <div style={{ flex: '1 1 320px', position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Search by name, coordinator, shift, or label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '9px 14px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                outline: 'none'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: 14
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Department Filter (Sales vs All) */}
          <div style={{ display: 'inline-flex', background: 'var(--bg-input)', padding: 3, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <button
              type="button"
              onClick={() => setDeptFilter('sales')}
              style={{
                background: deptFilter === 'sales' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: deptFilter === 'sales' ? 'var(--primary)' : 'var(--text-muted)',
                border: deptFilter === 'sales' ? '1px solid var(--primary)' : 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Sales ({agents.filter(a => a.team === 'Sales').length})
            </button>
            <button
              type="button"
              onClick={() => setDeptFilter('all')}
              style={{
                background: deptFilter === 'all' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: deptFilter === 'all' ? 'var(--primary)' : 'var(--text-muted)',
                border: deptFilter === 'all' ? '1px solid var(--primary)' : 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              All Accounts ({agents.length})
            </button>
          </div>

          {/* Quick Bulk Open Modals */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setBulkLabelsModalOpen(true)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--primary)',
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🏷️ Group Labels
            </button>

            <button
              type="button"
              onClick={() => setBulkLimitModalOpen(true)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ⏱️ 30m Limit
            </button>

            <button
              type="button"
              onClick={() => setBulkDailyLimitModalOpen(true)}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '7px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🎯 Daily Max
            </button>
          </div>
        </div>

        {/* Row 2: Secondary Dropdown Filters (Shift, Coordinator, Labels) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Shift Dropdown */}
          <div style={{ flex: '1 1 180px' }}>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              style={{
                width: '100%',
                background: shiftFilter !== 'all' ? 'var(--primary-bg)' : 'var(--bg-input)',
                border: shiftFilter !== 'all' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                color: shiftFilter !== 'all' ? 'var(--primary)' : 'var(--text-main)',
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <option value="all">⏰ All Shifts ({availableShifts.reduce((s, x) => s + (x.key !== '__manual__' ? x.count : 0), 0)})</option>
              {availableShifts.map(s => (
                <option key={s.key} value={s.key}>{s.label} ({s.count})</option>
              ))}
            </select>
          </div>

          {/* Coordinator Dropdown */}
          <div style={{ flex: '1 1 180px' }}>
            <select
              value={coordinatorFilter}
              onChange={(e) => setCoordinatorFilter(e.target.value)}
              style={{
                width: '100%',
                background: coordinatorFilter !== 'all' ? 'var(--primary-bg)' : 'var(--bg-input)',
                border: coordinatorFilter !== 'all' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                color: coordinatorFilter !== 'all' ? 'var(--primary)' : 'var(--text-main)',
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <option value="all">👥 All Coordinators & Squads</option>
              {availableCoordinators.map(c => (
                <option key={c.key} value={c.raw || c.key}>{c.label} ({c.count})</option>
              ))}
            </select>
          </div>

          {/* Labels Dropdown */}
          <div style={{ flex: '1 1 180px' }}>
            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              style={{
                width: '100%',
                background: labelFilter !== 'all' ? 'var(--primary-bg)' : 'var(--bg-input)',
                border: labelFilter !== 'all' ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                color: labelFilter !== 'all' ? 'var(--primary)' : 'var(--text-main)',
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600
              }}
            >
              <option value="all">🏷️ All Labels</option>
              <option value="__custom__">🏷️ Custom Labels Only</option>
              <option value="__default__">🌐 Default (Unrestricted)</option>
              {availableSalesLabels.map(l => (
                <option key={l} value={l}>🏷️ {l}</option>
              ))}
            </select>
          </div>

          {/* Primary Selection Status Filter (Permanent, Clear & Always Visible) */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'var(--bg-input)',
            padding: 3,
            borderRadius: 8,
            border: '1px solid var(--border-subtle)',
            gap: 2
          }}>
            <button
              type="button"
              onClick={() => setSelectionFilter('all')}
              style={{
                background: selectionFilter === 'all' ? 'var(--bg-surface-elevated)' : 'transparent',
                color: selectionFilter === 'all' ? 'var(--text-main)' : 'var(--text-muted)',
                border: selectionFilter === 'all' ? '1px solid var(--border-subtle)' : 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
              title="عرض جميع الموظفين (المحددين والمستبعدين)"
            >
              <span>🌐 الكل</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>({baseAgents.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionFilter('selected')}
              style={{
                background: selectionFilter === 'selected' ? 'var(--primary)' : 'transparent',
                color: selectionFilter === 'selected' ? '#ffffff' : 'var(--primary)',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s'
              }}
              title="تصفية وعرض الموظفين المحددين للتوزيع فقط"
            >
              <span>☑️ المحددين للتوزيع</span>
              <span style={{
                background: selectionFilter === 'selected' ? 'rgba(255,255,255,0.25)' : 'var(--primary-bg)',
                color: selectionFilter === 'selected' ? '#ffffff' : 'var(--primary)',
                padding: '1px 7px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 900
              }}>
                {selectedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionFilter('unselected')}
              style={{
                background: selectionFilter === 'unselected' ? 'var(--badge-paused-bg)' : 'transparent',
                color: selectionFilter === 'unselected' ? 'var(--badge-paused-text)' : 'var(--text-muted)',
                border: selectionFilter === 'unselected' ? '1px solid var(--badge-paused-border)' : 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
              title="عرض الموظفين المستبعدين من التوزيع فقط"
            >
              <span>◻️ المستبعدين</span>
              <span style={{ fontSize: 11 }}>({excludedCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectionFilter('paused')}
              style={{
                background: selectionFilter === 'paused' ? 'rgba(245, 158, 11, 0.22)' : 'transparent',
                color: selectionFilter === 'paused' ? '#fbbf24' : 'var(--text-muted)',
                border: selectionFilter === 'paused' ? '1px solid rgba(245, 158, 11, 0.45)' : 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
              title="عرض الموظفين المتوقفين مؤقتاً فقط (الذين يحملون بادج ⏸️ متوقف مؤقتاً)"
            >
              <span>⏸️ متوقف مؤقتاً</span>
              <span style={{
                background: selectionFilter === 'paused' ? 'rgba(0,0,0,0.35)' : 'rgba(245, 158, 11, 0.15)',
                color: '#fbbf24',
                padding: '1px 6px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 800
              }}>
                {pausedCount}
              </span>
            </button>
          </div>

          {/* Deselect All Button (تصفير التحديد) */}
          <button
            type="button"
            onClick={handleDeselectAll}
            disabled={selectedCount === 0}
            style={{
              background: selectedCount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-surface-elevated)',
              border: selectedCount > 0 ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--border-subtle)',
              color: selectedCount > 0 ? '#ef4444' : 'var(--text-dim)',
              padding: '6px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 800,
              cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s'
            }}
            title="إلغاء تحديد جميع الموظفين (تصفير الاختيار للبدء بتحديد يدوي نظيف)"
          >
            <span>🚫</span>
            <span>إلغاء تحديد الكل {selectedCount > 0 ? `(${selectedCount})` : ''}</span>
          </button>

          {/* Reset Filters */}
          {(shiftFilter !== 'all' || coordinatorFilter !== 'all' || labelFilter !== 'all' || search || selectionFilter !== 'all') && (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{
                background: 'var(--badge-capped-bg)',
                border: '1px solid var(--badge-capped-border)',
                color: 'var(--badge-capped-text)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
              title="إعادة ضبط جميع الفلاتر"
            >
              Clear Filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Main View Render */}
      {loading ? (
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card)',
          padding: 60, textAlign: 'center', color: 'var(--text-muted)', fontSize: 15
        }}>
          ⏳ جاري تحميل بيانات الموظفين ومحرك التوزيع...
        </div>
      ) : viewMode === 'squads' ? (
        <SquadsView
          teamGroups={teamGroups}
          selectedAgentIds={selectedAgentIds}
          onToggleSelectAgent={handleToggleSelectAgent}
          onToggleSelectAll={handleToggleSelectAll}
          onDeselectAll={handleDeselectAll}
          onInspectAgent={setInspectingAgent}
          onToggleSelect={handleToggleSelect}
          onTogglePause={handleTogglePause}
          onUpdateLimit={handleUpdateLimit}
          onUpdateDailyLimit={handleUpdateDailyLimit}
          onOpenTeamLabels={setTeamLabelGroup}
        />
      ) : (
        <AgentTableView
          agents={
            viewMode === 'floor'
              ? floorAgents
              : viewMode === 'attention'
              ? attentionAgents
              : filteredAgents
          }
          selectedAgentIds={selectedAgentIds}
          onToggleSelectAgent={handleToggleSelectAgent}
          onToggleSelectAll={handleToggleSelectAll}
          onDeselectAll={handleDeselectAll}
          onInspectAgent={setInspectingAgent}
          onToggleSelect={handleToggleSelect}
          onTogglePause={handleTogglePause}
          onUpdateLimit={handleUpdateLimit}
          onUpdateDailyLimit={handleUpdateDailyLimit}
        />
      )}

      {/* Empty State Banner if no agents match */}
      {!loading && (
        (viewMode === 'floor' && floorAgents.length === 0) ||
        (viewMode === 'attention' && attentionAgents.length === 0) ||
        (viewMode === 'roster' && filteredAgents.length === 0)
      ) && (
        <div style={{
          background: 'var(--bg-surface)', borderRadius: 14, border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-card)',
          padding: 40, textAlign: 'center', color: 'var(--text-muted)', marginTop: 16
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>
            {viewMode === 'attention' ? '✨' : '🔍'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-main)' }}>
            {viewMode === 'attention'
              ? 'ممتاز! لا يوجد أي موظف بحاجة لمتابعة خاصة حالياً (الجميع يعمل بسلاسة)'
              : 'لا توجد بيانات مطابقة للبحث أو الفلتر المختار'}
          </div>
        </div>
      )}

      {/* Slide-Over Drawers */}
      <AgentInspectorDrawer
        agent={inspectingAgent}
        isOpen={Boolean(inspectingAgent)}
        onClose={() => setInspectingAgent(null)}
        onToggleSelect={handleToggleSelect}
        onTogglePause={handleTogglePause}
        onUpdateLimit={handleUpdateLimit}
        onUpdateDailyLimit={handleUpdateDailyLimit}
        onSaveShift={handleSaveShift}
        onResetShift={handleResetShift}
        onSaveLabels={handleSaveLabels}
        onPullChats={handlePullChats}
        availableSalesLabels={availableSalesLabels}
        showNotification={showNotification}
      />

      <PendingDrawer
        isOpen={pendingDrawerOpen}
        onClose={() => setPendingDrawerOpen(false)}
        summary={pendingSummary}
        loading={loadingPending}
        onRefresh={() => loadPendingSummary(true)}
        onReopenLabel={handleReopenPendingLabel}
        onOpenCalculator={() => {
          setPendingDrawerOpen(false);
          setReopenModalOpen(true);
        }}
      />

      {/* 📊 Reopen Demand Calculator Modal */}
      <ReopenCalculatorModal
        isOpen={reopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        agents={baseAgents}
        pendingSummary={pendingSummary}
        configuredLabels={availableSalesLabels}
        onReopenLabel={handleReopenPendingLabel}
        onRefreshPending={() => loadPendingSummary(true)}
        loadingPending={loadingPending}
      />

      {/* Bulk Modals */}
      <BulkLimitModal
        isOpen={bulkLimitModalOpen}
        onClose={() => setBulkLimitModalOpen(false)}
        onApply={handleApplyBulkLimit}
        selectedCount={selectedAgentIds.length}
      />

      <BulkDailyLimitModal
        isOpen={bulkDailyLimitModalOpen}
        onClose={() => setBulkDailyLimitModalOpen(false)}
        onApply={handleApplyBulkDailyLimit}
        selectedCount={selectedAgentIds.length}
      />

      <BulkLabelsModal
        isOpen={bulkLabelsModalOpen}
        onClose={() => setBulkLabelsModalOpen(false)}
        agents={agents}
        preSelectedIds={selectedAgentIds}
        availableSalesLabels={availableSalesLabels}
        onApply={handleApplyBulkLabels}
      />

      <TeamLabelsModal
        isOpen={Boolean(teamLabelGroup)}
        onClose={() => setTeamLabelGroup(null)}
        group={teamLabelGroup}
        availableSalesLabels={availableSalesLabels}
        onApply={handleApplyTeamLabels}
      />

      {/* 🎯 Resolve & Quality Audit Modal */}
      <ResolveAuditModal
        isOpen={resolveAuditOpen}
        onClose={() => setResolveAuditOpen(false)}
        allAgents={agents}
      />

    </div>
  );
}
