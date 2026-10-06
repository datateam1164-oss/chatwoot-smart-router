import { useState, useEffect, useMemo } from 'react';
import { COORDINATOR_ARABIC_NAMES } from './constants';

const STORAGE_KEY = 'cw_custom_agent_groups';

const DEFAULT_GROUPS = [
  { id: 'g_1', name: 'Group 1 (جروب 1)', memberIds: [], labels: [] },
  { id: 'g_2', name: 'Group 2 (جروب 2)', memberIds: [], labels: [] }
];

function loadSavedGroups() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_) {}
  return DEFAULT_GROUPS;
}

function saveGroupsToStorage(groups) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────
// 1. Bulk Limit (Half-Hour) Modal
// ─────────────────────────────────────────────────────────────────
export function BulkLimitModal({
  isOpen,
  onClose,
  onApply,
  selectedCount
}) {
  const [value, setValue] = useState(10);
  const [target, setTarget] = useState(selectedCount > 0 ? 'selected' : 'sales');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedCount > 0) setTarget('selected');
    else setTarget('sales');
  }, [selectedCount, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onApply(value, target);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
        maxWidth: 480, width: '100%', padding: '24px', boxShadow: 'var(--shadow-card)',
        direction: 'rtl', color: 'var(--text-main)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-main)', fontWeight: 800 }}>
              ⏱️ 30-Minute Chat Limit (ليمت النصف ساعة)
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              الحد الأقصى للشاتات في نافذة الـ 30 دقيقة للمجموعة المختارة.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ background: 'var(--bg-surface-elevated)', padding: 16, borderRadius: 10, border: '1px solid var(--border-subtle)', marginBottom: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
              New Limit (chats / 30m):
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                min="1"
                max="100"
                value={value}
                onChange={(e) => setValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 90, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--primary)',
                  padding: '8px 12px', borderRadius: 8, fontSize: 16, fontWeight: 800, textAlign: 'center'
                }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {[5, 10, 15, 20].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValue(v)}
                    style={{
                      background: value === v ? 'var(--primary)' : 'var(--bg-surface)',
                      color: value === v ? '#ffffff' : 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
              Apply Target:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedCount > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}>
                  <input
                    type="radio"
                    name="bulkLimitTarget"
                    checked={target === 'selected'}
                    onChange={() => setTarget('selected')}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  Selected Agents Only ({selectedCount} Selected)
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-main)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bulkLimitTarget"
                  checked={target === 'sales'}
                  onChange={() => setTarget('sales')}
                  style={{ accentColor: 'var(--primary)' }}
                />
                All Sales Team (جميع موظفي السيلز)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-main)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bulkLimitTarget"
                  checked={target === 'all'}
                  onChange={() => setTarget('all')}
                  style={{ accentColor: 'var(--primary)' }}
                />
                All Accounts (Sales + Data)
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '7px 14px', borderRadius: 8, fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              background: 'var(--primary)', border: 'none', color: '#fff',
              padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: saving ? 'wait' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Apply Limit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 2. Bulk Daily Limit Modal
// ─────────────────────────────────────────────────────────────────
export function BulkDailyLimitModal({
  isOpen,
  onClose,
  onApply,
  selectedCount
}) {
  const [value, setValue] = useState(100);
  const [target, setTarget] = useState(selectedCount > 0 ? 'selected' : 'sales');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedCount > 0) setTarget('selected');
    else setTarget('sales');
  }, [selectedCount, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onApply(value, target);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
        maxWidth: 480, width: '100%', padding: '24px', boxShadow: 'var(--shadow-card)',
        direction: 'rtl', color: 'var(--text-main)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: 'var(--text-main)', fontWeight: 800 }}>
              🎯 Daily Maximum Chats (ماكس اليوم الكامل)
            </h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              الحد الأقصى الإجمالي للشاتات في اليوم الواحد.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        <div style={{ background: 'var(--bg-surface-elevated)', padding: 16, borderRadius: 10, border: '1px solid var(--border-subtle)', marginBottom: 18 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
              New Daily Max (chats / day):
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                min="1"
                max="9999"
                value={value}
                onChange={(e) => setValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 100, background: 'var(--bg-input)', border: '1px solid var(--border-subtle)', color: 'var(--primary)',
                  padding: '8px 12px', borderRadius: 8, fontSize: 16, fontWeight: 800, textAlign: 'center'
                }}
              />
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {[80, 100, 120, 150].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValue(v)}
                    style={{
                      background: value === v ? 'var(--primary)' : 'var(--bg-surface)',
                      color: value === v ? '#ffffff' : 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, marginBottom: 6 }}>
              Apply Target:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {selectedCount > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--primary)', cursor: 'pointer', fontWeight: 700 }}>
                  <input
                    type="radio"
                    name="bulkDailyLimitTarget"
                    checked={target === 'selected'}
                    onChange={() => setTarget('selected')}
                    style={{ accentColor: 'var(--primary)' }}
                  />
                  Selected Agents Only ({selectedCount} Selected)
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-main)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bulkDailyLimitTarget"
                  checked={target === 'sales'}
                  onChange={() => setTarget('sales')}
                  style={{ accentColor: 'var(--primary)' }}
                />
                All Sales Team (جميع موظفي السيلز)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-main)', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bulkDailyLimitTarget"
                  checked={target === 'all'}
                  onChange={() => setTarget('all')}
                  style={{ accentColor: 'var(--primary)' }}
                />
                All Accounts (Sales + Data)
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '7px 14px', borderRadius: 8, fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            style={{
              background: 'var(--primary)', border: 'none', color: '#fff',
              padding: '7px 18px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: saving ? 'wait' : 'pointer'
            }}
          >
            {saving ? 'Saving...' : 'Apply Daily Max'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 3. Custom Groups & Labels Studio Modal (Ultra-Sleek & Spacious)
// ─────────────────────────────────────────────────────────────────
export function BulkLabelsModal({
  isOpen,
  onClose,
  agents,
  preSelectedIds,
  availableSalesLabels,
  onApply
}) {
  const [groups, setGroups] = useState(loadSavedGroups);
  const [activeGroupId, setActiveGroupId] = useState(() => groups[0]?.id || 'g_1');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Search & Filter in Members
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedCoordToAdd, setSelectedCoordToAdd] = useState('');
  const [selectedShiftToAdd, setSelectedShiftToAdd] = useState('');

  // Saving state
  const [saving, setSaving] = useState(false);

  // Synchronize on modal open
  useEffect(() => {
    if (isOpen) {
      const loaded = loadSavedGroups();
      setGroups(loaded);
      if (loaded.length > 0 && !loaded.some(g => g.id === activeGroupId)) {
        setActiveGroupId(loaded[0].id);
      }
      setMemberSearch('');
      setSelectedCoordToAdd('');
      setSelectedShiftToAdd('');
      setEditingName(false);
    }
  }, [isOpen, activeGroupId]);

  // Active Group Object
  const activeGroup = useMemo(() => {
    return groups.find(g => g.id === activeGroupId) || groups[0] || DEFAULT_GROUPS[0];
  }, [groups, activeGroupId]);

  const memberIds = activeGroup.memberIds || [];
  const assignedLabels = activeGroup.labels || [];

  // Update Active Group Helper
  const updateActiveGroup = (patch) => {
    setGroups(prev => {
      const next = prev.map(g => g.id === activeGroupId ? { ...g, ...patch } : g);
      saveGroupsToStorage(next);
      return next;
    });
  };

  // Group Management Actions
  const handleAddNewGroup = () => {
    const newId = 'g_' + Date.now();
    const newNumber = groups.length + 1;
    const newGroup = {
      id: newId,
      name: `Group ${newNumber} (جروب ${newNumber})`,
      memberIds: preSelectedIds ? [...preSelectedIds] : [],
      labels: []
    };
    const next = [...groups, newGroup];
    setGroups(next);
    saveGroupsToStorage(next);
    setActiveGroupId(newId);
  };

  const handleDeleteGroup = (idToDelete) => {
    if (groups.length <= 1) return;
    const next = groups.filter(g => g.id !== idToDelete);
    setGroups(next);
    saveGroupsToStorage(next);
    if (activeGroupId === idToDelete) {
      setActiveGroupId(next[0].id);
    }
  };

  const handleSaveName = () => {
    if (nameInput.trim()) {
      updateActiveGroup({ name: nameInput.trim() });
    }
    setEditingName(false);
  };

  // Member Selection Helpers
  const toggleMember = (id) => {
    const nextIds = memberIds.includes(id)
      ? memberIds.filter(x => x !== id)
      : [...memberIds, id];
    updateActiveGroup({ memberIds: nextIds });
  };

  const handleAddAllInShift = () => {
    const inShiftIds = agents.filter(a => a.team === 'Sales' && a.in_shift).map(a => a.id);
    const merged = Array.from(new Set([...memberIds, ...inShiftIds]));
    updateActiveGroup({ memberIds: merged });
  };

  const handleAddAllSales = () => {
    const salesIds = agents.filter(a => a.team === 'Sales').map(a => a.id);
    updateActiveGroup({ memberIds: salesIds });
  };

  const handleClearMembers = () => {
    updateActiveGroup({ memberIds: [] });
  };

  const handleLoadPreselected = () => {
    if (preSelectedIds && preSelectedIds.length > 0) {
      const merged = Array.from(new Set([...memberIds, ...preSelectedIds]));
      updateActiveGroup({ memberIds: merged });
    }
  };

  const handleAddByCoordinator = (coordRaw) => {
    if (!coordRaw) return;
    const targetAgents = agents.filter(a => {
      if (a.team !== 'Sales') return false;
      const c = (a.coordinator_name || '').trim().toLowerCase();
      if (coordRaw === '__unassigned__') {
        return !c || c === 'none' || c === 'بدون كوردينيتور';
      }
      return c === coordRaw.toLowerCase();
    });
    const ids = targetAgents.map(a => a.id);
    updateActiveGroup({ memberIds: Array.from(new Set([...memberIds, ...ids])) });
    setSelectedCoordToAdd('');
  };

  const handleAddByShift = (shiftVal) => {
    if (!shiftVal) return;
    const targetAgents = agents.filter(a => {
      if (a.team !== 'Sales') return false;
      return (a.shift_text || '').trim() === shiftVal;
    });
    const ids = targetAgents.map(a => a.id);
    updateActiveGroup({ memberIds: Array.from(new Set([...memberIds, ...ids])) });
    setSelectedShiftToAdd('');
  };

  // Label Selection Helpers
  const toggleLabel = (lbl) => {
    const nextLabels = assignedLabels.includes(lbl)
      ? assignedLabels.filter(l => l !== lbl)
      : [...assignedLabels, lbl];
    updateActiveGroup({ labels: nextLabels });
  };

  const handleSelectAllLabels = () => {
    updateActiveGroup({ labels: [...availableSalesLabels, 'بدون ليبل (Unlabeled)'] });
  };

  const handleClearLabels = () => {
    updateActiveGroup({ labels: [] });
  };

  const moveGroupLabelUp = (index) => {
    if (index <= 0) return;
    const next = [...assignedLabels];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    updateActiveGroup({ labels: next });
  };

  const moveGroupLabelDown = (index) => {
    if (index >= assignedLabels.length - 1) return;
    const next = [...assignedLabels];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    updateActiveGroup({ labels: next });
  };

  // Extract distinct coordinators and shifts for batch addition
  const coordinatorOptions = useMemo(() => {
    const map = {};
    agents.filter(a => a.team === 'Sales').forEach(a => {
      const raw = (a.coordinator_name || '').trim();
      let key = raw.toLowerCase();
      let label = raw;
      if (!raw || raw.toLowerCase() === 'none' || raw === 'بدون كوردينيتور') {
        key = '__unassigned__';
        label = 'عام / بدون كوردينيتور';
      } else {
        const ar = COORDINATOR_ARABIC_NAMES[key];
        label = ar ? `فريق ${ar} (${raw})` : `فريق ${raw}`;
      }
      if (!map[key]) map[key] = { key, label, raw: key === '__unassigned__' ? '__unassigned__' : raw, count: 0 };
      map[key].count++;
    });
    return Object.values(map);
  }, [agents]);

  const shiftOptions = useMemo(() => {
    const map = {};
    agents.filter(a => a.team === 'Sales').forEach(a => {
      const s = (a.shift_text || '').trim();
      if (!s) return;
      if (!map[s]) map[s] = { shift: s, count: 0 };
      map[s].count++;
    });
    return Object.values(map);
  }, [agents]);

  // Candidates for search
  const candidateAgents = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return agents
      .filter(a => a.team === 'Sales' && !memberIds.includes(a.id))
      .filter(a => {
        if (!q) return true;
        const name = (a.name || '').toLowerCase();
        const crm = (a.crm_name || '').toLowerCase();
        const coord = (a.coordinator_name || '').toLowerCase();
        return name.includes(q) || crm.includes(q) || coord.includes(q);
      })
      .slice(0, 30);
  }, [agents, memberIds, memberSearch]);

  const selectedAgentObjects = useMemo(() => {
    return memberIds
      .map(id => agents.find(a => a.id === id))
      .filter(Boolean);
  }, [memberIds, agents]);

  const handleApplyToAgents = async () => {
    if (memberIds.length === 0) return;
    setSaving(true);
    try {
      saveGroupsToStorage(groups);
      await onApply(memberIds, assignedLabels);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 20px'
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18,
        maxWidth: 1040, width: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-card)', direction: 'rtl', color: 'var(--text-main)', overflow: 'hidden'
      }}>
        {/* Top Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface-elevated)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🏷️</span>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-main)' }}>
                Group & Label Studio (استوديو المجموعات والتصنيفات)
              </h2>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              أنشئ مجموعات عمل متعددة، حدد الأعضاء بنقرة واحدة، وعيّن التصنيفات التي يستقبلونها.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', width: 32, height: 32, borderRadius: 8,
              fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>

        {/* Groups Toolbar (Switch / Create Multiple Groups) */}
        <div style={{
          padding: '12px 24px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          {/* Groups Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              المجموعات (Groups):
            </span>
            {groups.map((grp) => {
              const isActive = grp.id === activeGroupId;
              return (
                <div
                  key={grp.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    background: isActive ? 'var(--primary)' : 'var(--bg-surface-elevated)',
                    border: isActive ? '1px solid var(--primary)' : '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    overflow: 'hidden',
                    transition: 'all 0.15s'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveGroupId(grp.id);
                      setEditingName(false);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: isActive ? '#ffffff' : 'var(--text-main)',
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>📁</span>
                    <span>{grp.name}</span>
                    <span style={{
                      background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-surface)',
                      color: isActive ? '#fff' : 'var(--text-dim)',
                      padding: '1px 6px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 800
                    }}>
                      {(grp.memberIds || []).length}
                    </span>
                  </button>

                  {groups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteGroup(grp.id)}
                      title="حذف هذا الجروب"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: isActive ? 'rgba(255,255,255,0.8)' : 'var(--text-dim)',
                        padding: '6px 8px',
                        cursor: 'pointer',
                        fontSize: 11
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              onClick={handleAddNewGroup}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px dashed var(--primary)',
                color: 'var(--primary)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>➕</span>
              <span>جروب جديد (+ New Group)</span>
            </button>
          </div>

          {/* Active Group Rename */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="اسم الجروب الجديد..."
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--primary)',
                    color: 'var(--text-main)', padding: '5px 10px', borderRadius: 6, fontSize: 12, outline: 'none'
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleSaveName}
                  style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingName(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '5px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}
                >
                  إلغاء
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNameInput(activeGroup.name);
                  setEditingName(true);
                }}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  padding: '5px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                title="تعديل اسم الجروب النشط"
              >
                ✏️ تسمية: <strong style={{ color: 'var(--text-main)' }}>{activeGroup.name}</strong>
              </button>
            )}
          </div>
        </div>

        {/* Studio Workspace: 2 Columns */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: 20
        }}>
          {/* Column 1: Group Members (الأعضاء) */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
                  👥 Group Members (أعضاء الجروب)
                </span>
                <span style={{ marginRight: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                  ({memberIds.length} موظف محدد)
                </span>
              </div>

              {preSelectedIds && preSelectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleLoadPreselected}
                  style={{
                    background: 'var(--primary-bg)',
                    border: '1px solid var(--primary-border)',
                    color: 'var(--primary)',
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                  title="تحميل الموظفين المحددين في الجدول مباشرة"
                >
                  📥 إضافة المحددين بالجدول ({preSelectedIds.length})
                </button>
              )}
            </div>

            {/* Quick Batch Add Row */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* Add by Coordinator Dropdown */}
              <select
                value={selectedCoordToAdd}
                onChange={(e) => handleAddByCoordinator(e.target.value)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="">+ إضافة فريق كامل...</option>
                {coordinatorOptions.map(c => (
                  <option key={c.key} value={c.raw}>{c.label} ({c.count})</option>
                ))}
              </select>

              {/* Add by Shift Dropdown */}
              <select
                value={selectedShiftToAdd}
                onChange={(e) => handleAddByShift(e.target.value)}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <option value="">+ إضافة شيفت كامل...</option>
                {shiftOptions.map(s => (
                  <option key={s.shift} value={s.shift}>⏰ {s.shift} ({s.count})</option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleAddAllInShift}
                style={{
                  background: 'var(--badge-ready-bg)',
                  border: '1px solid var(--badge-ready-border)',
                  color: 'var(--badge-ready-text)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🟢 + In Shift
              </button>

              <button
                type="button"
                onClick={handleAddAllSales}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                + كل السيلز
              </button>

              {memberIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearMembers}
                  style={{
                    background: 'var(--badge-capped-bg)',
                    border: '1px solid var(--badge-capped-border)',
                    color: 'var(--badge-capped-text)',
                    padding: '4px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  تفريغ ✕
                </button>
              )}
            </div>

            {/* Selected Members Chips Area */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              padding: 10,
              minHeight: 130,
              maxHeight: 180,
              overflowY: 'auto',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              alignContent: 'flex-start'
            }}>
              {selectedAgentObjects.length === 0 ? (
                <div style={{ width: '100%', textAlign: 'center', padding: '30px 0', color: 'var(--text-dim)', fontSize: 12 }}>
                  لا يوجد أعضاء في هذا الجروب حالياً. اختر من القوائم بالأعلى أو ابحث لإضافة موظفين.
                </div>
              ) : (
                selectedAgentObjects.map(agent => (
                  <div
                    key={agent.id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-highlight)',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 11
                    }}
                  >
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{agent.name}</span>
                    {agent.shift_text && (
                      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                        {agent.shift_text}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleMember(agent.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--badge-capped-text)',
                        cursor: 'pointer',
                        padding: 0,
                        marginLeft: 2,
                        fontSize: 12,
                        lineHeight: 1
                      }}
                      title="إزالة من الجروب"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Search & Add New Member from candidates */}
            <div style={{ marginTop: 2 }}>
              <input
                type="text"
                placeholder="🔍 Search agent name to add (بحث بالاسم للإضافة)..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 11,
                  outline: 'none',
                  marginBottom: 6
                }}
              />

              <div style={{
                maxHeight: 110,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4
              }}>
                {candidateAgents.map(a => (
                  <div
                    key={a.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: 11
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{a.name}</span>
                      {a.coordinator_name && a.coordinator_name !== 'None' && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 6 }}>
                          ({COORDINATOR_ARABIC_NAMES[a.coordinator_name.toLowerCase()] || a.coordinator_name})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleMember(a.id)}
                      style={{
                        background: 'var(--primary-bg)',
                        border: '1px solid var(--primary-border)',
                        color: 'var(--primary)',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Labels Configuration (التصنيفات المخصصة) */}
          <div style={{
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 14,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
                  🏷️ Assigned Labels (التصنيفات المخصصة)
                </span>
                <span style={{ marginRight: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                  ({assignedLabels.length} مصرح بها)
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleSelectAllLabels}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--primary)',
                    color: 'var(--primary)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearLabels}
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  تفريغ (عام)
                </button>
              </div>
            </div>

            {/* Labels Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 8,
              maxHeight: 290,
              overflowY: 'auto',
              padding: 2
            }}>
              {/* Unlabeled Card */}
              <div
                onClick={() => toggleLabel('بدون ليبل (Unlabeled)')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: assignedLabels.includes('بدون ليبل (Unlabeled)')
                    ? 'var(--primary-bg)'
                    : 'var(--bg-surface)',
                  border: assignedLabels.includes('بدون ليبل (Unlabeled)')
                    ? '1.5px solid var(--primary)'
                    : '1px solid var(--border-subtle)',
                  transition: 'all 0.15s'
                }}
              >
                <input
                  type="checkbox"
                  checked={assignedLabels.includes('بدون ليبل (Unlabeled)')}
                  onChange={() => {}}
                  style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: assignedLabels.includes('بدون ليبل (Unlabeled)')
                    ? 'var(--primary)'
                    : 'var(--text-main)'
                }}>
                  📥 بدون ليبل (Unlabeled)
                </span>
              </div>

              {/* Authorized Sales Labels */}
              {availableSalesLabels.map(lbl => {
                const isSelected = assignedLabels.includes(lbl);
                return (
                  <div
                    key={lbl}
                    onClick={() => toggleLabel(lbl)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: isSelected
                        ? 'var(--primary-bg)'
                        : 'var(--bg-surface)',
                      border: isSelected
                        ? '1.5px solid var(--primary)'
                        : '1px solid var(--border-subtle)',
                      transition: 'all 0.15s'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                    <span style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      🏷️ {lbl}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Group Label Priority Queue (English) */}
            {assignedLabels.length > 1 && (
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                padding: '10px 12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>
                    🎯 Group Label Priority Order:
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Rank #1 is distributed first
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto' }}>
                  {assignedLabels.map((lbl, idx) => (
                    <div
                      key={lbl}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: idx === 0 ? 'var(--primary-bg)' : 'var(--bg-surface-elevated)',
                        border: `1px solid ${idx === 0 ? 'var(--primary)' : 'var(--border-subtle)'}`,
                        fontSize: 11
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          fontWeight: 800,
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: idx === 0 ? 'var(--primary)' : 'var(--bg-surface)',
                          color: idx === 0 ? '#ffffff' : 'var(--text-muted)'
                        }}>
                          {idx === 0 ? '🥇 #1' : `#${idx + 1}`}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                          {lbl}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveGroupLabelUp(idx); }}
                          disabled={idx === 0}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: idx === 0 ? 'var(--text-dim)' : 'var(--primary)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            cursor: idx === 0 ? 'not-allowed' : 'pointer',
                            fontWeight: 800,
                            fontSize: 10,
                            opacity: idx === 0 ? 0.3 : 1
                          }}
                          title="Move Up"
                        >
                          ⬆️
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveGroupLabelDown(idx); }}
                          disabled={idx === assignedLabels.length - 1}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: idx === assignedLabels.length - 1 ? 'var(--text-dim)' : 'var(--primary)',
                            padding: '1px 6px',
                            borderRadius: 4,
                            cursor: idx === assignedLabels.length - 1 ? 'not-allowed' : 'pointer',
                            fontWeight: 800,
                            fontSize: 10,
                            opacity: idx === assignedLabels.length - 1 ? 0.3 : 1
                          }}
                          title="Move Down"
                        >
                          ⬇️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary Insight */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12
            }}>
              {assignedLabels.length === 0 ? (
                <div style={{ color: 'var(--badge-ready-text)', fontWeight: 700 }}>
                  🌐 وضع عام (Default): سيتلقى أعضاء الجروب جميع المحادثات الواردة بدون تقييد.
                </div>
              ) : (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>التوجيه الحصري: </span>
                  <strong style={{ color: 'var(--primary)' }}>
                    {assignedLabels.length} تصنيف محدد
                  </strong>
                  <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>
                    لن يستقبل أعضاء هذه المجموعة أي محادثة خارج هذه التصنيفات المختارة.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Bar */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-elevated)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            الجروب النشط: <strong style={{ color: 'var(--text-main)' }}>{activeGroup.name}</strong> •{' '}
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{memberIds.length} موظف</span> •{' '}
            <span style={{ color: 'var(--text-main)' }}>{assignedLabels.length > 0 ? `${assignedLabels.length} ليبل` : 'جميع الليبولات (عام)'}</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                padding: '8px 18px',
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              إلغاء (Cancel)
            </button>

            <button
              type="button"
              onClick={() => {
                saveGroupsToStorage(groups);
                onClose();
              }}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              💾 حفظ الجروب فقط
            </button>

            <button
              type="button"
              onClick={handleApplyToAgents}
              disabled={saving || memberIds.length === 0}
              style={{
                background: 'var(--primary)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 24px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 800,
                cursor: saving || memberIds.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 10px var(--primary-bg)'
              }}
            >
              {saving ? 'جاري التطبيق...' : `⚡ تطبيق وحفظ على (${memberIds.length} موظف)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// 4. Team / Squad Labels Modal (Ultra-Sleek & Spacious)
// ─────────────────────────────────────────────────────────────────
export function TeamLabelsModal({
  isOpen,
  onClose,
  group,
  availableSalesLabels,
  onApply
}) {
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && group) {
      const allLabels = group.agents.map(a => a.assigned_labels || []);
      const firstStr = JSON.stringify([...allLabels[0] || []].sort());
      const allSame = allLabels.every(l => JSON.stringify([...l || []].sort()) === firstStr);
      if (allSame && allLabels[0]) {
        setSelectedLabels([...allLabels[0]]);
      } else {
        setSelectedLabels(Array.from(new Set(allLabels.flat())));
      }
    }
  }, [isOpen, group]);

  if (!isOpen || !group) return null;

  const toggleLabel = (lbl) => {
    setSelectedLabels(prev => prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onApply(group, selectedLabels);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16,
        maxWidth: 780, width: '92vw', padding: '24px', boxShadow: 'var(--shadow-card)',
        direction: 'rtl', color: 'var(--text-main)', maxHeight: '88vh', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>👥</span>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text-main)', fontWeight: 800 }}>
                Squad Labels: {group.displayName}
              </h2>
            </div>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
              سيتم تعيين هذه التصنيفات الحصرية لجميع أعضاء الفريق ({group.agents.length} موظف).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {/* Squad Members Preview Pills */}
        <div style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: '10px 12px',
          marginBottom: 16,
          maxHeight: 90,
          overflowY: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6
        }}>
          {group.agents.map(a => (
            <span
              key={a.id}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                padding: '2px 8px',
                borderRadius: 6,
                fontSize: 11,
                color: 'var(--text-main)',
                fontWeight: 600
              }}
            >
              {a.name}
            </span>
          ))}
        </div>

        {/* Labels Selection */}
        <div style={{
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: 16,
          marginBottom: 16,
          flex: 1,
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary)' }}>
              Assigned Labels ({selectedLabels.length} مصرح بها)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setSelectedLabels([...availableSalesLabels, 'بدون ليبل (Unlabeled)'])}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedLabels([])}
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
              >
                تفريغ (استقبال الجميع)
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            <div
              onClick={() => toggleLabel('بدون ليبل (Unlabeled)')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: selectedLabels.includes('بدون ليبل (Unlabeled)') ? 'var(--primary-bg)' : 'var(--bg-surface)',
                border: selectedLabels.includes('بدون ليبل (Unlabeled)') ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)',
                padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                color: selectedLabels.includes('بدون ليبل (Unlabeled)') ? 'var(--primary)' : 'var(--text-main)',
                fontWeight: 700
              }}
            >
              <input
                type="checkbox"
                checked={selectedLabels.includes('بدون ليبل (Unlabeled)')}
                onChange={() => {}}
                style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <span>📥 بدون ليبل (Unlabeled)</span>
            </div>

            {availableSalesLabels.map(lbl => {
              const isSelected = selectedLabels.includes(lbl);
              return (
                <div
                  key={lbl}
                  onClick={() => toggleLabel(lbl)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)',
                    border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border-subtle)',
                    padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                    color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                    fontWeight: 700
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    style={{ accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span>🏷️ {lbl}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', padding: '8px 16px', borderRadius: 8, fontSize: 12 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              background: 'var(--primary)', border: 'none', color: '#fff',
              padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: saving ? 'wait' : 'pointer',
              boxShadow: '0 2px 10px var(--primary-bg)'
            }}
          >
            {saving ? 'جاري الحفظ...' : `Apply to Squad (${group.agents.length} Employees)`}
          </button>
        </div>
      </div>
    </div>
  );
}
