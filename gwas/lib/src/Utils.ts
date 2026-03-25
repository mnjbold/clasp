/**
 * General-purpose utilities shared across all GWAS modules.
 */

// ─── IDs ─────────────────────────────────────────────────────────────────────

/**
 * Generates a short unique ID (8 hex chars). Suitable for task IDs, project
 * IDs, approval IDs, etc. Not cryptographically secure.
 */
function generateId(): string {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Returns today's date as YYYY-MM-DD in the script's timezone. */
function todayIso(): string {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Formats a Date as YYYY-MM-DD. */
function toIsoDate(date: Date): string {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Formats a Date as YYYY-MM-DDTHH:mm. */
function toIsoDateTime(date: Date): string {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
}

/** Parses an ISO date string (YYYY-MM-DD) into a Date at midnight local time. */
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Returns true if the given ISO date string is today or in the past. */
function isOverdue(isoDate: string): boolean {
  if (!isoDate) return false;
  const due = parseIsoDate(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/** Returns true if the given ISO date string is today. */
function isDueToday(isoDate: string): boolean {
  if (!isoDate) return false;
  return isoDate === todayIso();
}

/** Returns the number of days until the given ISO date (negative if past). */
function daysUntil(isoDate: string): number {
  const due = parseIsoDate(isoDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

// ─── Email ───────────────────────────────────────────────────────────────────

/**
 * Sends an email via GmailApp. Falls back to MailApp if GmailApp quota is
 * exhausted. Logs the send attempt.
 */
function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  replyTo?: string;
}): void {
  const { to, subject, body, htmlBody, replyTo } = params;
  try {
    GmailApp.sendEmail(to, subject, body, {
      htmlBody: htmlBody ?? body,
      replyTo: replyTo ?? '',
      name: 'GWAS Workspace Assistant',
    });
    gwasLog('Utils', 'INFO', `Email sent to ${to}: "${subject}"`);
  } catch (e) {
    // GmailApp may fail if the script isn't running as the user; fall back.
    MailApp.sendEmail({
      to,
      subject,
      body,
      htmlBody: htmlBody ?? body,
      name: 'GWAS Workspace Assistant',
    });
    gwasLog('Utils', 'WARN', `Email sent via MailApp fallback to ${to}: "${subject}"`);
  }
}

// ─── Logging ─────────────────────────────────────────────────────────────────

/**
 * Writes a log entry to the System Log spreadsheet and to Logger.
 * Columns: Timestamp | Module | Level | Message
 */
function gwasLog(module: string, level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  Logger.log(`[${level}] [${module}] ${message}`);

  try {
    const logSsId = getConfigOptional('LOG_SPREADSHEET_ID');
    if (!logSsId) return;

    const ss = SpreadsheetApp.openById(logSsId);
    let sheet = ss.getSheetByName('System Log');
    if (!sheet) {
      sheet = ss.insertSheet('System Log');
      sheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Module', 'Level', 'Message']]);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([new Date(), module, level, message]);

    // Keep log to last 5,000 rows to avoid unbounded growth.
    const maxRows = 5000;
    const lastRow = sheet.getLastRow();
    if (lastRow > maxRows + 1) {
      sheet.deleteRows(2, lastRow - maxRows - 1);
    }
  } catch (_) {
    // Never let logging failures break the calling module.
  }
}

// ─── Sheets helpers ──────────────────────────────────────────────────────────

/**
 * Finds the first row in a sheet where the value in `column` matches `value`.
 * Returns the 1-based row number, or -1 if not found.
 */
function findRowByValue(sheet: GoogleAppsScript.Spreadsheet.Sheet, column: number, value: string): number {
  const data = sheet.getRange(2, column, Math.max(sheet.getLastRow() - 1, 1), 1).getValues() as string[][];
  for (let i = 0; i < data.length; i++) {
    if (data[i][0]?.toString() === value) return i + 2;
  }
  return -1;
}

/**
 * Returns the header row of a sheet as an array of strings.
 */
function getSheetHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[] {
  if (sheet.getLastRow() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] as string[];
}

/**
 * Converts a sheet row (array) into a keyed object using the header row.
 */
function rowToObject(headers: string[], row: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  headers.forEach((h, i) => { obj[h] = row[i]; });
  return obj;
}

// ─── HTML email templates ─────────────────────────────────────────────────────

/**
 * Wraps content in a simple, clean HTML email shell.
 */
function wrapHtmlEmail(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Google Sans, Arial, sans-serif; color: #202124; margin: 0; padding: 0; background: #f8f9fa; }
    .container { max-width: 600px; margin: 24px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
    .header { background: #1a73e8; color: #fff; padding: 20px 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 500; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: .85; }
    .body { padding: 24px; }
    .section { margin-bottom: 20px; }
    .section h2 { font-size: 14px; font-weight: 600; color: #1a73e8; margin: 0 0 8px; text-transform: uppercase; letter-spacing: .5px; }
    .item { padding: 8px 0; border-bottom: 1px solid #f1f3f4; font-size: 14px; }
    .item:last-child { border-bottom: none; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
    .p1 { background: #fce8e6; color: #c5221f; }
    .p2 { background: #fef7e0; color: #b06000; }
    .p3 { background: #e6f4ea; color: #137333; }
    .footer { padding: 16px 24px; background: #f8f9fa; font-size: 12px; color: #80868b; text-align: center; }
    a { color: #1a73e8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
      <p>GWAS · Google Workspace Automation System · ${new Date().toDateString()}</p>
    </div>
    <div class="body">${bodyHtml}</div>
    <div class="footer">Sent by GWAS. To adjust your notification preferences, contact your workspace admin.</div>
  </div>
</body>
</html>`;
}
