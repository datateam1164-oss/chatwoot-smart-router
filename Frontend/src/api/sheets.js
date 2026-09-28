/**
 * Google Sheets API Layer
 * يرجى تغيير هذا الرابط بالرابط الذي حصلت عليه بعد نشر سكريبت Google Apps
 */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzo4VKtKaPYEwPr7tB-0gFRY8Z4F1Mhg_Vao7SDPPGindI0jsoywwd5yQJdgaONQ9fX/exec';

export const sheetsApi = {
  // ─── AGENTS ───
  async fetchAgents() {
    try {
      const res = await fetch(APPS_SCRIPT_URL + '?action=agents');
      if (!res.ok) throw new Error('فشل الاتصال بـ Google Sheets');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.agents || [];
    } catch (err) {
      console.error('Error fetching agents:', err);
      throw err;
    }
  },

  async updateAgent(rowIndex, data) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'update', rowIndex, data }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return true;
    } catch (err) {
      console.error('Error updating agent:', err);
      throw err;
    }
  },

  async addAgent(data) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'add', data }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return true;
    } catch (err) {
      console.error('Error adding agent:', err);
      throw err;
    }
  },

  async deleteAgent(rowIndex) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'delete', rowIndex }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return true;
    } catch (err) {
      console.error('Error deleting agent:', err);
      throw err;
    }
  },
  
  // ─── EVENTS ───
  async fetchEvents() {
    try {
      const res = await fetch(APPS_SCRIPT_URL + '?action=events');
      if (!res.ok) throw new Error('فشل الاتصال بـ Google Sheets');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.events || [];
    } catch (err) {
      console.error('Error fetching events:', err);
      throw err;
    }
  },
  
  // ─── LABELS ───
  async fetchLabels() {
    try {
      const res = await fetch(APPS_SCRIPT_URL + '?action=labels');
      if (!res.ok) throw new Error('فشل الاتصال بـ Google Sheets');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.labels || [];
    } catch (err) {
      console.error('Error fetching labels:', err);
      throw err;
    }
  },
  
  async updateLabels(labelsArray) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'update_labels', labels: labelsArray }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return true;
    } catch (err) {
      console.error('Error updating labels:', err);
      throw err;
    }
  }
};
