export const COORDINATOR_ARABIC_NAMES = {
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

export const normalizeArabic = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .trim();
};

export const formatHour12 = (h) => {
  if (h === undefined || h === null) return '--:--';
  const period = (h >= 12 && h < 24) ? 'م' : 'ص';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:00 ${period}`;
};

export const formatHour12En = (h) => {
  if (h === undefined || h === null) return '--:--';
  const period = (h >= 12 && h < 24) ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, '0')}:00 ${period}`;
};

export const formatTime12 = (isoOrDate) => {
  if (!isoOrDate) return '--:--';
  try {
    const d = new Date(isoOrDate);
    if (isNaN(d.getTime())) return '--:--';
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const period = (h >= 12 && h < 24) ? 'م' : 'ص';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${String(h12).padStart(2, '0')}:${m} ${period}`;
  } catch (_) {
    return '--:--';
  }
};

export const getWindowTimingInfo = (agent, windowMinutes = 30) => {
  const currentChats = agent?.current_window_chats || 0;
  const startStr = agent?.window_start_time;

  if (!startStr || currentChats === 0) {
    return {
      hasActiveWindow: false,
      startFormatted: null,
      endFormatted: null,
      remainingMinutes: 0,
      remainingSeconds: 0,
      label: 'لم يبدأ بعد (30د جديدة)'
    };
  }

  try {
    const start = new Date(startStr);
    const end = agent?.window_end_time 
      ? new Date(agent.window_end_time) 
      : new Date(start.getTime() + windowMinutes * 60 * 1000);
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const remainingSec = Math.max(0, Math.floor(diffMs / 1000));
    const remainingMin = agent?.window_remaining_minutes ?? Math.max(0, Math.ceil(remainingSec / 60));

    return {
      hasActiveWindow: remainingSec > 0,
      startFormatted: formatTime12(start),
      endFormatted: formatTime12(end),
      remainingMinutes: remainingMin,
      remainingSeconds: remainingSec,
      label: remainingSec > 0 
        ? `${formatTime12(start)} - ${formatTime12(end)} (متبقي ${remainingMin}د)`
        : 'اكتملت النصف ساعة (جاري التصفير)'
    };
  } catch (_) {
    return {
      hasActiveWindow: false,
      startFormatted: null,
      endFormatted: null,
      remainingMinutes: 0,
      remainingSeconds: 0,
      label: 'غير محدد'
    };
  }
};

/**
 * Calculates real-time eligibility status for an agent based on backend business rules:
 * - is_selected
 * - in_shift (and shift grace period: first 30m of shift_start)
 * - is_paused
 * - current_window_chats >= chat_limit (30m window full)
 * - today_chats_count >= daily_chat_limit (daily max reached)
 */
export const getAgentStatus = (agent) => {
  if (!agent.is_selected) {
    return {
      key: 'unselected',
      label: 'مستبعد من التوزيع',
      color: 'var(--text-dim)',
      bg: 'rgba(100, 116, 139, 0.12)',
      border: 'var(--border-subtle)',
      icon: '✕',
      isReady: false,
      reason: 'تم إلغاء تحديده يدوياً'
    };
  }

  if (agent.is_paused) {
    return {
      key: 'paused',
      label: 'موقوف مؤقتاً',
      color: 'var(--badge-paused-text)',
      bg: 'var(--badge-paused-bg)',
      border: 'var(--badge-paused-border)',
      icon: '⏸️',
      isReady: false,
      reason: 'في استراحة أو إيقاف مؤقت'
    };
  }

  if (!agent.in_shift) {
    return {
      key: 'out_shift',
      label: 'خارج الشيفت',
      color: 'var(--text-muted)',
      bg: 'rgba(148, 163, 184, 0.1)',
      border: 'var(--border-subtle)',
      icon: '⚪',
      isReady: false,
      reason: 'خارج ساعات العمل المقررة'
    };
  }

  const dailyLim = agent.daily_chat_limit || 100;
  const todayCount = agent.today_chats_count || 0;
  if (agent.is_daily_max_reached || todayCount >= dailyLim) {
    return {
      key: 'daily_full',
      label: 'ماكس اليوم ممتلئ',
      color: 'var(--badge-capped-text)',
      bg: 'var(--badge-capped-bg)',
      border: 'var(--badge-capped-border)',
      icon: '🛑',
      isReady: false,
      reason: `وصل للحد الأقصى اليومي (${todayCount}/${dailyLim})`
    };
  }

  const currWindow = agent.current_window_chats || 0;
  const windowLim = agent.chat_limit || 10;
  if (currWindow >= windowLim) {
    return {
      key: 'window_full',
      label: 'سقف النصف ساعة',
      color: 'var(--badge-paused-text)',
      bg: 'var(--badge-paused-bg)',
      border: 'var(--badge-paused-border)',
      icon: '🔒',
      isReady: false,
      reason: `استلم ${currWindow} من ${windowLim} شات في النافذة الحالية`
    };
  }

  // Check 30m grace period at shift start
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  if (agent.shift_start !== null && agent.shift_start !== undefined && currentHour === agent.shift_start && currentMinute < 30) {
    return {
      key: 'grace_period',
      label: 'فترة سماح (30د)',
      color: 'var(--primary)',
      bg: 'var(--primary-bg)',
      border: 'var(--primary-border)',
      icon: '⏳',
      isReady: false,
      reason: 'بداية الشيفت - فترة سماح أول 30 دقيقة'
    };
  }

  return {
    key: 'ready',
    label: 'جاهز للتوزيع',
    color: 'var(--badge-ready-text)',
    bg: 'var(--badge-ready-bg)',
    border: 'var(--badge-ready-border)',
    icon: '🟢',
    isReady: true,
    reason: 'متاح بالشيفت ويستقبل محادثات جديدة'
  };
};

export const LABEL_ARABIC_NAMES = {
  'price_inquiry': 'استفسار عن السعر (Price Inquiry)',
  'discount_inquiry': 'استفسار عن الخصومات (Discount Inquiry)',
  'high_price_complain': 'اعتراض على السعر (High Price Complain)',
  'package_compare': 'مقارنة الباقات (Package Compare)',
  'moasker': 'معسكر (Moasker)',
  'taqfel': 'تقفيل (Taqfel)',
  'complete_profile': 'استكمال بيانات (Complete Profile)',
  'unclassified': 'غير مصنف (Unclassified)',
  'unlabeled': 'بدون ليبل (Unlabeled)'
};
