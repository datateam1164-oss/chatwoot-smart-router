import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { agentsApi } from '../api/agents';

const COORDINATOR_ARABIC_NAMES = {
  'nada tarek 2': 'ندى طارق',
  'nada tarek': 'ندى طارق',
  'maram hussien': 'مرام حسين',
  'yasmin el foly': 'ياسمين الفولي',
  'habiba ebrahim': 'حبيبة إبراهيم',
  'ghada hesham': 'غادة هشام',
  'marwan medhat': 'مروان مدحت',
  'passant gamal': 'بسنت جمال',
  'haidy aly': 'هايدي علي',
  'fayrouz sabry': 'فيروز صبري',
  'eman zyada': 'إيمان زيادة',
  'soso emad': 'سوسو عماد',
  'nourhan elmasry': 'نورهان المصري',
  'basant muhammed': 'بسنت محمد'
};

const normalizeArabic = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .trim();
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncingCrm, setSyncingCrm] = useState(false);
  const [routingRunning, setRoutingRunning] = useState(false);
  const [triggeringCycle, setTriggeringCycle] = useState(false);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('sales'); // 'sales', 'all'
  const [filter, setFilter] = useState('all'); // all, in_shift, out_shift, selected, unselected, paused, coordinators
  const [shiftFilter, setShiftFilter] = useState('all'); // all, or specific shift_text, '__manual__', '__none__'
  const [coordinatorFilter, setCoordinatorFilter] = useState('all'); // all, '__coordinators__', '__unassigned__', or raw coordinator
  const [labelFilter, setLabelFilter] = useState('all'); // all, '__custom__', '__default__', or specific label
  const [actionLoading, setActionLoading] = useState({});
  const [notification, setNotification] = useState(null);
  const [labelModalAgent, setLabelModalAgent] = useState(null);
  const [modalSelectedLabels, setModalSelectedLabels] = useState([]);
  const [availableSalesLabels, setAvailableSalesLabels] = useState([
    'price_inquiry', 'discount_inquiry', 'high_price_complain',
    'package_compare', 'moasker', 'taqfel', 'complete_profile', 'unclassified'
  ]);
  const [savingAgentLabels, setSavingAgentLabels] = useState(false);

  // Shift Modal states
  const [shiftModalAgent, setShiftModalAgent] = useState(null);
  const [shiftStartHour, setShiftStartHour] = useState(11);
  const [shiftEndHour, setShiftEndHour] = useState(19);
  const [savingShift, setSavingShift] = useState(false);
  const [recentLogs, setRecentLogs] = useState([]);

  // Agent Chats Modal states
  const [agentChatsModal, setAgentChatsModal] = useState(null);
  const [agentChatsList, setAgentChatsList] = useState([]);
  const [loadingAgentChats, setLoadingAgentChats] = useState(false);

  // Pull Chats Modal states (سحب جميع الشاتات دائماً)
  const [pullModalAgent, setPullModalAgent] = useState(null);
  const [pullingChats, setPullingChats] = useState(false);

  // Bulk Limit (Half-Hour) Modal states
  const [bulkLimitModal, setBulkLimitModal] = useState(false);
  const [bulkLimitValue, setBulkLimitValue] = useState(10);
  const [bulkLimitTarget, setBulkLimitTarget] = useState('sales'); // 'sales', 'selected', 'all'
  const [savingBulkLimit, setSavingBulkLimit] = useState(false);

  // Bulk Daily Limit Modal states
  const [bulkDailyLimitModal, setBulkDailyLimitModal] = useState(false);
  const [bulkDailyLimitValue, setBulkDailyLimitValue] = useState(100);
  const [bulkDailyLimitTarget, setBulkDailyLimitTarget] = useState('sales'); // 'sales', 'selected', 'all'
  const [savingBulkDailyLimit, setSavingBulkDailyLimit] = useState(false);

  // Bulk Custom Labels Modal states
  const [bulkLabelsModal, setBulkLabelsModal] = useState(false);
  const [bulkSelectedAgentIds, setBulkSelectedAgentIds] = useState([]);
  const [bulkSelectedLabels, setBulkSelectedLabels] = useState([]);
  const [bulkAgentSearch, setBulkAgentSearch] = useState('');
  const [savingBulkLabels, setSavingBulkLabels] = useState(false);

  // View mode & Team states
  const [viewMode, setViewMode] = useState('teams'); // 'teams', 'table'
  const [collapsedTeams, setCollapsedTeams] = useState({});
  const [teamLabelModal, setTeamLabelModal] = useState(null);
  const [teamSelectedLabels, setTeamSelectedLabels] = useState([]);
  const [savingTeamLabels, setSavingTeamLabels] = useState(false);

  // Pending Conversations Modal states
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingSummary, setPendingSummary] = useState(null);
  const [loadingPending, setLoadingPending] = useState(false);
  const [reopenCounts, setReopenCounts] = useState({});
  const [reopeningLabel, setReopeningLabel] = useState(null);
  const [quickReopenLabel, setQuickReopenLabel] = useState('');
  const [quickReopenCount, setQuickReopenCount] = useState(20);
  const [quickReopening, setQuickReopening] = useState(false);
  const [showZeroPendingLabels, setShowZeroPendingLabels] = useState(false);

  const showNotification = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const formatHour12 = (h) => {
    const period = (h >= 12 && h < 24) ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${String(h12).padStart(2, '0')}:00 ${period}`;
  };

  const openShiftModal = (agent) => {
    setShiftModalAgent(agent);
    setShiftStartHour(agent.shift_start ?? 11);
    setShiftEndHour(agent.shift_end ?? 19);
  };

  const closeShiftModal = () => {
    setShiftModalAgent(null);
  };

  const openAgentChatsModal = async (agent) => {
    setAgentChatsModal(agent);
    setLoadingAgentChats(true);
    try {
      const res = await agentsApi.fetchAgentChats(agent.id);
      setAgentChatsList(res.chats || []);
    } catch (err) {
      showNotification('فشل جلب شاتات الموظف', 'error');
      setAgentChatsList([]);
    } finally {
      setLoadingAgentChats(false);
    }
  };

  const closeAgentChatsModal = () => {
    setAgentChatsModal(null);
    setAgentChatsList([]);
  };

  const openPullModal = (agent) => {
    setPullModalAgent(agent);
  };

  const closePullModal = () => {
    setPullModalAgent(null);
  };

  const executePullChats = async () => {
    if (!pullModalAgent) return;
    setPullingChats(true);
    try {
      const res = await agentsApi.pullChats(pullModalAgent.id, null);
      showNotification(res.message || 'تم سحب جميع المحادثات بنجاح', res.unassigned_count > 0 ? 'success' : 'info');
      closePullModal();
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل سحب المحادثات', 'error');
    } finally {
      setPullingChats(false);
    }
  };

  const openBulkLimitModal = () => {
    setBulkLimitValue(10);
    setBulkLimitTarget('sales');
    setBulkLimitModal(true);
  };

  const closeBulkLimitModal = () => {
    setBulkLimitModal(false);
  };

  const handleApplyBulkLimit = async () => {
    setSavingBulkLimit(true);
    try {
      let targetIds = null;
      let team = 'all';
      if (bulkLimitTarget === 'selected') {
        targetIds = filteredAgents.filter(a => a.is_selected).map(a => a.id);
        if (targetIds.length === 0) {
          showNotification('يرجى تحديد موظف واحد على الأقل في الجدول أولاً', 'error');
          setSavingBulkLimit(false);
          return;
        }
      } else if (bulkLimitTarget === 'sales') {
        team = 'Sales';
      }

      const res = await agentsApi.bulkUpdateLimit(bulkLimitValue, team, targetIds);
      showNotification(res.message || `تم تحديد ليمت النصف ساعة (${bulkLimitValue}) بنجاح`);
      closeBulkLimitModal();
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تحديد الليمت', 'error');
    } finally {
      setSavingBulkLimit(false);
    }
  };

  const openBulkDailyLimitModal = () => {
    setBulkDailyLimitValue(100);
    setBulkDailyLimitTarget('sales');
    setBulkDailyLimitModal(true);
  };

  const closeBulkDailyLimitModal = () => {
    setBulkDailyLimitModal(false);
  };

  const handleApplyBulkDailyLimit = async () => {
    setSavingBulkDailyLimit(true);
    try {
      let targetIds = null;
      let team = 'all';
      if (bulkDailyLimitTarget === 'selected') {
        targetIds = filteredAgents.filter(a => a.is_selected).map(a => a.id);
        if (targetIds.length === 0) {
          showNotification('يرجى تحديد موظف واحد على الأقل في الجدول أولاً', 'error');
          setSavingBulkDailyLimit(false);
          return;
        }
      } else if (bulkDailyLimitTarget === 'sales') {
        team = 'Sales';
      }

      const res = await agentsApi.bulkUpdateDailyLimit(bulkDailyLimitValue, team, targetIds);
      showNotification(res.message || `تم تحديد ماكس اليوم (${bulkDailyLimitValue} شات) بنجاح`);
      closeBulkDailyLimitModal();
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تحديد ماكس اليوم', 'error');
    } finally {
      setSavingBulkDailyLimit(false);
    }
  };

  const handleUpdateDailyLimit = async (agent, delta) => {
    const current = agent.daily_chat_limit || 100;
    const newLim = Math.max(1, current + delta);
    try {
      await agentsApi.updateDailyLimit(agent.id, newLim);
      setAgents(prev => prev.map(a => a.id === agent.id ? {
        ...a,
        daily_chat_limit: newLim,
        is_daily_max_reached: ((a.today_chats_count || 0) >= newLim)
      } : a));
      if (delta > 0) {
        showNotification(`➕ تمت زيادة ماكس اليوم لـ ${agent.name} بـ +${delta} شات (الماكس الجديد: ${newLim})`);
      } else {
        showNotification(`تم تحديث ماكس شات اليوم لـ ${agent.name} إلى ${newLim}`);
      }
    } catch (err) {
      showNotification('فشل تحديث ماكس شات اليوم', 'error');
      loadData();
    }
  };

  const handleSaveShift = async () => {
    if (!shiftModalAgent) return;
    setSavingShift(true);
    const startStr = formatHour12(shiftStartHour);
    const endStr = formatHour12(shiftEndHour);
    const shiftText = `${startStr} - ${endStr}`;
    try {
      const res = await agentsApi.updateAgentShift(shiftModalAgent.id, shiftStartHour, shiftEndHour, shiftText);
      showNotification(res.message || 'تم تحديث الشيفت وتثبيت الإذن بنجاح');
      closeShiftModal();
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل حفظ الشيفت', 'error');
    } finally {
      setSavingShift(false);
    }
  };

  const handleResetShift = async (agent) => {
    setSavingShift(true);
    try {
      const res = await agentsApi.resetAgentShift(agent.id);
      showNotification(res.message || 'تمت استعادة شيفت الـ CRM الأصلي');
      closeShiftModal();
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل استعادة شيفت الـ CRM', 'error');
    } finally {
      setSavingShift(false);
    }
  };

  const loadPendingSummary = async (force = false) => {
    setLoadingPending(true);
    try {
      const res = await agentsApi.getPendingSummary(force);
      setPendingSummary(res);
      if (res && Array.isArray(res.labels)) {
        const counts = {};
        res.labels.forEach(l => {
          counts[l.label] = Math.min(20, Math.max(1, l.pending_count || 10));
        });
        setReopenCounts(prev => ({ ...counts, ...prev }));

        // Auto select first label with pending chats for quick reopen
        const firstWithChats = res.labels.find(l => l.pending_count > 0);
        if (firstWithChats) {
          setQuickReopenLabel(prev => prev || firstWithChats.label);
        }
      }
    } catch (err) {
      showNotification('فشل جلب إحصائيات المحادثات المعلقة', 'error');
    } finally {
      setLoadingPending(false);
    }
  };

  const handleReopenLabel = async (label, count) => {
    if (!label) return;
    const num = Number(count);
    if (!num || num <= 0) {
      showNotification('يرجى تحديد عدد شاتات أكبر من صفر', 'error');
      return;
    }
    setReopeningLabel(label);
    try {
      const res = await agentsApi.reopenPending(label, num);
      showNotification(res.message || `تمت إعادة فتح ${res.reopened_count || num} محادثة بنجاح`, 'success');
      // Refresh pending summary
      await loadPendingSummary(true);
      // Refresh general dashboard data & agent stats
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل إعادة فتح المحادثات', 'error');
    } finally {
      setReopeningLabel(null);
    }
  };

  const handleQuickReopen = async () => {
    if (!quickReopenLabel) {
      showNotification('يرجى اختيار التصنيف (Label) أولاً', 'error');
      return;
    }
    setQuickReopening(true);
    try {
      await handleReopenLabel(quickReopenLabel, quickReopenCount);
    } finally {
      setQuickReopening(false);
    }
  };

  const [refreshingCwCounts, setRefreshingCwCounts] = useState(false);

  const handleRefreshChatwootCounts = async () => {
    setRefreshingCwCounts(true);
    try {
      const res = await agentsApi.refreshChatwootCounts();
      showNotification(res.message || 'تم تحديث أرقام الشاتات من شات ووت بنجاح');
      await loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تحديث أرقام شات ووت', 'error');
    } finally {
      setRefreshingCwCounts(false);
    }
  };

  const openBulkLabelsModal = () => {
    // If some agents are checked in table, start with them
    const currentlyChecked = agents.filter(a => a.team === 'Sales' && a.is_selected).map(a => a.id);
    setBulkSelectedAgentIds(currentlyChecked);
    // Smart pre-fill: If any checked agent has labels, use their labels instead of wiping to empty
    const firstWithLabels = agents.find(a => currentlyChecked.includes(a.id) && a.assigned_labels && a.assigned_labels.length > 0);
    if (firstWithLabels && firstWithLabels.assigned_labels) {
      setBulkSelectedLabels([...firstWithLabels.assigned_labels]);
    } else {
      setBulkSelectedLabels([]);
    }
    setBulkAgentSearch('');
    setBulkLabelsModal(true);
  };

  const closeBulkLabelsModal = () => {
    setBulkLabelsModal(false);
    setBulkSelectedAgentIds([]);
    setBulkSelectedLabels([]);
    setBulkAgentSearch('');
  };

  const toggleBulkAgent = (id) => {
    setBulkSelectedAgentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const addBulkAgent = (id) => {
    setBulkSelectedAgentIds(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  const removeBulkAgent = (id) => {
    setBulkSelectedAgentIds(prev => prev.filter(x => x !== id));
  };

  const addAllInShiftToBulk = () => {
    const inShiftIds = agents.filter(a => a.team === 'Sales' && a.in_shift).map(a => a.id);
    setBulkSelectedAgentIds(prev => Array.from(new Set([...prev, ...inShiftIds])));
  };

  const toggleBulkLabel = (lbl) => {
    setBulkSelectedLabels(prev =>
      prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]
    );
  };

  const selectAllSalesInModal = () => {
    const salesIds = agents.filter(a => a.team === 'Sales').map(a => a.id);
    setBulkSelectedAgentIds(salesIds);
  };

  const selectNoneInModal = () => {
    setBulkSelectedAgentIds([]);
  };

  const handleApplyBulkCustomLabels = async () => {
    if (bulkSelectedAgentIds.length === 0) {
      showNotification('يرجى تحديد موظف واحد على الأقل في المجموعة لتطبيق الليبولات عليه', 'error');
      return;
    }

    setSavingBulkLabels(true);
    try {
      const res = await agentsApi.applyPreset(bulkSelectedAgentIds, bulkSelectedLabels);
      showNotification(res.message || `تم بنجاح تحديث وتثبيت تصنيفات ${bulkSelectedAgentIds.length} موظف`);
      closeBulkLabelsModal();
      loadData();
    } catch (err) {
      showNotification(err.message || 'فشل تطبيق التصنيفات', 'error');
    } finally {
      setSavingBulkLabels(false);
    }
  };

  const openTeamLabelModal = (group) => {
    const allLabels = group.agents.map(a => a.assigned_labels || []);
    const firstStr = JSON.stringify([...allLabels[0] || []].sort());
    const allSame = allLabels.every(l => JSON.stringify([...l].sort()) === firstStr);

    if (allSame && allLabels[0]) {
      setTeamSelectedLabels([...allLabels[0]]);
    } else {
      const unionLabels = Array.from(new Set(allLabels.flat()));
      setTeamSelectedLabels(unionLabels);
    }
    setTeamLabelModal(group);
  };

  const closeTeamLabelModal = () => {
    setTeamLabelModal(null);
    setTeamSelectedLabels([]);
  };

  const toggleTeamModalLabel = (lbl) => {
    setTeamSelectedLabels(prev =>
      prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]
    );
  };

  const handleSaveTeamLabels = async () => {
    if (!teamLabelModal) return;
    setSavingTeamLabels(true);
    try {
      const res = await agentsApi.updateTeamLabels(teamLabelModal.rawCoord, teamSelectedLabels);
      showNotification(res.message || `تم بنجاح تحديث تصنيفات ${teamLabelModal.displayName}`);

      setAgents(prev => prev.map(a => {
        const aCoord = (a.coordinator_name || '').trim();
        const isMatch = teamLabelModal.isUnassignedSquad
          ? (!aCoord || aCoord.toLowerCase() === 'none' || aCoord === 'بدون كوردينيتور')
          : (aCoord.toLowerCase() === teamLabelModal.rawCoord.toLowerCase());
        return isMatch ? { ...a, assigned_labels: teamSelectedLabels } : a;
      }));

      closeTeamLabelModal();
    } catch (err) {
      showNotification(err.message || 'فشل تحديث تصنيفات التيم', 'error');
    } finally {
      setSavingTeamLabels(false);
    }
  };

  const toggleTeamCollapse = (teamKey) => {
    setCollapsedTeams(prev => ({
      ...prev,
      [teamKey]: !prev[teamKey]
    }));
  };

  const toggleCollapseAll = (shouldCollapse) => {
    const next = {};
    teamGroups.forEach(g => {
      next[g.key] = shouldCollapse;
    });
    setCollapsedTeams(next);
  };

  const loadData = useCallback(async () => {
    try {
      const [agentsData, statusData, labelsData, logsData] = await Promise.all([
        agentsApi.fetchAgents(),
        agentsApi.fetchStatus(),
        agentsApi.fetchLabels().catch(() => null),
        agentsApi.fetchLogs().catch(() => [])
      ]);
      setAgents(agentsData);
      setStatus(statusData);
      if (labelsData && labelsData.selected_labels && labelsData.selected_labels.length > 0) {
        setAvailableSalesLabels(labelsData.selected_labels);
      }
      if (Array.isArray(logsData)) {
        setRecentLogs(logsData.slice(0, 10));
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadPendingSummary(false);
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, [loadData]);

  const openLabelsModal = (agent) => {
    setLabelModalAgent(agent);
    setModalSelectedLabels(agent.assigned_labels ? [...agent.assigned_labels] : []);
  };

  const closeLabelsModal = () => {
    setLabelModalAgent(null);
    setModalSelectedLabels([]);
  };

  const toggleModalLabel = (lbl) => {
    setModalSelectedLabels(prev =>
      prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]
    );
  };

  const handleSaveAgentLabels = async () => {
    if (!labelModalAgent) return;
    setSavingAgentLabels(true);
    try {
      const res = await agentsApi.updateAgentLabels(labelModalAgent.id, modalSelectedLabels);
      showNotification(res.message || `تم تحديث تصنيفات الموظف ${labelModalAgent.name} بنجاح`);
      setAgents(prev => prev.map(a => a.id === labelModalAgent.id ? { ...a, assigned_labels: modalSelectedLabels } : a));
      closeLabelsModal();
    } catch (err) {
      showNotification(err.message || 'فشل حفظ التصنيفات', 'error');
    } finally {
      setSavingAgentLabels(false);
    }
  };

  // Actions
  const handleToggleSelect = async (agent) => {
    const nextState = !agent.is_selected;
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_selected: nextState ? 1 : 0 } : a));
    try {
      await agentsApi.toggleSelect(agent.id, nextState);
    } catch (err) {
      showNotification('فشل تحديث حالة الاختيار', 'error');
      loadData();
    }
  };

  const handleBulkSelect = async (isSelected) => {
    const targetTeam = deptFilter === 'sales' ? 'Sales' : deptFilter === 'data' ? 'Data' : 'all';
    setAgents(prev => prev.map(a => {
      if (targetTeam === 'all' || a.team === targetTeam) {
        return { ...a, is_selected: isSelected ? 1 : 0 };
      }
      return a;
    }));
    try {
      await agentsApi.bulkSelect(targetTeam, isSelected);
      showNotification(isSelected ? `تم تحديد جميع موظفي ${targetTeam === 'Sales' ? 'السيلز' : targetTeam === 'Data' ? 'الداتا' : 'القسم'}` : `تم إلغاء تحديد موظفي ${targetTeam === 'Sales' ? 'السيلز' : targetTeam === 'Data' ? 'الداتا' : 'القسم'}`);
    } catch (err) {
      showNotification('فشل التحديد الجماعي', 'error');
      loadData();
    }
  };

  const handleBulkSelectFiltered = async (isSelected) => {
    const targetIds = filteredAgents.map(a => a.id);
    if (targetIds.length === 0) return;
    const targetSet = new Set(targetIds);
    setAgents(prev => prev.map(a => targetSet.has(a.id) ? { ...a, is_selected: isSelected ? 1 : 0 } : a));
    try {
      await agentsApi.bulkSelect(null, isSelected, targetIds);
      showNotification(isSelected 
        ? `تم بنجاح تحديد ${targetIds.length} موظف من المعروضين في الفلتر` 
        : `تم بنجاح إلغاء تحديد ${targetIds.length} موظف من المعروضين في الفلتر`);
    } catch (err) {
      showNotification('فشل تحديث التحديد للمجموعة المعروضة', 'error');
      loadData();
    }
  };

  const clearAllFilters = () => {
    setSearch('');
    setFilter('all');
    setShiftFilter('all');
    setCoordinatorFilter('all');
    setLabelFilter('all');
  };

  const handleTogglePause = async (agent) => {
    const nextState = !agent.is_paused;
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_paused: nextState ? 1 : 0 } : a));
    try {
      await agentsApi.togglePause(agent.id, nextState);
      showNotification(nextState ? `تم إيقاف التوزيع لـ ${agent.name} مؤقتاً` : `تم استئناف التوزيع لـ ${agent.name}`);
    } catch (err) {
      showNotification('فشل تحديث حالة الإيقاف', 'error');
      loadData();
    }
  };

  const handleUpdateLimit = async (agent, delta) => {
    const newLimit = Math.max(1, (agent.chat_limit || 10) + delta);
    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, chat_limit: newLimit } : a));
    try {
      await agentsApi.updateLimit(agent.id, newLimit);
      if (delta > 0) {
        showNotification(`➕ تمت زيادة ليمت النصف ساعة لـ ${agent.name} بـ +${delta} (الجديد: ${newLimit})`);
      } else {
        showNotification(`تم تحديث ليمت النصف ساعة لـ ${agent.name} إلى ${newLimit}`);
      }
    } catch (err) {
      showNotification('فشل تعديل الليمت', 'error');
      loadData();
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

  // Base list depending on Department Filter
  const baseAgents = useMemo(() => {
    if (deptFilter === 'sales') {
      return agents.filter(a => a.team === 'Sales');
    }
    if (deptFilter === 'data') {
      return agents.filter(a => a.team === 'Data');
    }
    return agents;
  }, [agents, deptFilter]);

  // Available Shifts extracted dynamically from baseAgents
  const availableShifts = useMemo(() => {
    const counts = {};
    let manualCount = 0;

    baseAgents.forEach(a => {
      if (a.is_manual_shift === 1) {
        manualCount++;
      }
      const s = (a.shift_text || '').trim();
      const key = s || '__none__';
      counts[key] = (counts[key] || 0) + 1;
    });

    const list = Object.keys(counts).sort((a, b) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      if (a.toLowerCase().includes('weekend') && !b.toLowerCase().includes('weekend')) return 1;
      if (!a.toLowerCase().includes('weekend') && b.toLowerCase().includes('weekend')) return -1;
      return counts[b] - counts[a];
    }).map(k => ({
      key: k,
      label: k === '__none__' ? '⚪ غير محدد / بدون شيفت' : (k.toLowerCase().includes('weekend') ? `🌴 إجازة ${k}` : `⏰ شيفت ${k}`),
      count: counts[k]
    }));

    if (manualCount > 0) {
      list.unshift({
        key: '__manual__',
        label: `📝 أذونات يدوية معدلة`,
        count: manualCount
      });
    }

    return list;
  }, [baseAgents]);

  // Available Coordinators extracted dynamically from baseAgents
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
        label = '👑 فريق الكوردينيتورز (إشراف: ندى طارق)';
      } else {
        const ar = COORDINATOR_ARABIC_NAMES[raw.toLowerCase()];
        label = ar ? `فريق ${ar} (${raw})` : `فريق ${raw}`;
      }
      if (!map[key]) {
        map[key] = { key, label, raw, count: 0 };
      }
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

  // Available Labels summary from baseAgents
  const availableLabelsSummary = useMemo(() => {
    const counts = {};
    let customCount = 0;
    let defaultCount = 0;
    baseAgents.forEach(a => {
      const assigned = a.assigned_labels || [];
      if (assigned.length > 0) {
        customCount++;
        assigned.forEach(l => {
          counts[l] = (counts[l] || 0) + 1;
        });
      } else {
        defaultCount++;
      }
    });
    return { customCount, defaultCount, counts };
  }, [baseAgents]);

  // Filter & Search
  const filteredAgents = useMemo(() => {
    const normSearch = normalizeArabic(search);

    return baseAgents.filter(a => {
      // 1. Search matching (Normalized Arabic across all fields)
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

      // 2. Status filter
      if (filter === 'in_shift' && !a.in_shift) return false;
      if (filter === 'out_shift' && a.in_shift) return false;
      if (filter === 'selected' && !a.is_selected) return false;
      if (filter === 'unselected' && a.is_selected) return false;
      if (filter === 'paused' && !a.is_paused) return false;
      if (filter === 'coordinators') {
        const coord = (a.coordinator_name || '').toLowerCase();
        if (!coord.includes('nada tarek')) return false;
      }

      // 3. Shift filter
      if (shiftFilter !== 'all') {
        if (shiftFilter === '__manual__') {
          if (a.is_manual_shift !== 1) return false;
        } else if (shiftFilter === '__none__') {
          if ((a.shift_text || '').trim()) return false;
        } else {
          if ((a.shift_text || '').trim() !== shiftFilter) return false;
        }
      }

      // 4. Coordinator / Team filter
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

      // 5. Labels filter
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

      return true;
    });
  }, [baseAgents, search, filter, shiftFilter, coordinatorFilter, labelFilter]);

  // Group filteredAgents by CRM Coordinator
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
          agents: [],
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

  const getTeamLabelsSummary = (group) => {
    if (!group.agents || group.agents.length === 0) return null;
    const allAssigned = group.agents.map(a => a.assigned_labels || []);
    const allDefault = allAssigned.every(l => l.length === 0);
    if (allDefault) {
      return (
        <span style={{
          fontSize: 11, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399',
          border: '1px solid rgba(16, 185, 129, 0.3)', padding: '3px 8px', borderRadius: 6, fontWeight: 600
        }}>
          🌐 جميع تصنيفات السيلز (الافتراضي)
        </span>
      );
    }

    const firstStr = JSON.stringify([...allAssigned[0]].sort());
    const allSame = allAssigned.every(l => JSON.stringify([...l].sort()) === firstStr);

    if (allSame && allAssigned[0].length > 0) {
      return (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {allAssigned[0].slice(0, 3).map(lbl => (
            <span key={lbl} style={{
              fontSize: 11, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 6px', borderRadius: 4, fontWeight: 600
            }}>
              {lbl}
            </span>
          ))}
          {allAssigned[0].length > 3 && (
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              +{allAssigned[0].length - 3} آخرين
            </span>
          )}
        </div>
      );
    }

    const uniqueLabels = Array.from(new Set(allAssigned.flat()));
    return (
      <span style={{
        fontSize: 11, background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24',
        border: '1px solid rgba(245, 158, 11, 0.3)', padding: '3px 8px', borderRadius: 6, fontWeight: 600
      }} title={uniqueLabels.join(', ')}>
        ⚠️ تصنيفات متنوعة ({uniqueLabels.length > 0 ? `${uniqueLabels.length} تصنيف` : 'مخصص'})
      </span>
    );
  };

  const renderTableHeader = () => (
    <thead>
      <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }}>
        <th style={{ padding: '12px 14px', width: 45 }}>توزيع</th>
        <th style={{ padding: '12px 14px' }}>الموظف</th>
        <th style={{ padding: '12px 14px' }}>الشيفت</th>
        <th style={{ padding: '12px 14px' }}>الحالة</th>
        <th style={{ padding: '12px 14px', textAlign: 'center' }}>النصف ساعة</th>
        <th style={{ padding: '12px 14px', textAlign: 'center' }}>شاتات حالية</th>
        <th style={{ padding: '12px 14px', textAlign: 'center' }}>ماكس اليوم</th>
        <th style={{ padding: '12px 14px', textAlign: 'center' }}>توزيع اليوم</th>
        <th style={{ padding: '12px 14px', textAlign: 'center', color: '#38bdf8' }}>💬 مفتوح بشات ووت</th>
        <th style={{ padding: '12px 14px', textAlign: 'center' }}>الإجراءات</th>
      </tr>
    </thead>
  );

  const renderAgentRow = (agent) => {
    const curr = agent.current_window_chats || 0;
    const lim = agent.chat_limit || 10;
    const isFull = curr >= lim;
    const dailyLim = agent.daily_chat_limit || 100;
    const todayCount = agent.today_chats_count || 0;
    const isDailyFull = Boolean(agent.is_daily_max_reached || todayCount >= dailyLim);

    return (
      <tr
        key={agent.id}
        style={{
          borderBottom: '1px solid #334155',
          background: agent.is_paused ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
          opacity: !agent.is_selected ? 0.6 : 1,
          transition: 'background 0.15s'
        }}
      >
        {/* Select Checkbox */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={Boolean(agent.is_selected)}
            onChange={() => handleToggleSelect(agent)}
            style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#3b82f6' }}
          />
        </td>

        {/* Agent Name */}
        <td style={{ padding: '14px 16px' }}>
          <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 14 }}>
            {agent.name}
          </div>
          {agent.crm_name && agent.crm_name !== agent.name && (
            <div style={{ fontSize: 12, color: '#38bdf8', marginTop: 2 }}>
              CRM: {agent.crm_name}
            </div>
          )}

          {/* Custom Assigned Labels */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {agent.assigned_labels && agent.assigned_labels.length > 0 ? (
              agent.assigned_labels.map(lbl => (
                <span
                  key={lbl}
                  style={{
                    fontSize: 11,
                    background: lbl.includes('بدون') ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    color: lbl.includes('بدون') ? '#fbbf24' : '#60a5fa',
                    border: lbl.includes('بدون') ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontWeight: 600
                  }}
                >
                  {lbl}
                </span>
              ))
            ) : (
              <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                🌐 الكل
              </span>
            )}

            <button
              type="button"
              onClick={() => openLabelsModal(agent)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                color: '#38bdf8',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
              title="تحديد الليبولات المخصصة لهذا الموظف"
            >
              ⚙️ ليبلات
            </button>

            <button
              type="button"
              onClick={() => toggleBulkAgent(agent.id)}
              style={{
                background: bulkSelectedAgentIds.includes(agent.id) ? 'rgba(56, 189, 248, 0.25)' : '#0f172a',
                border: bulkSelectedAgentIds.includes(agent.id) ? '1px solid #38bdf8' : '1px solid #334155',
                color: bulkSelectedAgentIds.includes(agent.id) ? '#38bdf8' : '#94a3b8',
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3
              }}
              title={bulkSelectedAgentIds.includes(agent.id) ? 'إزالة هذا الموظف من المجموعة المحددة' : 'إضافة هذا الموظف للمجموعة المحددة'}
            >
              <span>{bulkSelectedAgentIds.includes(agent.id) ? '✓ في المجموعة' : '+ للمجموعة'}</span>
            </button>
          </div>
        </td>

        {/* Shift Text & Manual Override Button */}
        <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span
                onClick={() => {
                  const s = (agent.shift_text || '').trim();
                  setShiftFilter(prev => prev === (s || '__none__') ? 'all' : (s || '__none__'));
                }}
                style={{
                  fontWeight: 700,
                  color: agent.is_manual_shift === 1 ? '#fbbf24' : '#f8fafc',
                  cursor: 'pointer',
                  borderBottom: '1px dashed rgba(148, 163, 184, 0.5)',
                  paddingBottom: 1
                }}
                title="اضغط للتصفية بهذا الشيفت (أو إلغاء الفلتر)"
              >
                {agent.shift_text || 'غير محدد'}
              </span>
              {agent.is_manual_shift === 1 && (
                <span style={{
                  fontSize: 10, background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24',
                  border: '1px solid #f59e0b', padding: '1px 5px', borderRadius: 4, fontWeight: 700
                }}>
                  📝 إذن يدوي
                </span>
              )}
            </div>
            
            <div>
              <button
                type="button"
                onClick={() => openShiftModal(agent)}
                style={{
                  background: 'transparent', border: 'none', color: '#38bdf8',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                  textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 3
                }}
              >
                ✏️ تعديل الشيفت / إذن
              </button>
            </div>
          </div>
        </td>

        {/* Shift Status Badge */}
        <td style={{ padding: '14px 16px' }}>
          {agent.in_grace_period ? (
            <span style={{
              background: '#78350f', color: '#fcd34d', padding: '4px 10px',
              borderRadius: 6, fontSize: 12, fontWeight: 700
            }} title="فترة سماح أول نصف ساعة من الشيفت - يبدأ التوزيع بعد مرور 30 دقيقة">
              ⏳ فترة سماح (يبدأ :30)
            </span>
          ) : agent.in_shift ? (
            <span style={{
              background: '#064e3b', color: '#34d399', padding: '4px 10px',
              borderRadius: 6, fontSize: 12, fontWeight: 700
            }}>
              🟢 داخل الشيفت
            </span>
          ) : (
            <span style={{
              background: '#1e293b', color: '#94a3b8', padding: '4px 10px',
              borderRadius: 6, fontSize: 12, fontWeight: 600
            }}>
              ⚪ خارج الشيفت
            </span>
          )}
        </td>

        {/* Limit Controls */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => handleUpdateLimit(agent, -1)}
                disabled={lim <= 1}
                style={{
                  width: 26, height: 26, background: '#334155', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: lim <= 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 800, fontSize: 14
                }}
                title="تقليل 1 شات من ليمت النصف ساعة"
              >
                -
              </button>
              <input
                type="number"
                min="1"
                max="500"
                value={lim}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, chat_limit: val } : a));
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10) || 10;
                  agentsApi.updateLimit(agent.id, val).then(() => {
                    showNotification(`تم تحديث ليمت النصف ساعة لـ ${agent.name} إلى ${val}`);
                  }).catch(() => {
                    showNotification('فشل تحديث الليمت', 'error');
                    loadData();
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                style={{
                  width: 44, height: 26, textAlign: 'center', background: '#0f172a',
                  border: '1px solid #334155', borderRadius: 4, color: '#38bdf8',
                  fontWeight: 800, fontSize: 13
                }}
                title="اضغط لتغيير ليمت النصف ساعة مباشرة"
              />
              <button
                onClick={() => handleUpdateLimit(agent, 1)}
                style={{
                  width: 26, height: 26, background: '#334155', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  fontWeight: 800, fontSize: 14
                }}
                title="زيادة 1 شات لليمت النصف ساعة"
              >
                +
              </button>
            </div>
            <div style={{ display: 'inline-flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => handleUpdateLimit(agent, 5)}
                style={{
                  background: '#1e293b', border: '1px solid #0284c7', color: '#38bdf8',
                  padding: '1px 5px', borderRadius: 4, cursor: 'pointer',
                  fontWeight: 700, fontSize: 10
                }}
                title="زيادة سريعة +5 شاتات لليمت النصف ساعة"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => handleUpdateLimit(agent, 10)}
                style={{
                  background: '#1e293b', border: '1px solid #0284c7', color: '#38bdf8',
                  padding: '1px 5px', borderRadius: 4, cursor: 'pointer',
                  fontWeight: 700, fontSize: 10
                }}
                title="زيادة سريعة +10 شاتات لليمت النصف ساعة"
              >
                +10
              </button>
            </div>
          </div>
        </td>

        {/* 30-Min Window Progress */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => openAgentChatsModal(agent)}
            style={{
              background: isFull ? 'rgba(239, 68, 68, 0.15)' : curr > 0 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(51, 65, 85, 0.2)',
              border: isFull ? '1px solid rgba(239, 68, 68, 0.5)' : curr > 0 ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(51, 65, 85, 0.5)',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.2s',
              boxShadow: curr > 0 ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
            }}
            title="اضغط لعرض قائمة الشاتات الموزعة لهذا الموظف اليوم بالتفصيل"
          >
            <div style={{
              fontWeight: 800, fontSize: 14,
              direction: 'ltr', unicodeBidi: 'bidi-override',
              color: isFull ? '#f87171' : curr > 0 ? '#38bdf8' : '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              <span>[ {curr} / {lim} ]</span>
              <span style={{ fontSize: 11 }}>👁️</span>
            </div>
            <div style={{
              width: 75, height: 5, background: '#0f172a',
              borderRadius: 3, overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(100, (curr / lim) * 100)}%`,
                height: '100%',
                background: isFull ? '#ef4444' : '#38bdf8',
                transition: 'width 0.3s'
              }} />
            </div>
          </button>
        </td>

        {/* Daily Max Limit Controls */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => handleUpdateDailyLimit(agent, -10)}
                disabled={dailyLim <= 10}
                style={{
                  width: 28, height: 26, background: '#334155', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: dailyLim <= 10 ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: 11
                }}
                title="تقليل 10 شاتات من ماكس اليوم"
              >
                -10
              </button>
              <input
                type="number"
                min="1"
                max="9999"
                value={dailyLim}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1) {
                    setAgents(prev => prev.map(a => a.id === agent.id ? {
                      ...a, daily_chat_limit: val, is_daily_max_reached: (todayCount >= val)
                    } : a));
                  }
                }}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10) || 100;
                  agentsApi.updateDailyLimit(agent.id, val).then(() => {
                    showNotification(`تم تحديث ماكس شات اليوم لـ ${agent.name} إلى ${val}`);
                  }).catch(() => {
                    showNotification('فشل تحديث ماكس شات اليوم', 'error');
                    loadData();
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.target.blur();
                  }
                }}
                style={{
                  width: 48, height: 26, textAlign: 'center', background: '#0f172a',
                  border: '1px solid #8b5cf6', borderRadius: 4, color: '#c084fc',
                  fontWeight: 800, fontSize: 13
                }}
                title="اضغط لتعديل ماكس شات اليوم مباشرة لأي رقم (مثلاً 110 أو 150)"
              />
              <button
                onClick={() => handleUpdateDailyLimit(agent, 10)}
                style={{
                  width: 28, height: 26, background: '#8b5cf6', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  fontWeight: 800, fontSize: 11
                }}
                title="زيادة 10 شاتات لماكس اليوم (شاتات يدوية)"
              >
                +10
              </button>
              <button
                onClick={() => handleUpdateDailyLimit(agent, 20)}
                style={{
                  width: 28, height: 26, background: '#6d28d9', color: '#fff',
                  border: 'none', borderRadius: 4, cursor: 'pointer',
                  fontWeight: 800, fontSize: 11
                }}
                title="زيادة 20 شات لماكس اليوم (شاتات يدوية)"
              >
                +20
              </button>
            </div>
            <div>
              <button
                type="button"
                onClick={() => handleUpdateDailyLimit(agent, 10)}
                style={{
                  background: 'rgba(139, 92, 246, 0.15)',
                  border: '1px solid rgba(139, 92, 246, 0.5)',
                  color: '#c084fc',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
                title="إضافة 10 شاتات يدوية فوراً لماكس اليوم"
              >
                <span>➕</span>
                <span>+10 شاتات يدوية</span>
              </button>
            </div>
          </div>
        </td>

        {/* Daily Total Chats Progress */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => openAgentChatsModal(agent)}
            style={{
              background: isDailyFull ? 'rgba(239, 68, 68, 0.2)' : todayCount > 0 ? 'rgba(139, 92, 246, 0.15)' : 'rgba(51, 65, 85, 0.2)',
              border: isDailyFull ? '1px solid rgba(239, 68, 68, 0.6)' : todayCount > 0 ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(51, 65, 85, 0.5)',
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'inline-flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.2s',
              boxShadow: todayCount > 0 ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
            }}
            title={isDailyFull ? "تم الوصول للماكس اليومي وتوقف التوزيع لهذا اليوم" : "إجمالي الشاتات التي استلمها الموظف اليوم حتى الآن"}
          >
            <div style={{
              fontWeight: 800, fontSize: 14,
              direction: 'ltr', unicodeBidi: 'bidi-override',
              color: isDailyFull ? '#f87171' : todayCount > 0 ? '#c084fc' : '#94a3b8',
              display: 'flex', alignItems: 'center', gap: 4
            }}>
              {isDailyFull && <span style={{ fontSize: 12 }}>🔒</span>}
              <span>[ {todayCount} / {dailyLim} ]</span>
              <span style={{ fontSize: 11 }}>👁️</span>
            </div>
            <div style={{
              width: 85, height: 5, background: '#0f172a',
              borderRadius: 3, overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(100, (todayCount / dailyLim) * 100)}%`,
                height: '100%',
                background: isDailyFull ? '#ef4444' : '#a855f7',
                transition: 'width 0.3s'
              }} />
            </div>
            {isDailyFull && (
              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 700, marginTop: 2 }}>
                اكتمل ماكس اليوم
              </span>
            )}
          </button>
        </td>

        {/* Chatwoot Report Open Chats */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{
              background: (agent.chatwoot_open_chats || agent.active_chats || 0) > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
              color: (agent.chatwoot_open_chats || agent.active_chats || 0) > 0 ? '#38bdf8' : '#64748b',
              border: (agent.chatwoot_open_chats || agent.active_chats || 0) > 0 ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255,255,255,0.06)',
              padding: '5px 12px', borderRadius: 8,
              fontSize: 13, fontWeight: 800,
              display: 'inline-flex', alignItems: 'center', gap: 5
            }} title="عدد المحادثات المفتوحة حالياً لدى الموظف في شات ووت (من واقع تقرير شات ووت)">
              <span>💬</span>
              <span>{agent.chatwoot_open_chats || agent.active_chats || 0} مفتوح</span>
            </span>
          </div>
        </td>

        {/* Action Buttons */}
        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => openAgentChatsModal(agent)}
              style={{
                background: '#0f172a', color: '#38bdf8', border: '1px solid #334155',
                padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 4
              }}
              title="عرض الشاتات التي وزعت لهذا الموظف اليوم"
            >
              👁️ شاتات اليوم
            </button>

            <button
              onClick={() => handleTogglePause(agent)}
              style={{
                background: agent.is_paused ? '#10b981' : '#f59e0b',
                color: '#fff', border: 'none', padding: '6px 12px',
                borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {agent.is_paused ? '▶️ تشغيل' : '⏸️ إيقاف'}
            </button>

            <button
              onClick={() => openPullModal(agent)}
              style={{
                background: '#ef4444', color: '#fff', border: 'none',
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.15s'
              }}
              title="سحب الشاتات المفتوحة من الموظف وإعادتها للانتظار مع تحديد العدد"
            >
              📥 سحب الشاتات
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const salesCount = useMemo(() => agents.filter(a => a.team === 'Sales').length, [agents]);
  const dataCount = useMemo(() => agents.filter(a => a.team === 'Data').length, [agents]);
  const inShiftCount = useMemo(() => baseAgents.filter(a => a.in_shift).length, [baseAgents]);
  const selectedCount = useMemo(() => baseAgents.filter(a => a.is_selected).length, [baseAgents]);
  const pausedCount = useMemo(() => baseAgents.filter(a => a.is_paused).length, [baseAgents]);

  const isRoutingActive = status?.routing_enabled === true;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 16px' }}>
      
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 24px', borderRadius: 8, color: '#fff', fontWeight: 600,
          background: notification.type === 'error' ? '#ef4444' : notification.type === 'info' ? '#3b82f6' : '#10b981',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {notification.msg}
        </div>
      )}

      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
            ⚡ لوحة توزيع محادثات السيلز (Sales)
          </h1>
          <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 14 }}>
            نظام التوزيع الذكي: 10 شاتات لكل موظف متاح كل نصف ساعة (أقصى سقف بدون تراكم)
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setPendingModalOpen(true);
              loadPendingSummary(false);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff', border: 'none', padding: '10px 18px',
              borderRadius: 8, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.35)',
              transition: 'all 0.2s'
            }}
          >
            <span>📬</span>
            <span>المحادثات المعلقة (Pending)</span>
            {pendingSummary?.total_unassigned_pending !== undefined && (
              <span style={{
                background: 'rgba(0,0,0,0.25)',
                padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 800
              }}>
                {pendingSummary.total_unassigned_pending.toLocaleString()}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/events')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#0284c7',
              color: '#fff', border: 'none', padding: '10px 16px',
              borderRadius: 8, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
              transition: 'all 0.2s'
            }}
          >
            📋 سجل الأحداث
          </button>

          <button
            onClick={handleSyncCrm}
            disabled={syncingCrm}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: syncingCrm ? '#475569' : '#1e293b',
              color: '#38bdf8', border: '1px solid #334155', padding: '10px 16px',
              borderRadius: 8, fontWeight: 700, cursor: syncingCrm ? 'wait' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {syncingCrm ? '⏳ جاري المزامنة...' : '🔄 مزامنة الشيفتات'}
          </button>

          <button
            onClick={handleRefreshChatwootCounts}
            disabled={refreshingCwCounts}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: refreshingCwCounts ? '#475569' : '#0ea5e9',
              color: '#fff', border: 'none', padding: '10px 16px',
              borderRadius: 8, fontWeight: 700, cursor: refreshingCwCounts ? 'wait' : 'pointer',
              boxShadow: '0 2px 8px rgba(14, 165, 233, 0.3)',
              transition: 'all 0.2s'
            }}
            title="تحديث أرقام الشاتات المفتوحة للموظفين من تقرير شات ووت مباشرة"
          >
            {refreshingCwCounts ? '⏳ جاري التحديث...' : '💬 تحديث شات ووت'}
          </button>
        </div>
      </div>

      {/* 🛑 MASTER ROUTING CONTROL BAR */}
      <div style={{
        position: 'sticky',
        top: 10,
        zIndex: 100,
        backdropFilter: 'blur(16px)',
        background: isRoutingActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
        border: isRoutingActive ? '2px solid #10b981' : '2px solid #ef4444',
        borderRadius: 12,
        padding: '14px 20px',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16,
        boxShadow: isRoutingActive ? '0 8px 32px rgba(16, 185, 129, 0.25)' : '0 8px 32px rgba(239, 68, 68, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            background: isRoutingActive ? '#10b981' : '#ef4444',
            boxShadow: isRoutingActive ? '0 0 12px #10b981' : '0 0 12px #ef4444'
          }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: isRoutingActive ? '#10b981' : '#f87171' }}>
              {isRoutingActive ? '🟢 التوزيع التلقائي: شغال' : '⏸️ التوزيع متوقف حالياً'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>
              {isRoutingActive
                ? 'يتم فحص وتوزيع المحادثات للمتواجدين بالشيفت تلقائياً.'
                : 'اضغط تشغيل لبدء توزيع المحادثات على الموظفين المحددين في الشيفت.'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Master Start/Stop Toggle */}
          {isRoutingActive ? (
            <button
              onClick={handleStopRouting}
              disabled={routingRunning}
              style={{
                background: '#ef4444',
                color: '#fff', border: 'none', padding: '10px 22px',
                borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: routingRunning ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 2px 10px rgba(239, 68, 68, 0.4)'
              }}
            >
              {routingRunning ? '⏳ جاري الإيقاف...' : '⏸️ إيقاف التوزيع'}
            </button>
          ) : (
            <button
              onClick={handleStartRouting}
              disabled={routingRunning}
              style={{
                background: '#10b981',
                color: '#fff', border: 'none', padding: '10px 22px',
                borderRadius: 8, fontWeight: 800, fontSize: 14, cursor: routingRunning ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
              }}
            >
              {routingRunning ? '⏳ جاري البدء...' : '▶️ تشغيل التوزيع'}
            </button>
          )}
        </div>
      </div>

      {/* Department Toggle & Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => { setDeptFilter('sales'); setShiftFilter('all'); }}
          style={{
            background: deptFilter === 'sales' ? '#3b82f6' : '#1e293b',
            color: deptFilter === 'sales' ? '#fff' : '#94a3b8',
            border: '1px solid #334155', padding: '10px 20px', borderRadius: 8,
            fontWeight: 800, fontSize: 14, cursor: 'pointer'
          }}
        >
          💼 موظفي السيلز ({salesCount})
        </button>

        <button
          onClick={() => { setDeptFilter('all'); setShiftFilter('all'); }}
          style={{
            background: deptFilter === 'all' ? '#3b82f6' : '#1e293b',
            color: deptFilter === 'all' ? '#fff' : '#94a3b8',
            border: '1px solid #334155', padding: '10px 20px', borderRadius: 8,
            fontWeight: 800, fontSize: 14, cursor: 'pointer'
          }}
        >
          🏢 جميع الحسابات ({agents.length})
        </button>
      </div>

      {/* Stats Cards (Team Pulse) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>الموظفين المعروضين</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f8fafc', marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span>{filteredAgents.length}</span>
            {filteredAgents.length !== baseAgents.length && (
              <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>
                من أصل {baseAgents.length}
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#1e293b', padding: '20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#38bdf8', fontWeight: 600 }}>المحددين للتوزيع (Checkbox)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>{selectedCount}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>في الشيفت الآن (متاحين)</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981', marginTop: 4 }}>{inShiftCount}</div>
        </div>

        <div style={{ background: '#1e293b', padding: '20px', borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#a855f7', fontWeight: 600 }}>شاتات تم توزيعها اليوم</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#c084fc', marginTop: 4 }}>{status?.today_routed ?? 0}</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        background: '#1e293b', padding: '18px 20px', borderRadius: 12, border: '1px solid #334155',
        display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20
      }}>
        {/* Row 1: Status Pills & Global Search */}
        <div style={{
          display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap'
        }}>
          {/* Status Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>الحالة:</span>
            {[
              { id: 'all', label: `الكل (${baseAgents.length})` },
              { id: 'in_shift', label: `🟢 في الشيفت (${inShiftCount})` },
              { id: 'out_shift', label: `⏳ خارج الشيفت (${baseAgents.length - inShiftCount})` },
              { id: 'selected', label: `✅ المحددين (${selectedCount})` },
              { id: 'unselected', label: `❌ المستبعدين (${baseAgents.length - selectedCount})` },
              { id: 'paused', label: `⏸️ الموقوفين (${pausedCount})` },
              { id: 'coordinators', label: `👑 الكوردينيتورز` }
            ].map(f => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  style={{
                    background: active ? '#3b82f6' : '#0f172a',
                    color: active ? '#fff' : '#94a3b8',
                    border: active ? '1px solid #60a5fa' : '1px solid #334155',
                    padding: '6px 12px', borderRadius: 6,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s'
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 360 }}>
            <input
              type="text"
              placeholder="🔍 بحث: الاسم، الكوردينيتور، الشيفت، الليبل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%', background: '#0f172a', border: search ? '1px solid #38bdf8' : '1px solid #334155',
                color: '#fff', padding: '8px 34px 8px 12px', borderRadius: 8, fontSize: 13,
                outline: 'none', transition: 'border-color 0.2s'
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer',
                  fontSize: 14, fontWeight: 800, padding: 2
                }}
                title="مسح نص البحث"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Dropdown Filters & Master Bulk Select */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
          paddingTop: 10, borderTop: '1px solid #334155'
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 1. Coordinator Dropdown Filter */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: coordinatorFilter !== 'all' ? 'rgba(59, 130, 246, 0.15)' : '#0f172a',
              border: coordinatorFilter !== 'all' ? '1px solid #3b82f6' : '1px solid #334155',
              padding: '4px 10px', borderRadius: 8, transition: 'all 0.2s',
              boxShadow: coordinatorFilter !== 'all' ? '0 0 12px rgba(59, 130, 246, 0.25)' : 'none'
            }}>
              <span style={{ fontSize: 13, color: coordinatorFilter !== 'all' ? '#60a5fa' : '#94a3b8', fontWeight: 700 }}>
                👥 الفريق / الكوردينيتور:
              </span>
              <select
                value={coordinatorFilter}
                onChange={(e) => setCoordinatorFilter(e.target.value)}
                style={{
                  background: 'transparent', color: coordinatorFilter !== 'all' ? '#60a5fa' : '#f8fafc',
                  border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="all" style={{ background: '#0f172a', color: '#f8fafc' }}>
                  🌐 كل الفرق والكوردينيتورز ({baseAgents.length})
                </option>
                {availableCoordinators.map(c => (
                  <option key={c.key} value={c.key} style={{ background: '#0f172a', color: '#f8fafc' }}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </select>
              {coordinatorFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCoordinatorFilter('all')}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="إلغاء فلتر الكوردينيتور"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 2. Shift Dropdown Filter */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: shiftFilter !== 'all' ? 'rgba(14, 165, 233, 0.15)' : '#0f172a',
              border: shiftFilter !== 'all' ? '1px solid #38bdf8' : '1px solid #334155',
              padding: '4px 10px', borderRadius: 8, transition: 'all 0.2s',
              boxShadow: shiftFilter !== 'all' ? '0 0 12px rgba(56, 189, 248, 0.25)' : 'none'
            }}>
              <span style={{ fontSize: 13, color: shiftFilter !== 'all' ? '#38bdf8' : '#94a3b8', fontWeight: 700 }}>
                ⏰ الشيفت:
              </span>
              <select
                value={shiftFilter}
                onChange={(e) => setShiftFilter(e.target.value)}
                style={{
                  background: 'transparent', color: shiftFilter !== 'all' ? '#38bdf8' : '#f8fafc',
                  border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="all" style={{ background: '#0f172a', color: '#f8fafc' }}>
                  🌐 كل الشيفتات ({baseAgents.length})
                </option>
                {availableShifts.map(s => (
                  <option key={s.key} value={s.key} style={{ background: '#0f172a', color: '#f8fafc' }}>
                    {s.label} ({s.count})
                  </option>
                ))}
              </select>
              {shiftFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setShiftFilter('all')}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="إلغاء فلتر الشيفت"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 3. Labels Dropdown Filter */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: labelFilter !== 'all' ? 'rgba(168, 85, 247, 0.15)' : '#0f172a',
              border: labelFilter !== 'all' ? '1px solid #a855f7' : '1px solid #334155',
              padding: '4px 10px', borderRadius: 8, transition: 'all 0.2s',
              boxShadow: labelFilter !== 'all' ? '0 0 12px rgba(168, 85, 247, 0.25)' : 'none'
            }}>
              <span style={{ fontSize: 13, color: labelFilter !== 'all' ? '#c084fc' : '#94a3b8', fontWeight: 700 }}>
                🏷️ الليبلات:
              </span>
              <select
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                style={{
                  background: 'transparent', color: labelFilter !== 'all' ? '#c084fc' : '#f8fafc',
                  border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="all" style={{ background: '#0f172a', color: '#f8fafc' }}>
                  🌐 كل تصنيفات الليبلات
                </option>
                <option value="__custom__" style={{ background: '#0f172a', color: '#f8fafc' }}>
                  ⭐ أصحاب ليبلات مخصصة ({availableLabelsSummary.customCount})
                </option>
                <option value="__default__" style={{ background: '#0f172a', color: '#f8fafc' }}>
                  🌐 بدون ليبلات مخصصة / عام ({availableLabelsSummary.defaultCount})
                </option>
                {Object.entries(availableLabelsSummary.counts).map(([lbl, cnt]) => (
                  <option key={lbl} value={lbl} style={{ background: '#0f172a', color: '#f8fafc' }}>
                    🏷️ {lbl} ({cnt})
                  </option>
                ))}
              </select>
              {labelFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setLabelFilter('all')}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 4, width: 20, height: 20, cursor: 'pointer', fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="إلغاء فلتر الليبلات"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Master Bulk Select for whole department */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleBulkSelect(true)}
              style={{
                background: '#0f172a', border: '1px solid #10b981', color: '#34d399',
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
              title="تحديد جميع الموظفين في هذا القسم لتفعيل التوزيع لهم"
            >
              ✅ تحديد الكل
            </button>
            <button
              type="button"
              onClick={() => handleBulkSelect(false)}
              style={{
                background: '#0f172a', border: '1px solid #ef4444', color: '#f87171',
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
              title="إلغاء تحديد جميع الموظفين في هذا القسم لإيقاف التوزيع لهم"
            >
              ❌ إلغاء تحديد الكل
            </button>
          </div>
        </div>

        {/* Row 3: Active Filters Banner & Bulk Actions on Filtered Rows */}
        {(Boolean(search || filter !== 'all' || shiftFilter !== 'all' || coordinatorFilter !== 'all' || labelFilter !== 'all')) && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#93c5fd', fontWeight: 700 }}>
                🎯 المعروض بالفلتر: <b>{filteredAgents.length}</b> من أصل {baseAgents.length} موظف
              </span>
              {coordinatorFilter !== 'all' && (
                <span style={{
                  background: 'rgba(59, 130, 246, 0.25)', color: '#bfdbfe', border: '1px solid #3b82f6',
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  فريق: {availableCoordinators.find(c => c.key === coordinatorFilter)?.label || coordinatorFilter}
                  <button type="button" onClick={() => setCoordinatorFilter('all')} style={{ background: 'none', border: 'none', color: '#bfdbfe', cursor: 'pointer', padding: 0 }}>✕</button>
                </span>
              )}
              {shiftFilter !== 'all' && (
                <span style={{
                  background: 'rgba(14, 165, 233, 0.25)', color: '#bae6fd', border: '1px solid #0284c7',
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  شيفت: {availableShifts.find(s => s.key === shiftFilter)?.label || shiftFilter}
                  <button type="button" onClick={() => setShiftFilter('all')} style={{ background: 'none', border: 'none', color: '#bae6fd', cursor: 'pointer', padding: 0 }}>✕</button>
                </span>
              )}
              {filter !== 'all' && (
                <span style={{
                  background: 'rgba(168, 85, 247, 0.25)', color: '#e9d5ff', border: '1px solid #9333ea',
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  حالة: {filter}
                  <button type="button" onClick={() => setFilter('all')} style={{ background: 'none', border: 'none', color: '#e9d5ff', cursor: 'pointer', padding: 0 }}>✕</button>
                </span>
              )}
              {labelFilter !== 'all' && (
                <span style={{
                  background: 'rgba(234, 179, 8, 0.25)', color: '#fef08a', border: '1px solid #ca8a04',
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  ليبل: {labelFilter}
                  <button type="button" onClick={() => setLabelFilter('all')} style={{ background: 'none', border: 'none', color: '#fef08a', cursor: 'pointer', padding: 0 }}>✕</button>
                </span>
              )}
              {search && (
                <span style={{
                  background: 'rgba(16, 185, 129, 0.25)', color: '#a7f3d0', border: '1px solid #059669',
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4
                }}>
                  بحث: "{search}"
                  <button type="button" onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#a7f3d0', cursor: 'pointer', padding: 0 }}>✕</button>
                </span>
              )}
            </div>

            {/* Quick Actions on the filtered subset */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => handleBulkSelectFiltered(true)}
                disabled={filteredAgents.length === 0}
                style={{
                  background: '#047857', border: '1px solid #10b981', color: '#fff',
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  cursor: filteredAgents.length === 0 ? 'not-allowed' : 'pointer'
                }}
                title="تحديد موظفي الفلتر الحالي فقط للمشاركة في التوزيع"
              >
                ☑️ تحديد المعروضين فقط ({filteredAgents.length})
              </button>
              <button
                type="button"
                onClick={() => handleBulkSelectFiltered(false)}
                disabled={filteredAgents.length === 0}
                style={{
                  background: '#b91c1c', border: '1px solid #ef4444', color: '#fff',
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  cursor: filteredAgents.length === 0 ? 'not-allowed' : 'pointer'
                }}
                title="إلغاء تحديد موظفي الفلتر الحالي فقط وإيقاف التوزيع لهم"
              >
                ⬜ إلغاء تحديد المعروضين ({filteredAgents.length})
              </button>
              <button
                type="button"
                onClick={clearAllFilters}
                style={{
                  background: '#334155', border: '1px solid #475569', color: '#f1f5f9',
                  padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
                title="إلغاء جميع الفلاتر والبحث والرجوع للكل"
              >
                🔄 مسح كل الفلاتر
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Operations & View Controls Toolbar */}
      <div style={{
        background: '#0f172a', padding: '12px 18px', borderRadius: 10, border: '1px solid #334155',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16
      }}>
        {/* View Mode Toggle */}
        <div style={{
          display: 'inline-flex', background: '#1e293b', padding: 3, borderRadius: 8, border: '1px solid #334155'
        }}>
          <button
            type="button"
            onClick={() => setViewMode('teams')}
            style={{
              background: viewMode === 'teams' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'transparent',
              color: viewMode === 'teams' ? '#fff' : '#94a3b8',
              border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >
            <span>🗂️</span>
            <span>حسب التيم ({teamGroups.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            style={{
              background: viewMode === 'table' ? 'linear-gradient(135deg, #0284c7, #2563eb)' : 'transparent',
              color: viewMode === 'table' ? '#fff' : '#94a3b8',
              border: 'none', padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: 6
            }}
          >
            <span>📄</span>
            <span>الجدول الكامل ({filteredAgents.length})</span>
          </button>
        </div>

        {/* Expand / Collapse All (in teams view) */}
        {viewMode === 'teams' && (
          <div style={{ display: 'inline-flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => toggleCollapseAll(false)}
              style={{
                background: '#1e293b', border: '1px solid #334155', color: '#38bdf8',
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4
              }}
              title="فتح جميع كروت التيمات"
            >
              <span>🔽</span>
              <span>فتح الكل</span>
            </button>
            <button
              type="button"
              onClick={() => toggleCollapseAll(true)}
              style={{
                background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
                padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4
              }}
              title="طي جميع كروت التيمات"
            >
              <span>🔼</span>
              <span>طي الكل</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={openBulkLabelsModal}
          style={{
            background: 'linear-gradient(135deg, #0284c7, #38bdf8)', border: 'none', color: '#0f172a',
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 2px 10px rgba(56, 189, 248, 0.35)'
          }}
          title="إدارة وتخصيص الليبولات لأي مجموعة موظفين معاً"
        >
          <span style={{ fontSize: 16 }}>🏷️</span>
          <span>ليبلات المجموعة {bulkSelectedAgentIds.length > 0 ? `(${bulkSelectedAgentIds.length})` : ''}</span>
        </button>

        <div style={{ marginRight: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            onClick={openBulkLimitModal}
            style={{
              background: '#0284c7', border: 'none', color: '#fff',
              padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)'
            }}
            title="تحديد ليمت النصف ساعة دفعة واحدة للموظفين"
          >
            ⏱️ ليمت النصف ساعة
          </button>
          <button
            type="button"
            onClick={openBulkDailyLimitModal}
            style={{
              background: '#8b5cf6', border: 'none', color: '#fff',
              padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
            }}
            title="تحديد ماكس شات اليوم دفعة واحدة لجميع الموظفين"
          >
            🎯 ماكس اليوم
          </button>
        </div>
      </div>

      {/* Active Shift Filter Notification Banner */}
      {shiftFilter !== 'all' && (
        <div style={{
          background: 'rgba(14, 165, 233, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.4)',
          borderRadius: 10,
          padding: '10px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>⏰</span>
            <span style={{ fontSize: 14, color: '#f8fafc', fontWeight: 600 }}>
              يتم الآن عرض موظفي:{' '}
              <strong style={{ color: '#38bdf8' }}>
                {availableShifts.find(s => s.key === shiftFilter)?.label || shiftFilter}
              </strong>{' '}
              ({filteredAgents.length} موظف)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShiftFilter('all')}
            style={{
              background: '#0f172a',
              border: '1px solid #38bdf8',
              color: '#38bdf8',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <span>إلغاء فلتر الشيفت (عرض الكل)</span>
            <span>✕</span>
          </button>
        </div>
      )}

      {/* Agents Rendering (Teams Accordion vs Flat Table) */}
      {loading ? (
        <div style={{
          background: '#1e293b', borderRadius: 12, border: '1px solid #334155',
          padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 16
        }}>
          ⏳ جاري تحميل الموظفين...
        </div>
      ) : filteredAgents.length === 0 ? (
        <div style={{
          background: '#1e293b', borderRadius: 12, border: '1px solid #334155',
          padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 15
        }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>لا توجد بيانات مطابقة للبحث أو التصفية الحالية</div>
          {(shiftFilter !== 'all' || filter !== 'all' || search) && (
            <button
              onClick={() => { setShiftFilter('all'); setFilter('all'); setSearch(''); }}
              style={{
                marginTop: 12, background: '#3b82f6', color: '#fff', border: 'none',
                padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer'
              }}
            >
              إلغاء جميع الفلاتر وعرض الموظفين
            </button>
          )}
        </div>
      ) : viewMode === 'teams' ? (
        /* 🗂️ Teams Accordion View */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {teamGroups.map(group => {
            const isCollapsed = Boolean(collapsedTeams[group.key]);
            const inShiftAgents = group.agents.filter(a => a.in_shift).length;
            const totalGroupChats = group.agents.reduce((sum, a) => sum + (a.today_chats_count || 0), 0);

            return (
              <div
                key={group.key}
                style={{
                  background: '#1e293b',
                  borderRadius: 12,
                  border: group.isCoordinatorSquad ? '2px solid #eab308' : '1px solid #334155',
                  overflow: 'hidden',
                  boxShadow: group.isCoordinatorSquad
                    ? '0 4px 20px rgba(234, 179, 8, 0.15)'
                    : '0 4px 12px rgba(0,0,0,0.2)',
                  transition: 'border-color 0.2s'
                }}
              >
                {/* Team Card Header */}
                <div
                  onClick={() => toggleTeamCollapse(group.key)}
                  style={{
                    padding: '14px 20px',
                    background: group.isCoordinatorSquad
                      ? 'linear-gradient(90deg, rgba(234, 179, 8, 0.18) 0%, rgba(15, 23, 42, 0.95) 100%)'
                      : '#0f172a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    borderBottom: isCollapsed ? 'none' : '1px solid #334155',
                    userSelect: 'none',
                    transition: 'background 0.2s'
                  }}
                >
                  {/* Left: Indicator, Icon, Name, Stats */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 14,
                      color: group.isCoordinatorSquad ? '#fef08a' : '#94a3b8',
                      display: 'inline-block',
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s'
                    }}>
                      ▼
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>
                        {group.isCoordinatorSquad ? '👑' : group.isUnassignedSquad ? '📋' : '👥'}
                      </span>
                      <h3 style={{
                        margin: 0,
                        fontSize: 16,
                        fontWeight: 800,
                        color: group.isCoordinatorSquad ? '#fef08a' : '#f8fafc'
                      }}>
                        {group.displayName}
                      </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        background: 'rgba(255,255,255,0.06)', color: '#cbd5e1',
                        padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700
                      }}>
                        {group.agents.length} موظف
                      </span>

                      <span style={{
                        background: inShiftAgents > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                        color: inShiftAgents > 0 ? '#34d399' : '#94a3b8',
                        padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                        border: inShiftAgents > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(100, 116, 139, 0.3)'
                      }}>
                        🟢 {inShiftAgents} في الشيفت الآن
                      </span>

                      <span style={{
                        background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc',
                        padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                        border: '1px solid rgba(139, 92, 246, 0.3)'
                      }}>
                        📊 {totalGroupChats} شات اليوم
                      </span>
                    </div>
                  </div>

                  {/* Right: Team Labels Preview & Bulk Team Label Button */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {getTeamLabelsSummary(group)}
                    </div>

                    <button
                      type="button"
                      onClick={() => openTeamLabelModal(group)}
                      style={{
                        background: group.isCoordinatorSquad
                          ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                          : 'linear-gradient(135deg, #0284c7, #2563eb)',
                        color: '#fff',
                        border: 'none',
                        padding: '7px 16px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                        transition: 'all 0.15s'
                      }}
                      title={`تحديد واختيار الليبلات لجميع أفراد ${group.displayName} بضغطة واحدة`}
                    >
                      <span>🏷️</span>
                      <span>تحديد ليبلات التيم</span>
                    </button>
                  </div>
                </div>

                {/* Team Table (when expanded) */}
                {!isCollapsed && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', textAlign: 'right', fontSize: 14 }}>
                      {renderTableHeader()}
                      <tbody>
                        {group.agents.map(agent => renderAgentRow(agent))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* 📄 Unified Flat Table View */
        <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1100, borderCollapse: 'collapse', textAlign: 'right', fontSize: 14 }}>
              {renderTableHeader()}
              <tbody>
                {filteredAgents.map(agent => renderAgentRow(agent))}
              </tbody>
            </table>
          </div>
        </div>
      )}


      {/* 📡 LIVE ACTIVITY RADAR */}
      <div style={{
        marginTop: 24, background: '#0f172a', border: '1px solid #334155', borderRadius: 12, padding: '16px 20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', background: '#10b981',
              boxShadow: '0 0 10px #10b981'
            }} />
            <span style={{ fontWeight: 800, fontSize: 15, color: '#f8fafc' }}>
              📡 رادار التوزيع المباشر (Live Routing Feed)
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              (آخر العمليات الموزعة لحظياً)
            </span>
          </div>

          <span style={{ fontSize: 12, color: '#64748b' }}>
            تحديث تلقائي كل 10 ثوانٍ ⏱️
          </span>
        </div>

        {recentLogs.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 13, background: '#1e293b', borderRadius: 8 }}>
            لا توجد محادثات تم توزيعها مؤخراً اليوم. المحادثات الموزعة ستظهر هنا تلقائياً.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
            {recentLogs.map((log) => {
              const timeStr = log.assigned_at ? log.assigned_at.split('T')[1]?.substring(0, 5) : '';
              return (
                <div
                  key={log.id}
                  style={{
                    minWidth: 220, background: '#1e293b', border: '1px solid #334155', borderRadius: 8,
                    padding: '10px 14px', flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                    <span>💬 #{log.conv_id}</span>
                    <span style={{ fontWeight: 700, color: '#38bdf8' }}>{timeStr}</span>
                  </div>
                  <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    👤 {log.agent_name || 'موظف'}
                  </div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 10,
                      background: log.label?.includes('بدون') ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                      color: log.label?.includes('بدون') ? '#fbbf24' : '#60a5fa',
                      border: log.label?.includes('بدون') ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
                      padding: '1px 6px', borderRadius: 4, fontWeight: 700
                    }}>
                      {log.label || 'عام'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Team Labels Customization Modal */}
      {teamLabelModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b',
            border: teamLabelModal.isCoordinatorSquad ? '2px solid #eab308' : '1px solid #334155',
            borderRadius: 16, maxWidth: 660, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)', animation: 'scaleUp 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{teamLabelModal.isCoordinatorSquad ? '👑' : '🏷️'}</span>
                  <span>تحديد ليبلات: {teamLabelModal.displayName}</span>
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
                  اختر التصنيفات التي يستقبلها جميع أفراد هذا التيم ({teamLabelModal.agents.length} موظف). سيتم تطبيق هذا التحديد على كافة أفراد التيم، مع بقاء إمكانية تعديل أي موظف بشكل منفصل في أي وقت.
                </p>
              </div>
              <button
                type="button"
                onClick={closeTeamLabelModal}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Quick selection bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setTeamSelectedLabels([...availableSalesLabels, 'بدون ليبل (Unlabeled)'])}
                style={{
                  background: '#0f172a', border: '1px solid #334155', color: '#38bdf8',
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                ✅ تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setTeamSelectedLabels([])}
                style={{
                  background: '#0f172a', border: '1px solid #334155', color: '#cbd5e1',
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                🌐 تفريغ (استقبال جميع التصنيفات تلقائياً)
              </button>
            </div>

            {/* Labels Checklist Grid */}
            <div style={{
              maxHeight: 280, overflowY: 'auto', background: '#0f172a',
              border: '1px solid #334155', borderRadius: 10, padding: 14,
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10,
              marginBottom: 20
            }}>
              {/* Unlabeled option */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: teamSelectedLabels.includes('بدون ليبل (Unlabeled)') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                border: teamSelectedLabels.includes('بدون ليبل (Unlabeled)') ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                color: teamSelectedLabels.includes('بدون ليبل (Unlabeled)') ? '#38bdf8' : '#cbd5e1'
              }}>
                <input
                  type="checkbox"
                  checked={teamSelectedLabels.includes('بدون ليبل (Unlabeled)')}
                  onChange={() => toggleTeamModalLabel('بدون ليبل (Unlabeled)')}
                  style={{ accentColor: '#38bdf8', width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 700 }}>📥 بدون ليبل (Unlabeled)</span>
              </label>

              {availableSalesLabels.map(lbl => {
                const isChecked = teamSelectedLabels.includes(lbl);
                return (
                  <label
                    key={lbl}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: isChecked ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                      color: isChecked ? '#60a5fa' : '#cbd5e1'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleTeamModalLabel(lbl)}
                      style={{ accentColor: '#3b82f6', width: 16, height: 16 }}
                    />
                    <span style={{ fontWeight: 600 }}>🏷️ {lbl}</span>
                  </label>
                );
              })}
            </div>

            {/* Selected summary note */}
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
              {teamSelectedLabels.length === 0 ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>
                  🌐 التيم بالكامل سيستقبل جميع تصنيفات السيلز (الوضع العام الافتراضي).
                </span>
              ) : (
                <span>
                  تم تحديد <strong>{teamSelectedLabels.length}</strong> تصنيف للتيم بالكامل: {' '}
                  <span style={{ color: '#38bdf8', fontWeight: 700 }}>{teamSelectedLabels.join(' ، ')}</span>
                </span>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={closeTeamLabelModal}
                style={{
                  background: '#334155', border: 'none', color: '#fff',
                  padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveTeamLabels}
                disabled={savingTeamLabels}
                style={{
                  background: teamLabelModal.isCoordinatorSquad
                    ? 'linear-gradient(135deg, #eab308, #ca8a04)'
                    : 'linear-gradient(135deg, #0284c7, #2563eb)',
                  border: 'none', color: '#fff',
                  padding: '9px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: savingTeamLabels ? 'not-allowed' : 'pointer',
                  opacity: savingTeamLabels ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', gap: 8,
                  boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}
              >
                {savingTeamLabels ? 'جاري الحفظ للتيم...' : `💾 حفظ وتطبيق على التيم (${teamLabelModal.agents.length} موظف)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Labels Customization Modal */}
      {labelModalAgent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
            maxWidth: 640, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)', animation: 'scaleUp 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                  🏷️ تخصيص ليبولات الموظف: {labelModalAgent.name}
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
                  حدد الليبولات التي يستقبلها هذا الموظف فقط. إذا لم تحدد أي ليبل، سيستقبل <strong>جميع تصنيفات السيلز</strong> افتراضياً.
                </p>
              </div>
              <button
                type="button"
                onClick={closeLabelsModal}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Quick selection bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setModalSelectedLabels([...availableSalesLabels, 'بدون ليبل (Unlabeled)'])}
                style={{
                  background: '#0f172a', border: '1px solid #334155', color: '#38bdf8',
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }}
              >
                ✅ تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setModalSelectedLabels([])}
                style={{
                  background: '#0f172a', border: '1px solid #334155', color: '#cbd5e1',
                  padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}
              >
                🌐 تفريغ (استقبال جميع التصنيفات تلقائياً)
              </button>
            </div>

            {/* Labels Checklist Grid */}
            <div style={{
              maxHeight: 280, overflowY: 'auto', background: '#0f172a',
              border: '1px solid #334155', borderRadius: 10, padding: 14,
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10,
              marginBottom: 20
            }}>
              {/* Unlabeled option */}
              <label style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: modalSelectedLabels.includes('بدون ليبل (Unlabeled)') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                border: modalSelectedLabels.includes('بدون ليبل (Unlabeled)') ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                color: modalSelectedLabels.includes('بدون ليبل (Unlabeled)') ? '#38bdf8' : '#cbd5e1'
              }}>
                <input
                  type="checkbox"
                  checked={modalSelectedLabels.includes('بدون ليبل (Unlabeled)')}
                  onChange={() => toggleModalLabel('بدون ليبل (Unlabeled)')}
                  style={{ accentColor: '#38bdf8', width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 700 }}>📥 بدون ليبل (Unlabeled)</span>
              </label>

              {availableSalesLabels.map(lbl => {
                const isChecked = modalSelectedLabels.includes(lbl);
                return (
                  <label
                    key={lbl}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                      border: isChecked ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                      padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                      color: isChecked ? '#60a5fa' : '#cbd5e1'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleModalLabel(lbl)}
                      style={{ accentColor: '#3b82f6', width: 16, height: 16 }}
                    />
                    <span style={{ fontWeight: 600 }}>🏷️ {lbl}</span>
                  </label>
                );
              })}
            </div>

            {/* Selected summary note */}
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
              {modalSelectedLabels.length === 0 ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>
                  🌐 الوضع الحالي: يستقبل جميع تصنيفات السيلز (الوضع العام الافتراضي).
                </span>
              ) : (
                <span>
                  تم تحديد <strong style={{ color: '#38bdf8' }}>{modalSelectedLabels.length}</strong> تصنيف خاص لهذا الموظف فقط. لن يستقبل أي شات خارج هذه التصنيفات.
                </span>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                onClick={closeLabelsModal}
                disabled={savingAgentLabels}
                style={{
                  background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                  padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveAgentLabels}
                disabled={savingAgentLabels}
                style={{
                  background: '#3b82f6', border: 'none', color: '#fff',
                  padding: '10px 24px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: savingAgentLabels ? 'wait' : 'pointer',
                  boxShadow: '0 2px 10px rgba(59, 130, 246, 0.4)'
                }}
              >
                {savingAgentLabels ? '⏳ جاري الحفظ...' : '💾 حفظ التخصيص'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Custom Labels Modal */}
      {bulkLabelsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #38bdf8', borderRadius: 16,
            maxWidth: 680, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)', animation: 'scaleUp 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, color: '#f8fafc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🏷️</span>
                  <span>تخصيص ليبولات لمجموعة ({bulkSelectedAgentIds.length} موظف)</span>
                </h2>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 12 }}>
                  حدد أعضاء المجموعة والتصنيفات التي سيستقبلونها حصرياً.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkLabelsModal}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Step 1: Manage Group Members */}
            <div style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
              padding: '12px 14px', marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#f8fafc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>👥 1. أعضاء المجموعة:</span>
                  <span style={{ color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                    {bulkSelectedAgentIds.length} موظف
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={addAllInShiftToBulk}
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#34d399',
                      padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                    title="إضافة كل الموظفين الموجودين في الشيفت الآن"
                  >
                    🟢 + شغالين بالشيفت
                  </button>
                  <button
                    type="button"
                    onClick={selectAllSalesInModal}
                    style={{
                      background: '#1e293b', border: '1px solid #38bdf8', color: '#38bdf8',
                      padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    👥 + كل السيلز
                  </button>
                  <button
                    type="button"
                    onClick={selectNoneInModal}
                    style={{
                      background: '#1e293b', border: '1px solid #ef4444', color: '#f87171',
                      padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    🗑️ تفريغ
                  </button>
                </div>
              </div>

              {/* Two Column Layout: Current Members vs Add More */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {/* Column 1: Current Members (with remove button) */}
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 10, border: '1px solid #334155' }}>
                  <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span>✓ في المجموعة حالياً ({bulkSelectedAgentIds.length})</span>
                  </div>
                  <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {bulkSelectedAgentIds.length === 0 ? (
                      <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: '25px 0' }}>
                        المجموعة فارغة. أضف موظفين من القائمة المقابلة.
                      </div>
                    ) : (
                      bulkSelectedAgentIds.map(id => {
                        const ag = agents.find(a => a.id === id);
                        if (!ag) return null;
                        return (
                          <div
                            key={ag.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)',
                              padding: '4px 8px', borderRadius: 6, fontSize: 11
                            }}
                          >
                            <span style={{ color: '#e2e8f0', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ag.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeBulkAgent(ag.id)}
                              style={{
                                background: 'rgba(239, 68, 68, 0.2)', border: 'none', color: '#f87171',
                                borderRadius: 4, width: 20, height: 20, cursor: 'pointer', display: 'flex',
                                alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0
                              }}
                              title="حذف من المجموعة"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 2: Available Agents to Add */}
                <div style={{ background: '#1e293b', borderRadius: 8, padding: 10, border: '1px solid #334155' }}>
                  <input
                    type="text"
                    placeholder="🔍 بحث لإضافة موظف..."
                    value={bulkAgentSearch}
                    onChange={(e) => setBulkAgentSearch(e.target.value)}
                    style={{
                      width: '100%', background: '#0f172a', border: '1px solid #334155',
                      color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: 11, marginBottom: 8, outline: 'none'
                    }}
                  />
                  <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {agents
                      .filter(a => a.team === 'Sales')
                      .filter(a => !bulkSelectedAgentIds.includes(a.id))
                      .filter(a => !bulkAgentSearch.trim() || a.name.toLowerCase().includes(bulkAgentSearch.toLowerCase()) || (a.crm_name && a.crm_name.toLowerCase().includes(bulkAgentSearch.toLowerCase())))
                      .slice(0, 50)
                      .map(ag => (
                        <div
                          key={ag.id}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                            padding: '4px 8px', borderRadius: 6, fontSize: 11
                          }}
                        >
                          <span style={{ color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ag.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => addBulkAgent(ag.id)}
                            style={{
                              background: 'rgba(16, 185, 129, 0.2)', border: 'none', color: '#34d399',
                              borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 10,
                              fontWeight: 700, flexShrink: 0
                            }}
                          >
                            + إضافة
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: Select Labels */}
            <div style={{
              background: '#0f172a', border: '1px solid #334155', borderRadius: 12,
              padding: '12px 14px', marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontSize: 13, color: '#f8fafc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>🏷️ 2. اختيار الليبولات للمجموعة:</span>
                  <span style={{ color: '#34d399', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                    {bulkSelectedLabels.length} ليبل
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedLabels([...availableSalesLabels, 'بدون ليبل (Unlabeled)'])}
                    style={{
                      background: '#1e293b', border: '1px solid #38bdf8', color: '#38bdf8',
                      padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    ✅ تحديد الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkSelectedLabels([])}
                    style={{
                      background: '#1e293b', border: '1px solid #334155', color: '#cbd5e1',
                      padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    🌐 بدون تخصيص (الكل)
                  </button>
                </div>
              </div>

              {/* Labels Checklist Grid */}
              <div style={{
                maxHeight: 160, overflowY: 'auto',
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6
              }}>
                {/* Unlabeled option */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: bulkSelectedLabels.includes('بدون ليبل (Unlabeled)') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.03)',
                  border: bulkSelectedLabels.includes('بدون ليبل (Unlabeled)') ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                  color: bulkSelectedLabels.includes('بدون ليبل (Unlabeled)') ? '#38bdf8' : '#cbd5e1'
                }}>
                  <input
                    type="checkbox"
                    checked={bulkSelectedLabels.includes('بدون ليبل (Unlabeled)')}
                    onChange={() => toggleBulkLabel('بدون ليبل (Unlabeled)')}
                    style={{ accentColor: '#38bdf8', width: 15, height: 15 }}
                  />
                  <span style={{ fontWeight: 700 }}>📥 بدون ليبل (Unlabeled)</span>
                </label>

                {availableSalesLabels.map(lbl => {
                  const isChecked = bulkSelectedLabels.includes(lbl);
                  return (
                    <label
                      key={lbl}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: isChecked ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                        border: isChecked ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.06)',
                        padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                        color: isChecked ? '#60a5fa' : '#cbd5e1'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleBulkLabel(lbl)}
                        style={{ accentColor: '#3b82f6', width: 15, height: 15 }}
                      />
                      <span style={{ fontWeight: 600 }}>🏷️ {lbl}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Selected summary note */}
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 16 }}>
              {bulkSelectedLabels.length === 0 ? (
                <span style={{ color: '#10b981', fontWeight: 600 }}>
                  🌐 لم يتم اختيار تصنيفات معينة: سيستقبل أعضاء المجموعة جميع تصنيفات السيلز (الوضع العام).
                </span>
              ) : (
                <span>
                  سيتم تعيين <strong style={{ color: '#38bdf8' }}>{bulkSelectedLabels.length}</strong> تصنيف لـ <strong style={{ color: '#34d399' }}>{bulkSelectedAgentIds.length}</strong> موظف بالمجموعة.
                </span>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={closeBulkLabelsModal}
                disabled={savingBulkLabels}
                style={{
                  background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                  padding: '8px 16px', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyBulkCustomLabels}
                disabled={savingBulkLabels || bulkSelectedAgentIds.length === 0}
                style={{
                  background: 'linear-gradient(135deg, #0284c7, #38bdf8)', border: 'none', color: '#0f172a',
                  padding: '8px 20px', borderRadius: 8, fontWeight: 800, fontSize: 12,
                  cursor: (savingBulkLabels || bulkSelectedAgentIds.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: bulkSelectedAgentIds.length === 0 ? 0.6 : 1,
                  boxShadow: '0 2px 10px rgba(56, 189, 248, 0.4)'
                }}
              >
                {savingBulkLabels ? '⏳ جاري الحفظ...' : `💾 حفظ وتطبيق (${bulkSelectedAgentIds.length} موظف)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Override Modal */}
      {shiftModalAgent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
            maxWidth: 520, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)', animation: 'scaleUp 0.2s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                  ✏️ تعديل الشيفت / إذن لموظف: {shiftModalAgent.name}
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
                  حدد مواعيد الشيفت الجديدة (مثلاً إذن واتساب). لن يقوم الـ CRM بمسح هذا التعديل اليدوي.
                </p>
              </div>
              <button
                type="button"
                onClick={closeShiftModal}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#0f172a', padding: '16px', borderRadius: 10, border: '1px solid #334155', marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
                    بداية الشيفت:
                  </label>
                  <select
                    value={shiftStartHour}
                    onChange={(e) => setShiftStartHour(Number(e.target.value))}
                    style={{
                      width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#fff',
                      padding: '8px 12px', borderRadius: 6, fontSize: 14, fontWeight: 700
                    }}
                  >
                    {Array.from({ length: 24 }).map((_, h) => (
                      <option key={h} value={h}>{formatHour12(h)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
                    نهاية الشيفت:
                  </label>
                  <select
                    value={shiftEndHour}
                    onChange={(e) => setShiftEndHour(Number(e.target.value))}
                    style={{
                      width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#fff',
                      padding: '8px 12px', borderRadius: 6, fontSize: 14, fontWeight: 700
                    }}
                  >
                    {Array.from({ length: 25 }).map((_, h) => (
                      <option key={h} value={h === 0 ? 24 : h}>{formatHour12(h === 0 ? 24 : h)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ background: '#1e293b', padding: '10px 14px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>الموعد المختار:</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>
                  {formatHour12(shiftStartHour)} - {formatHour12(shiftEndHour)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                {shiftModalAgent.is_manual_shift === 1 && (
                  <button
                    type="button"
                    onClick={() => handleResetShift(shiftModalAgent)}
                    disabled={savingShift}
                    style={{
                      background: 'transparent', border: '1px solid #f59e0b', color: '#fbbf24',
                      padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    🔄 استعادة شيفت الـ CRM
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={closeShiftModal}
                  disabled={savingShift}
                  style={{
                    background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                    padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSaveShift}
                  disabled={savingShift}
                  style={{
                    background: '#10b981', border: 'none', color: '#fff',
                    padding: '8px 20px', borderRadius: 6, fontSize: 13, fontWeight: 800,
                    cursor: savingShift ? 'wait' : 'pointer', boxShadow: '0 2px 10px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  {savingShift ? '⏳ جاري الحفظ...' : '💾 حفظ وتثبيت الإذن'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Today's Chats Modal */}
      {agentChatsModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
            maxWidth: 860, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #334155', background: '#0f172a',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>📋 شاتات اليوم الموزعة للموظف:</span>
                  <span style={{ color: '#38bdf8' }}>{agentChatsModal.name}</span>
                  <span style={{
                    fontSize: 12, background: '#1e293b', color: '#38bdf8',
                    padding: '2px 10px', borderRadius: 12, border: '1px solid #334155', fontWeight: 800
                  }}>
                    {agentChatsList.length} شات
                  </span>
                </h2>
                <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
                  قائمة بجميع المحادثات المخزنة في قاعدة البيانات التي استلمها هذا الموظف اليوم مع الليبول والتوقيت ورابط مباشر لشات ووت.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAgentChatsModal}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            {/* Modal Content / Table */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {loadingAgentChats ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
                  ⏳ جاري تحميل سجل شاتات الموظف من قاعدة البيانات...
                </div>
              ) : agentChatsList.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: 40, color: '#94a3b8',
                  background: '#0f172a', borderRadius: 10, border: '1px solid #334155'
                }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#cbd5e1' }}>
                    لم يستلم الموظف أي محادثات موزعة اليوم حتى الآن
                  </div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', background: '#0f172a' }}>
                        <th style={{ padding: '10px 12px' }}># شات ووت</th>
                        <th style={{ padding: '10px 12px' }}>التصنيف (Label)</th>
                        <th style={{ padding: '10px 12px' }}>بيانات العميل</th>
                        <th style={{ padding: '10px 12px' }}>آخر رسالة</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>وقت التوزيع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agentChatsList.map((chat) => (
                        <tr key={chat.id} style={{ borderBottom: '1px solid rgba(51, 65, 85, 0.5)' }}>
                          <td style={{ padding: '10px 12px' }}>
                            <a
                              href={`https://crm.elkheta.com/app/accounts/3/conversations/${chat.conv_id}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: '#38bdf8', fontWeight: 700, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: 4
                              }}
                              title="فتح المحادثة في شات ووت مباشرة في تبويب جديد"
                            >
                              🔗 #{chat.conv_id}
                            </a>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700,
                              background: chat.label?.includes('بدون') ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                              color: chat.label?.includes('بدون') ? '#fbbf24' : '#60a5fa',
                              border: chat.label?.includes('بدون') ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                              padding: '2px 8px', borderRadius: 4
                            }}>
                              {chat.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                            <div style={{ fontWeight: 600 }}>{chat.sender_name || 'عميل'}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', direction: 'ltr', textAlign: 'right' }}>
                              {chat.sender_phone || '-'}
                            </div>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#94a3b8', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {chat.last_message || '-'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center', color: '#cbd5e1', fontSize: 12, direction: 'ltr' }}>
                            {chat.assigned_at ? new Date(chat.assigned_at).toLocaleTimeString('ar-EG') : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid #334155', background: '#0f172a',
              display: 'flex', justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={closeAgentChatsModal}
                style={{
                  background: '#334155', border: 'none', color: '#fff',
                  padding: '8px 20px', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer'
                }}
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pull Chats Modal (سحب جميع الشاتات بالكامل) */}
      {pullModalAgent && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
            maxWidth: 500, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                  📥 سحب جميع الشاتات من الموظف
                </h2>
                <p style={{ margin: '6px 0 0', color: '#38bdf8', fontSize: 14, fontWeight: 700 }}>
                  الموظف: {pullModalAgent.name}
                </p>
              </div>
              <button
                type="button"
                onClick={closePullModal}
                disabled={pullingChats}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#0f172a', padding: '16px', borderRadius: 10, border: '1px solid #334155', marginBottom: 18 }}>
              <div style={{ color: '#f1f5f9', fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>
                هل أنت متأكد من <b>سحب جميع المحادثات المفتوحة</b> المسندة للموظف في شات ووت وإعادتها لقائمة الانتظار (Unassigned)؟
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 13 }}>
                <span>الشاتات المسندة له في النافذة الحالية:</span>
                <span style={{ fontWeight: 800, color: '#f8fafc', background: '#1e293b', padding: '2px 8px', borderRadius: 4 }}>
                  {pullModalAgent.current_window_chats || 0} شات
                </span>
              </div>
            </div>

            {/* Explanatory Info Box */}
            <div style={{
              background: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 18,
              fontSize: 12,
              color: '#38bdf8',
              lineHeight: 1.6
            }}>
              💡 <b>ملاحظة:</b> سيتم فك إسناد كل الشاتات المفتوحة لدى الموظف حالياً في شات ووت وإعادتها للانتظار <b>ولا يتم توجيهها لأي موظف آخر تلقائياً</b> لتجنب أي لخبطة.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={closePullModal}
                disabled={pullingChats}
                style={{
                  background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                  padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={executePullChats}
                disabled={pullingChats}
                style={{
                  background: '#ef4444', border: 'none', color: '#fff',
                  padding: '8px 22px', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  cursor: pullingChats ? 'wait' : 'pointer', boxShadow: '0 2px 10px rgba(239, 68, 68, 0.4)'
                }}
              >
                {pullingChats ? '⏳ جاري السحب من شات ووت...' : '📥 تأكيد سحب جميع الشاتات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Half-Hour Limit Modal */}
      {bulkLimitModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
            maxWidth: 480, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                  ⏱️ تحديد ليمت النصف ساعة للكل
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>
                  تحديد عدد الشاتات الأقصى المسموح لكل موظف استلامه خلال نافذة الـ 30 دقيقة.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkLimitModal}
                disabled={savingBulkLimit}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#0f172a', padding: '18px', borderRadius: 10, border: '1px solid #334155', marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>
                  ليمت النصف ساعة (شات / 30 دقيقة):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={bulkLimitValue}
                    onChange={(e) => setBulkLimitValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: 100, background: '#1e293b', border: '1px solid #334155', color: '#38bdf8',
                      padding: '10px 14px', borderRadius: 8, fontSize: 16, fontWeight: 800, textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>شات / نصف ساعة</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>
                  تطبيق على:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bulkLimitTarget"
                      checked={bulkLimitTarget === 'sales'}
                      onChange={() => setBulkLimitTarget('sales')}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    جميع موظفي السيلز (Sales)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bulkLimitTarget"
                      checked={bulkLimitTarget === 'selected'}
                      onChange={() => setBulkLimitTarget('selected')}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    الموظفين المحددين في الجدول فقط ({filteredAgents.filter(a => a.is_selected).length})
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bulkLimitTarget"
                      checked={bulkLimitTarget === 'all'}
                      onChange={() => setBulkLimitTarget('all')}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    الجميع (سيلز + داتا)
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={closeBulkLimitModal}
                disabled={savingBulkLimit}
                style={{
                  background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                  padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyBulkLimit}
                disabled={savingBulkLimit}
                style={{
                  background: '#0284c7', border: 'none', color: '#fff',
                  padding: '8px 22px', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  cursor: savingBulkLimit ? 'wait' : 'pointer', boxShadow: '0 2px 10px rgba(2, 132, 199, 0.4)'
                }}
              >
                {savingBulkLimit ? '⏳ جاري الحفظ...' : '💾 حفظ وتطبيق الليمت'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Daily Limit Modal */}
      {bulkDailyLimitModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            background: '#1e293b', border: '1px solid #334155', borderRadius: 16,
            maxWidth: 480, width: '100%', padding: '24px 28px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: '#f8fafc', fontWeight: 800 }}>
                  🎯 تحديد ماكس شات اليوم للكل (Daily Max)
                </h2>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13 }}>
                  الحد الأقصى الإجمالي للشاتات في اليوم. عند وصول الموظف لهذا الرقم يتوقف التوزيع عنه نهائياً لبقية اليوم.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkDailyLimitModal}
                disabled={savingBulkDailyLimit}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#0f172a', padding: '18px', borderRadius: 10, border: '1px solid #334155', marginBottom: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>
                  ماكس شات اليوم (إجمالي اليوم):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    value={bulkDailyLimitValue}
                    onChange={(e) => setBulkDailyLimitValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{
                      width: 110, background: '#1e293b', border: '1px solid #8b5cf6', color: '#c084fc',
                      padding: '10px 14px', borderRadius: 8, fontSize: 16, fontWeight: 800, textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>شات / يوم كامل</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {[100, 110, 120, 150, 200].map(pv => (
                    <button
                      key={pv}
                      type="button"
                      onClick={() => setBulkDailyLimitValue(pv)}
                      style={{
                        background: bulkDailyLimitValue === pv ? '#8b5cf6' : '#1e293b',
                        border: bulkDailyLimitValue === pv ? '1px solid #c084fc' : '1px solid #334155',
                        color: bulkDailyLimitValue === pv ? '#fff' : '#c084fc',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {pv} شات
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>
                  تطبيق على:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bulkDailyLimitTarget"
                      checked={bulkDailyLimitTarget === 'sales'}
                      onChange={() => setBulkDailyLimitTarget('sales')}
                      style={{ accentColor: '#8b5cf6' }}
                    />
                    جميع موظفي السيلز (Sales)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bulkDailyLimitTarget"
                      checked={bulkDailyLimitTarget === 'selected'}
                      onChange={() => setBulkDailyLimitTarget('selected')}
                      style={{ accentColor: '#8b5cf6' }}
                    />
                    الموظفين المحددين في الجدول فقط ({filteredAgents.filter(a => a.is_selected).length})
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="bulkDailyLimitTarget"
                      checked={bulkDailyLimitTarget === 'all'}
                      onChange={() => setBulkDailyLimitTarget('all')}
                      style={{ accentColor: '#8b5cf6' }}
                    />
                    الجميع (سيلز + داتا)
                  </label>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={closeBulkDailyLimitModal}
                disabled={savingBulkDailyLimit}
                style={{
                  background: 'transparent', border: '1px solid #334155', color: '#94a3b8',
                  padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyBulkDailyLimit}
                disabled={savingBulkDailyLimit}
                style={{
                  background: '#8b5cf6', border: 'none', color: '#fff',
                  padding: '8px 22px', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  cursor: savingBulkDailyLimit ? 'wait' : 'pointer', boxShadow: '0 2px 10px rgba(139, 92, 246, 0.4)'
                }}
              >
                {savingBulkDailyLimit ? '⏳ جاري الحفظ...' : '💾 حفظ وتطبيق ماكس اليوم'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 📬 PENDING CONVERSATIONS & REOPEN MODAL */}
      {pendingModalOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid #334155', borderRadius: 16,
            width: '100%', maxWidth: 960, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            animation: 'fadeIn 0.2s ease', overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 24px', borderBottom: '1px solid #1e293b',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 24 }}>📬</span>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                    إدارة وإعادة فتح المحادثات المعلقة (Pending Reopen)
                  </h2>
                </div>
                <p style={{ margin: '6px 0 0', color: '#94a3b8', fontSize: 13, lineHeight: 1.5 }}>
                  المحادثات في حالة <b style={{ color: '#f59e0b' }}>Pending</b> لا يقوم النظام بتوزيعها. يمكنك هنا تحديد العدد المطلوب من كل تصنيف وإعادة فتحه (<b style={{ color: '#10b981' }}>Reopen</b>) ليتم توزيعه فوراً على الموظفين المتاحين.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => loadPendingSummary(true)}
                  disabled={loadingPending}
                  style={{
                    background: '#1e293b', border: '1px solid #334155', color: '#38bdf8',
                    padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: loadingPending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'all 0.2s'
                  }}
                  title="تحديث الأرقام من Chatwoot مباشرة"
                >
                  <span style={{ display: 'inline-block', transform: loadingPending ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s' }}>🔄</span>
                  <span>{loadingPending ? 'جاري الفحص...' : 'تحديث الأرقام'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPendingModalOpen(false)}
                  style={{
                    background: 'transparent', border: 'none', color: '#64748b',
                    fontSize: 22, cursor: 'pointer', padding: 4, lineHeight: 1
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
              
              {/* Summary Banner */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.05) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 12, padding: '16px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
                  }}>
                    ⏳
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#fcd34d', fontWeight: 700 }}>إجمالي المحادثات المعلقة غير المعينة</div>
                    <div style={{ fontSize: 26, fontWeight: 900, color: '#fff' }}>
                      {loadingPending && !pendingSummary ? (
                        <span style={{ fontSize: 16, color: '#94a3b8' }}>جاري التحميل...</span>
                      ) : (
                        `${(pendingSummary?.total_unassigned_pending || 0).toLocaleString()} محادثة`
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'left', lineHeight: 1.6 }}>
                  آخر فحص: {pendingSummary?.timestamp ? new Date(pendingSummary.timestamp).toLocaleTimeString('ar-EG') : 'الآن'}<br />
                  <span style={{ color: '#10b981' }}>● جاهزة للفتح الفوري والتوزيع</span>
                </div>
              </div>

              {/* Quick Reopen Bar */}
              <div style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
                padding: '16px 20px'
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚡</span>
                  <span>إعادة فتح سريعة (Quick Bulk Reopen):</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px' }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>اختر التصنيف (Label):</label>
                    <select
                      value={quickReopenLabel}
                      onChange={(e) => setQuickReopenLabel(e.target.value)}
                      style={{
                        width: '100%', background: '#0f172a', border: '1px solid #475569',
                        color: '#f8fafc', padding: '9px 12px', borderRadius: 8, fontSize: 14, fontWeight: 600
                      }}
                    >
                      <option value="">-- اختر التصنيف --</option>
                      {(pendingSummary?.labels || []).filter(l => l.pending_count > 0).map(l => (
                        <option key={l.label} value={l.label}>
                          {l.title} ({l.pending_count.toLocaleString()} معلقة)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ width: 140 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>العدد المطلوب:</label>
                    <input
                      type="number"
                      min={1}
                      max={quickReopenLabel ? (pendingSummary?.labels?.find(l => l.label === quickReopenLabel)?.pending_count || 500) : 500}
                      value={quickReopenCount}
                      onChange={(e) => setQuickReopenCount(Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        width: '100%', background: '#0f172a', border: '1px solid #475569',
                        color: '#f8fafc', padding: '8px 12px', borderRadius: 8, fontSize: 14, fontWeight: 700, textAlign: 'center'
                      }}
                    />
                  </div>

                  {/* Preset chips */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', paddingTop: 20 }}>
                    {[10, 25, 50, 100].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setQuickReopenCount(cnt)}
                        style={{
                          background: quickReopenCount === cnt ? '#3b82f6' : '#0f172a',
                          border: '1px solid #475569', color: '#fff',
                          padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        +{cnt}
                      </button>
                    ))}
                    {quickReopenLabel && (
                      <button
                        type="button"
                        onClick={() => {
                          const item = pendingSummary?.labels?.find(l => l.label === quickReopenLabel);
                          if (item && item.pending_count > 0) setQuickReopenCount(item.pending_count);
                        }}
                        style={{
                          background: '#0f172a', border: '1px solid #10b981', color: '#10b981',
                          padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        الكل
                      </button>
                    )}
                  </div>

                  <div style={{ paddingTop: 20 }}>
                    <button
                      type="button"
                      onClick={handleQuickReopen}
                      disabled={quickReopening || !quickReopenLabel}
                      style={{
                        background: quickReopening || !quickReopenLabel ? '#475569' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#fff', border: 'none', padding: '9px 22px', borderRadius: 8,
                        fontSize: 14, fontWeight: 800, cursor: quickReopening || !quickReopenLabel ? 'not-allowed' : 'pointer',
                        boxShadow: quickReopenLabel ? '0 2px 10px rgba(16, 185, 129, 0.4)' : 'none',
                        transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <span>{quickReopening ? '⏳ جاري الفتح...' : '🔓 إعادة فتح الآن'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Labels Grid Header & Filter */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🏷️</span>
                  <span>تفاصيل المحادثات المعلقة لكل تصنيف (Label Breakdown)</span>
                </h3>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={showZeroPendingLabels}
                    onChange={(e) => setShowZeroPendingLabels(e.target.checked)}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  عرض التصنيفات التي لا تحتوي على معلقات (0)
                </label>
              </div>

              {/* Labels Grid */}
              {loadingPending && !pendingSummary ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                  <div>جاري فحص جميع التصنيفات في Chatwoot...</div>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 14
                }}>
                  {(pendingSummary?.labels || [])
                    .filter(l => showZeroPendingLabels || l.pending_count > 0)
                    .map((item) => {
                      const countInput = reopenCounts[item.label] ?? Math.min(20, Math.max(1, item.pending_count || 10));
                      const isReopening = reopeningLabel === item.label;
                      const hasChats = item.pending_count > 0;

                      return (
                        <div
                          key={item.label}
                          style={{
                            background: '#1e293b',
                            border: hasChats ? '1px solid #334155' : '1px solid #1e293b',
                            borderRadius: 12, padding: '14px 16px',
                            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                            opacity: hasChats ? 1 : 0.6,
                            transition: 'all 0.2s',
                            boxShadow: hasChats ? '0 2px 8px rgba(0,0,0,0.2)' : 'none'
                          }}
                        >
                          <div>
                            {/* Card Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{
                                  width: 10, height: 10, borderRadius: '50%',
                                  background: item.color || '#3b82f6'
                                }} />
                                <span style={{ fontWeight: 800, fontSize: 14, color: '#f8fafc' }}>
                                  {item.title}
                                </span>
                                {item.is_sales_label && (
                                  <span style={{
                                    fontSize: 10, padding: '1px 6px', borderRadius: 4,
                                    background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 700
                                  }}>
                                    سيلز
                                  </span>
                                )}
                              </div>

                              <span style={{
                                background: hasChats ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                                color: hasChats ? '#10b981' : '#94a3b8',
                                border: hasChats ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                                padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 800
                              }}>
                                {item.pending_count.toLocaleString()} معلقة
                              </span>
                            </div>
                          </div>

                          {/* Action area */}
                          {hasChats ? (
                            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #334155' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <label style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>العدد:</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={item.pending_count}
                                  value={countInput}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(item.pending_count, parseInt(e.target.value) || 1));
                                    setReopenCounts(prev => ({ ...prev, [item.label]: val }));
                                  }}
                                  style={{
                                    width: 70, background: '#0f172a', border: '1px solid #475569',
                                    color: '#f8fafc', padding: '5px 8px', borderRadius: 6, fontSize: 13,
                                    fontWeight: 700, textAlign: 'center'
                                  }}
                                />

                                {/* Presets */}
                                <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
                                  {[10, 25].filter(c => c < item.pending_count).map(c => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setReopenCounts(prev => ({ ...prev, [item.label]: c }))}
                                      style={{
                                        background: '#0f172a', border: '1px solid #475569', color: '#94a3b8',
                                        padding: '3px 6px', borderRadius: 4, fontSize: 11, cursor: 'pointer'
                                      }}
                                    >
                                      {c}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => setReopenCounts(prev => ({ ...prev, [item.label]: item.pending_count }))}
                                    style={{
                                      background: '#0f172a', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#10b981',
                                      padding: '3px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                                    }}
                                  >
                                    الكل
                                  </button>
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleReopenLabel(item.label, countInput)}
                                disabled={isReopening}
                                style={{
                                  width: '100%',
                                  background: isReopening ? '#475569' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: '#fff', border: 'none', padding: '8px 14px', borderRadius: 8,
                                  fontSize: 13, fontWeight: 800, cursor: isReopening ? 'wait' : 'pointer',
                                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)',
                                  transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                              >
                                <span>{isReopening ? '⏳ جاري الفتح...' : `🔓 فتح ${Math.min(countInput, item.pending_count)} شات الآن`}</span>
                              </button>
                            </div>
                          ) : (
                            <div style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
                              لا توجد محادثات معلقة حالياً بهذا التصنيف
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '14px 24px', borderTop: '1px solid #1e293b',
              background: '#0f172a', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 12
            }}>
              <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>💡</span>
                <span>فور إعادة الفتح، تتحول الشاتات إلى Open وتصبح جاهزة لسحبها وتوزيعها تلقائياً بالشيفت.</span>
              </div>

              <button
                type="button"
                onClick={() => setPendingModalOpen(false)}
                style={{
                  background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0',
                  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer'
                }}
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
