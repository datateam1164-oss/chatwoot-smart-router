const BASE_URL = (typeof window !== 'undefined' && window.location.port === '5173')
  ? 'http://localhost:5005/api'
  : '/api';

const AUTH_TOKEN_KEY = 'cw_routing_auth_token';
const AUTH_USER_KEY = 'cw_routing_user';

export const authStorage = {
  getToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY) || '';
  },
  setToken(token) {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  },
  clearToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  },
  getUser() {
    try {
      const u = localStorage.getItem(AUTH_USER_KEY);
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setUser(user) {
    if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(AUTH_USER_KEY);
  },
  clearAll() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }
};

async function apiFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const headers = { ...(options.headers || {}) };
  const token = authStorage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 && !endpoint.includes('/auth/login')) {
    authStorage.clearAll();
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'غير مصرح بالدخول');
  }
  return res;
}

export const authApi = {
  async login(username, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل تسجيل الدخول');
    }
    if (data.token) {
      authStorage.setToken(data.token);
      authStorage.setUser(data.user);
    }
    return data;
  },

  async getMe() {
    const res = await apiFetch('/auth/me');
    if (!res.ok) throw new Error('فشل التحقق من الجلسة');
    return res.json();
  },

  async changeCredentials({ oldPassword, newUsername, newPassword }) {
    const res = await apiFetch('/auth/change-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_password: oldPassword,
        new_username: newUsername,
        new_password: newPassword
      })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'فشل تحديث البيانات');
    }
    if (newUsername) {
      const u = authStorage.getUser() || {};
      u.username = newUsername;
      authStorage.setUser(u);
    }
    return data;
  },

  async logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (_) {}
    authStorage.clearAll();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  async getUsers() {
    const res = await apiFetch('/users');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل جلب المستخدمين');
    return data.users || [];
  },

  async createUser({ username, password, role }) {
    const res = await apiFetch('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل إنشاء المستخدم');
    return data;
  },

  async deleteUser(userId) {
    const res = await apiFetch(`/users/${userId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل حذف المستخدم');
    return data;
  }
};

export const agentsApi = {
  async fetchStatus() {
    const res = await apiFetch('/status');
    if (!res.ok) throw new Error('فشل الاتصال بالسيرفر');
    return res.json();
  },

  async fetchAgents() {
    const res = await apiFetch('/agents');
    if (!res.ok) throw new Error('فشل جلب الموظفين');
    const json = await res.json();
    return json.agents || [];
  },

  async toggleSelect(agentId, isSelected) {
    const res = await apiFetch(`/agents/${agentId}/toggle-select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_selected: isSelected }),
    });
    if (!res.ok) throw new Error('فشل تحديث حالة الاختيار');
    return res.json();
  },

  async bulkSelect(team, isSelected, agentIds = null) {
    const payload = { is_selected: isSelected };
    if (agentIds && Array.isArray(agentIds)) {
      payload.agent_ids = agentIds;
    } else {
      payload.team = team;
    }
    const res = await apiFetch('/agents/bulk-select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('فشل تحديث التحديد الجماعي');
    return res.json();
  },

  async togglePause(agentId, isPaused) {
    const res = await apiFetch(`/agents/${agentId}/toggle-pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_paused: isPaused }),
    });
    if (!res.ok) throw new Error('فشل تحديث حالة الإيقاف');
    return res.json();
  },

  async updateLimit(agentId, limit) {
    const res = await apiFetch(`/agents/${agentId}/update-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit }),
    });
    if (!res.ok) throw new Error('فشل تحديث الليمت');
    return res.json();
  },

  async pullChats(agentId, maxCount = null) {
    const res = await apiFetch(`/agents/${agentId}/pull-chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_count: maxCount }),
    });
    if (!res.ok) throw new Error('فشل سحب المحادثات');
    return res.json();
  },

  async bulkUpdateLimit(limit, team = 'all', agentIds = null) {
    const res = await apiFetch('/agents/bulk-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, team, agent_ids: agentIds }),
    });
    if (!res.ok) throw new Error('فشل التحديث الجماعي لليمت النصف ساعة');
    return res.json();
  },

  async updateDailyLimit(agentId, dailyLimit) {
    const res = await apiFetch(`/agents/${agentId}/update-daily-limit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_limit: dailyLimit }),
    });
    if (!res.ok) throw new Error('فشل تحديث ماكس شات اليوم');
    return res.json();
  },

  async bulkUpdateDailyLimit(dailyLimit, team = 'all', agentIds = null) {
    const res = await apiFetch('/agents/bulk-daily-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daily_limit: dailyLimit, team, agent_ids: agentIds }),
    });
    if (!res.ok) throw new Error('فشل التحديث الجماعي لماكس شات اليوم');
    return res.json();
  },

  async syncCrm() {
    const res = await apiFetch('/crm/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('فشل مزامنة الشيفتات من الـ CRM');
    return res.json();
  },

  async loginCrm(email, password) {
    const res = await apiFetch('/crm/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'فشل تسجيل الدخول في الـ CRM');
    }
    return res.json();
  },

  async fetchSettings() {
    const res = await apiFetch('/settings');
    if (!res.ok) throw new Error('فشل جلب الإعدادات');
    const json = await res.json();
    return json.settings || {};
  },

  async saveSettings(settings) {
    const res = await apiFetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('فشل حفظ الإعدادات');
    return res.json();
  },

  async fetchMappings() {
    const res = await apiFetch('/mappings');
    if (!res.ok) throw new Error('فشل جلب الربط');
    const json = await res.json();
    return json.mappings || [];
  },

  async saveMapping(crmName, chatwootAgentId, chatwootAgentName) {
    const res = await apiFetch('/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crm_name: crmName,
        chatwoot_agent_id: chatwootAgentId,
        chatwoot_agent_name: chatwootAgentName
      }),
    });
    if (!res.ok) throw new Error('فشل حفظ الربط');
    return res.json();
  },

  async fetchLogs() {
    const res = await apiFetch('/logs');
    if (!res.ok) throw new Error('فشل جلب السجلات');
    const json = await res.json();
    return json.logs || [];
  },

  async fetchLabels() {
    const res = await apiFetch('/labels');
    if (!res.ok) throw new Error('فشل جلب التصنيفات');
    return res.json();
  },

  async saveLabels(labels) {
    const res = await apiFetch('/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels }),
    });
    if (!res.ok) throw new Error('فشل حفظ التصنيفات');
    return res.json();
  },

  async startRouting() {
    const res = await apiFetch('/routing/start', { method: 'POST' });
    if (!res.ok) throw new Error('فشل تشغيل التوزيع');
    return res.json();
  },

  async stopRouting() {
    const res = await apiFetch('/routing/stop', { method: 'POST' });
    if (!res.ok) throw new Error('فشل إيقاف التوزيع');
    return res.json();
  },

  async runSingleCycle() {
    const res = await apiFetch('/routing/run-cycle', { method: 'POST' });
    if (!res.ok) throw new Error('فشل تشغيل دورة التوزيع');
    return res.json();
  },

  async toggleUnlabeled(enabled) {
    const res = await apiFetch('/routing/toggle-unlabeled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('فشل تحديث إعداد الشاتات بدون ليبل');
    return res.json();
  },

  async updateAgentLabels(agentId, labels) {
    const res = await apiFetch(`/agents/${agentId}/update-labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels }),
    });
    if (!res.ok) throw new Error('فشل تحديث تصنيفات الموظف');
    return res.json();
  },

  async updateAgentShift(agentId, shiftStart, shiftEnd, shiftText) {
    const res = await apiFetch(`/agents/${agentId}/update-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shift_start: shiftStart, shift_end: shiftEnd, shift_text: shiftText }),
    });
    if (!res.ok) throw new Error('فشل تحديث الشيفت يدوياً');
    return res.json();
  },

  async resetAgentShift(agentId) {
    const res = await apiFetch(`/agents/${agentId}/reset-shift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('فشل استعادة شيفت الـ CRM');
    return res.json();
  },

  async applyPreset(agentIds, labels) {
    const res = await apiFetch('/agents/apply-preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_ids: agentIds, labels }),
    });
    if (!res.ok) throw new Error('فشل تطبيق القالب على الموظفين');
    return res.json();
  },

  async fetchAgentChats(agentId) {
    const res = await apiFetch(`/agents/${agentId}/chats`);
    if (!res.ok) throw new Error('فشل جلب شاتات الموظف');
    return res.json();
  },

  async fetchDelaysReport(refresh = false, pages = 6) {
    const query = new URLSearchParams();
    if (refresh) query.set('refresh', 'true');
    if (pages) query.set('pages', String(pages));
    const res = await apiFetch(`/reports/delays?${query.toString()}`);
    if (!res.ok) throw new Error('فشل جلب تقرير التأخيرات');
    return res.json();
  },

  async unassignSingleChat(convId, agentId = null) {
    const res = await apiFetch(`/conversations/${convId}/unassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: agentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل سحب المحادثة للانتظار');
    }
    return res.json();
  },

  async getPendingSummary(force = false) {
    const res = await apiFetch(`/pending-conversations/summary?force=${force ? 'true' : 'false'}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل جلب إحصائيات المحادثات المعلقة');
    }
    return res.json();
  },

  async reopenPending(label, count) {
    const res = await apiFetch('/pending-conversations/reopen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, count: Number(count) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل إعادة فتح المحادثات المعلقة');
    }
    return res.json();
  },

  async updateTeamLabels(coordinatorName, labels) {
    const res = await apiFetch('/teams/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinator_name: coordinatorName, labels }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل تحديث تصنيفات التيم');
    }
    return res.json();
  },

  async refreshChatwootCounts() {
    const res = await apiFetch('/agents/refresh-cw-counts', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل تحديث أرقام الشاتات من شات ووت');
    }
    return res.json();
  }
};


