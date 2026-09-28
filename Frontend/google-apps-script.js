/**
 * Google Apps Script — Chatwoot Dashboard Sheet Integration
 * ✅ مضاف: نسخ احتياطي يومي تلقائي لشيت ChatsLog
 *
 * === كيفية التركيب ===
 * 1. افتح الـ Google Sheet
 * 2. اذهب إلى Extensions > Apps Script
 * 3. امسح الكود الموجود والصق هذا الكود بالكامل
 * 4. اضغط Deploy > New deployment
 * 5. اختر Type: Web App
 * 6. Execute as: Me
 * 7. Who has access: Anyone
 * 8. اضغط Deploy وانسخ الرابط الجديد
 * 9. الصق الرابط في ملف src/api/sheets.js (المتغير APPS_SCRIPT_URL)
 *
 * === تفعيل الباكاب اليومي ===
 * بعد حفظ الكود، شغّل الفنكشن دي مرة واحدة بس من قائمة Run:
 *   setupDailyTrigger()
 * هيتعمل تريجر تلقائي كل يوم الساعة 1 الصبح حتى لو الجهاز مقفول
 */

// ─────────────────────────────────────────────
//  HELPER
// ─────────────────────────────────────────────
function getSheetFlexibly(ss, possibleNames) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName().toLowerCase().trim();
    for (var j = 0; j < possibleNames.length; j++) {
      if (name === possibleNames[j].toLowerCase().trim()) {
        return sheets[i];
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────
//  ✅ BACKUP CHATSLOG يومياً
// ─────────────────────────────────────────────

/**
 * يعمل نسخة من شيت ChatsLog ويحطها في الفولدر المحدد
 * اسم الملف = تاريخ اليوم (مثال: 28-06-2026)
 * بيشتغل تلقائياً كل يوم عبر Time-based Trigger
 */
function backupChatsLog() {
  try {
    var ss         = SpreadsheetApp.getActiveSpreadsheet();
    var sourceSheet = getSheetFlexibly(ss, ['chatslog', 'chats log']);

    if (!sourceSheet) {
      Logger.log('❌ مش لاقي شيت ChatsLog');
      return;
    }

    var FOLDER_ID = '1ecH8RZ8DVS7HU16VkizFDFQx1Wprb7Zf';
    var folder    = DriveApp.getFolderById(FOLDER_ID);

    // اسم الملف = التاريخ بالصيغة dd-MM-yyyy
    var today    = Utilities.formatDate(new Date(), 'Africa/Cairo', 'dd-MM-yyyy');
    var fileName = today; // مثال: 28-06-2026

    // إنشاء Spreadsheet جديد في الـ Root أولاً
    var newSS = SpreadsheetApp.create(fileName);

    // نسخ شيت ChatsLog للـ Spreadsheet الجديد
    var copiedSheet = sourceSheet.copyTo(newSS);
    copiedSheet.setName('ChatsLog');

    // حذف الشيت الافتراضي اللي بيتعمل مع أي Spreadsheet جديد
    var defaultSheet = newSS.getSheetByName('Sheet1');
    if (defaultSheet) {
      newSS.deleteSheet(defaultSheet);
    }

    // نقل الملف من Root للفولدر المطلوب
    var file = DriveApp.getFileById(newSS.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    Logger.log('✅ تم الباكاب بنجاح: ' + fileName);

  } catch (err) {
    Logger.log('❌ خطأ في الباكاب: ' + err.message);
  }
}

/**
 * شغّل الفنكشن دي مرة واحدة فقط لتفعيل الباكاب اليومي
 * بعدها هتلاقيه في Triggers (ساعة المنبه بتاعك)
 */
function setupDailyTrigger() {
  // احذف أي trigger قديم للباكاب عشان ما يتكررش
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'backupChatsLog') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // تريجر يومي الساعة 1 الصبح (Cairo)
  ScriptApp.newTrigger('backupChatsLog')
    .timeBased()
    .everyDays(1)
    .atHour(1)
    .inTimezone('Africa/Cairo')
    .create();

  Logger.log('✅ Daily Trigger اتعمل! هيشتغل كل يوم الساعة 1 الصبح تلقائياً.');
}

// ─────────────────────────────────────────────
//  doGet — كود موجود + action جديد للباكاب اليدوي
// ─────────────────────────────────────────────
function doGet(e) {
  try {
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var action = e.parameter.action || 'agents';

    // ── 1. Fetch Agents ──────────────────────────────────────
    if (action === 'agents') {
      var sheet  = ss.getSheets()[0];
      var data   = sheet.getDataRange().getValues();
      var agents = [];

      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (!row[0] && !row[1]) continue;
        agents.push({
          rowIndex:      i + 1,
          id:            String(Math.floor(Number(row[0]))),
          name:          String(row[1]).trim(),
          shiftStart:    String(row[2]).trim(),
          shiftEnd:      String(row[3]).trim(),
          maxChats:      Number(row[4]) || 150,
          assignedChats: String(row[5]).trim(),
          team:          String(row[6]).trim(),
        });
      }
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, agents: agents }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 2. Fetch Events ──────────────────────────────────────
    else if (action === 'events') {
      var sheet = getSheetFlexibly(ss, ['chatslog', 'chats log']);
      if (!sheet) throw new Error('لا يوجد شيت باسم ChatsLog');
      var data   = sheet.getDataRange().getValues();
      var events = [];

      for (var i = 1; i < data.length; i++) {
        var row = data[i];

        var id         = row[0] ? String(row[0]) : (row[7]  ? String(row[7])  : '');
        if (!id) continue;
        var time       = row[0] ? String(row[1]) : String(row[8]  || '');
        var assignedTo = row[0] ? String(row[2]) : String(row[9]  || '');
        var phone      = row[0] ? String(row[3]) : String(row[10] || '');
        var label      = row[0] ? String(row[4]) : String(row[11] || '');
        var desc       = row[0] ? String(row[5] || '') : String(row[12] || '');

        events.push({ id, time, assignedTo, phone, label, desc });
      }
      events = events.reverse().slice(0, 50);
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, events: events }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 3. Fetch Labels ──────────────────────────────────────
    else if (action === 'labels') {
      var sheet = getSheetFlexibly(ss, ['settings', 'labels', 'lables']);
      if (!sheet) {
        var allNames = ss.getSheets().map(function(s) { return s.getName(); }).join(', ');
        throw new Error('لا يوجد شيت باسم Labels أو Settings. الشيتات المتاحة: ' + allNames);
      }
      var data   = sheet.getRange('A2:A').getValues();
      var labels = [];
      for (var i = 0; i < data.length; i++) {
        if (data[i][0]) labels.push(String(data[i][0]).trim());
      }
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, labels: labels }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 4. ✅ Manual Backup (للتجربة اليدوية عبر URL) ────────
    else if (action === 'backup') {
      backupChatsLog();
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'تم الباكاب بنجاح' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    else {
      throw new Error('Action غير معروف: ' + action);
    }

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─────────────────────────────────────────────
//  doPost — كود موجود بدون تغيير
// ─────────────────────────────────────────────
function doPost(e) {
  try {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var body = JSON.parse(e.postData.contents);

    // === AGENTS ===
    if (body.action === 'update' || body.action === 'add' || body.action === 'delete') {
      var sheet = ss.getSheets()[0];

      if (body.action === 'update') {
        var row = body.rowIndex;
        var d   = body.data;
        if (d.id         !== undefined) sheet.getRange(row, 1).setValue(Number(d.id));
        if (d.name       !== undefined) sheet.getRange(row, 2).setValue(d.name);
        if (d.shiftStart !== undefined) sheet.getRange(row, 3).setValue(d.shiftStart);
        if (d.shiftEnd   !== undefined) sheet.getRange(row, 4).setValue(d.shiftEnd);
        if (d.maxChats   !== undefined) sheet.getRange(row, 5).setValue(Number(d.maxChats));
        if (d.team       !== undefined) sheet.getRange(row, 7).setValue(d.team);
      }
      else if (body.action === 'add') {
        var d = body.data;
        sheet.appendRow([
          Number(d.id),
          d.name       || '',
          d.shiftStart || '',
          d.shiftEnd   || '',
          Number(d.maxChats) || 150,
          '',
          d.team || '',
        ]);
      }
      else if (body.action === 'delete') {
        sheet.deleteRow(body.rowIndex);
      }
    }

    // === LABELS ===
    else if (body.action === 'update_labels') {
      var sheet = getSheetFlexibly(ss, ['settings', 'labels', 'lables']);
      if (!sheet) throw new Error('لا يوجد شيت باسم Labels لتحديثه');

      sheet.getRange('A2:A').clearContent();

      var labelsArray = body.labels;
      if (labelsArray && labelsArray.length > 0) {
        var values = labelsArray.map(function(lbl) { return [lbl]; });
        sheet.getRange(2, 1, values.length, 1).setValues(values);
      }
    }

    else {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}