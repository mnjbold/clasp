/**
 * Dashboard data refresh — pulls live data from all module spreadsheets
 * and updates the dashboard sheets. Runs every 30 minutes via time trigger.
 */

function refreshDashboard(): void {
  GWAS.gwasLog('Dashboard', 'INFO', 'Starting dashboard refresh...');
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    _refreshOverviewKpis(ss);
    _refreshTeamActivity(ss);
    _refreshProjects(ss);
    _refreshTasks(ss);
    _refreshCalendar(ss);

    // Stamp last-refreshed time on Overview.
    const overview = ss.getSheetByName('Overview');
    if (overview) {
      overview.getRange('A2:F2').setValue(`Last refreshed: ${new Date().toLocaleString()}`);
    }

    GWAS.gwasLog('Dashboard', 'INFO', 'Dashboard refresh complete.');
  } catch (e) {
    GWAS.gwasLog('Dashboard', 'ERROR', `Dashboard refresh failed: ${(e as Error).message}`);
  }
}

// ─── Overview KPIs ────────────────────────────────────────────────────────────

function _refreshOverviewKpis(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  const overview = ss.getSheetByName('Overview');
  if (!overview) return;

  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');

  let openTasks = 0, overdueTasks = 0;
  if (tasksSheet && tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 11).getValues();
    const today = GWAS.todayIso();
    data.forEach(row => {
      const status = row[5]?.toString();
      const due = row[7]?.toString();
      if (status !== 'done') {
        openTasks++;
        if (due && due < today) overdueTasks++;
      }
    });
  }

  const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const projectsSheet = projectsSs.getSheetByName('Projects');
  let activeProjects = 0;
  if (projectsSheet && projectsSheet.getLastRow() > 1) {
    const data = projectsSheet.getRange(2, 4, projectsSheet.getLastRow() - 1, 1).getValues();
    activeProjects = data.filter(r => r[0] === 'active').length;
  }

  // Today's meetings from Calendar.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const cal = CalendarApp.getDefaultCalendar();
  const meetingsToday = cal.getEvents(today, tomorrow).filter(e => e.getGuestList().length > 0).length;

  // Pending approvals count.
  const dashSs = SpreadsheetApp.getActiveSpreadsheet();
  const approvalsSheet = dashSs.getSheetByName('Pending Approvals');
  let pendingApprovals = 0;
  if (approvalsSheet && approvalsSheet.getLastRow() > 1) {
    const statuses = approvalsSheet.getRange(2, 10, approvalsSheet.getLastRow() - 1, 1).getValues();
    pendingApprovals = statuses.filter(r => r[0] === 'pending').length;
  }

  // KB article count.
  const kbSs = SpreadsheetApp.openById(GWAS.getConfig('KB_SPREADSHEET_ID'));
  const kbSheet = kbSs.getSheetByName('KB Index');
  const kbArticles = kbSheet ? Math.max(kbSheet.getLastRow() - 1, 0) : 0;

  // Write KPI values (row 5, columns A-F).
  overview.getRange('A5').setValue(openTasks);
  overview.getRange('B5').setValue(overdueTasks);
  overview.getRange('C5').setValue(activeProjects);
  overview.getRange('D5').setValue(meetingsToday);
  overview.getRange('E5').setValue(pendingApprovals);
  overview.getRange('F5').setValue(kbArticles);

  // Colour overdue KPI red if non-zero.
  overview.getRange('B5').setBackground(overdueTasks > 0 ? '#fce8e6' : '#e8f0fe');
  overview.getRange('E5').setBackground(pendingApprovals > 0 ? '#fef7e0' : '#e8f0fe');
}

// ─── Team Activity ────────────────────────────────────────────────────────────

function _refreshTeamActivity(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  const sheet = ss.getSheetByName('Team Activity');
  if (!sheet) return;

  const members = GWAS.getTeamMembers();
  if (members.length === 0) return;

  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  const today = GWAS.todayIso();

  // Clear existing data rows.
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).clearContent();

  const rows: unknown[][] = members.map(member => {
    let dueToday = 0, overdue = 0, inProgress = 0;

    if (tasksSheet && tasksSheet.getLastRow() > 1) {
      const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 11).getValues();
      data.forEach(row => {
        if (row[3]?.toString() !== member.email) return;
        const status = row[5]?.toString();
        const due = row[7]?.toString();
        if (status === 'done') return;
        if (status === 'in_progress') inProgress++;
        if (due === today) dueToday++;
        if (due && due < today) overdue++;
      });
    }

    // Today's meetings for this member.
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    let meetingsCount = 0;
    try {
      const memberCal = CalendarApp.getCalendarsByName(member.name)[0] ?? CalendarApp.getDefaultCalendar();
      meetingsCount = memberCal.getEvents(todayStart, todayEnd).filter(e => e.getGuestList().length > 0).length;
    } catch (_) { /* calendar may not be accessible */ }

    return [member.name, member.email, dueToday, overdue, inProgress, meetingsCount, '—', '—'];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 8).setValues(rows);
    // Highlight overdue > 0 in red.
    rows.forEach((row, i) => {
      if ((row[3] as number) > 0) {
        sheet.getRange(i + 2, 4).setBackground('#fce8e6').setFontWeight('bold');
      }
    });
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function _refreshProjects(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  const sheet = ss.getSheetByName('Projects');
  if (!sheet) return;

  const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const srcSheet = projectsSs.getSheetByName('Projects');
  if (!srcSheet || srcSheet.getLastRow() < 2) return;

  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).clearContent();

  const data = srcSheet.getRange(2, 1, srcSheet.getLastRow() - 1, 12).getValues();
  const today = GWAS.todayIso();

  const rows = data
    .filter(r => r[3] === 'active' || r[3] === 'planning')
    .map(r => {
      const targetDate = r[7]?.toString() ?? '';
      const daysLeft = targetDate ? GWAS.daysUntil(targetDate) : '—';
      return [r[0], r[1], r[3], r[4], `${r[10]}%`, targetDate, daysLeft, r[8], r[9]];
    });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
    // Highlight projects with ≤7 days left.
    rows.forEach((row, i) => {
      const days = row[6];
      if (typeof days === 'number' && days <= 7) {
        sheet.getRange(i + 2, 1, 1, 9).setBackground(days <= 1 ? '#fce8e6' : '#fef7e0');
      }
    });
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

function _refreshTasks(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  const sheet = ss.getSheetByName('Tasks');
  if (!sheet) return;

  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const srcSheet = tasksSs.getSheetByName('Tasks');
  if (!srcSheet || srcSheet.getLastRow() < 2) return;

  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).clearContent();

  const data = srcSheet.getRange(2, 1, srcSheet.getLastRow() - 1, 11).getValues();
  const today = GWAS.todayIso();

  // Show only non-done tasks, sorted by due date.
  const rows = data
    .filter(r => r[5] !== 'done')
    .sort((a, b) => (a[7] as string).localeCompare(b[7] as string))
    .slice(0, 100) // cap at 100 rows on dashboard
    .map(r => [r[0], r[1], r[3], r[4], r[5], r[6], r[7], r[9], r[8]]);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
    rows.forEach((row, i) => {
      const due = row[6]?.toString() ?? '';
      if (due && due < today) {
        sheet.getRange(i + 2, 1, 1, 9).setBackground('#fce8e6');
      } else if (due === today) {
        sheet.getRange(i + 2, 1, 1, 9).setBackground('#fef7e0');
      }
    });
  }
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

function _refreshCalendar(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  const sheet = ss.getSheetByName('Calendar');
  if (!sheet) return;

  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).clearContent();

  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 86400000);
  const cal = CalendarApp.getDefaultCalendar();
  const events = cal.getEvents(now, weekEnd);

  const rows = events.map(e => {
    const start = e.getStartTime();
    const end = e.getEndTime();
    const duration = Math.round((end.getTime() - start.getTime()) / 60000);
    const desc = e.getDescription() ?? '';
    const notesMatch = desc.match(/https:\/\/docs\.google\.com\/document\/[^\s)]+/);
    return [
      GWAS.toIsoDate(start),
      Utilities.formatDate(start, Session.getScriptTimeZone(), 'HH:mm'),
      e.getTitle(),
      e.getCreators()[0] ?? '',
      e.getGuestList().length,
      e.getConferenceData()?.getEntryPoints()?.[0]?.getUri() ?? '',
      notesMatch ? notesMatch[0] : '',
      duration,
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  }
}

// ─── Weekly AI Insights ───────────────────────────────────────────────────────

function generateWeeklyInsights(): void {
  GWAS.gwasLog('Dashboard', 'INFO', 'Generating weekly AI insights...');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('AI Insights');
  if (!sheet) return;

  // Gather summary stats for the prompt.
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  let completedThisWeek = 0, overdueCount = 0, totalOpen = 0;

  if (tasksSheet && tasksSheet.getLastRow() > 1) {
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 11).getValues();
    data.forEach(row => {
      const status = row[5]?.toString();
      const due = row[7]?.toString();
      if (status === 'done') completedThisWeek++;
      else {
        totalOpen++;
        if (due && GWAS.isOverdue(due)) overdueCount++;
      }
    });
  }

  const members = GWAS.getTeamMembers();
  const prompt = `You are a workspace intelligence assistant. Generate a concise weekly team insights summary based on these metrics:

Team size: ${members.length} members
Tasks completed this week: ${completedThisWeek}
Tasks currently open: ${totalOpen}
Overdue tasks: ${overdueCount}
Week of: ${GWAS.todayIso()}

Write 3-5 sentences covering:
1. Overall team productivity signal
2. Any concerns (e.g. high overdue count)
3. A motivational or actionable recommendation for the coming week

Keep it professional, factual, and concise. No bullet points — flowing prose only.`;

  const insight = GWAS.callGemini(prompt);

  sheet.getRange('B4').setValue(GWAS.todayIso());
  sheet.getRange('A6:F30').merge().setValue(insight).setWrap(true).setFontSize(13).setFontColor('#202124');

  GWAS.gwasLog('Dashboard', 'INFO', 'Weekly AI insights generated.');
}

// ─── Approval expiry ──────────────────────────────────────────────────────────

function runExpireApprovals(): void {
  GWAS.expireOldApprovals();
}
