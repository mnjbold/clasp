/**
 * One-time setup for the Master Dashboard spreadsheet.
 * Run `setupDashboard()` once after binding this script to the spreadsheet.
 */

const SHEET_NAMES = {
  OVERVIEW: 'Overview',
  TEAM_ACTIVITY: 'Team Activity',
  PROJECTS: 'Projects',
  TASKS: 'Tasks',
  CALENDAR: 'Calendar',
  DIGEST_LOG: 'Digest Log',
  KB_INDEX: 'KB Index',
  AI_INSIGHTS: 'AI Insights',
  PENDING_APPROVALS: 'Pending Approvals',
  SYSTEM_LOG: 'System Log',
} as const;

function setupDashboard(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  GWAS.gwasLog('Dashboard', 'INFO', 'Starting dashboard setup...');

  _setupOverviewSheet(ss);
  _setupTeamActivitySheet(ss);
  _setupProjectsSheet(ss);
  _setupTasksSheet(ss);
  _setupCalendarSheet(ss);
  _setupDigestLogSheet(ss);
  _setupKbIndexSheet(ss);
  _setupAiInsightsSheet(ss);
  _setupPendingApprovalsSheet(ss);
  _setupSystemLogSheet(ss);
  _setupTriggers();

  GWAS.gwasLog('Dashboard', 'INFO', 'Dashboard setup complete.');
  SpreadsheetApp.getUi().alert('✅ GWAS Dashboard setup complete!\n\nNext steps:\n1. Fill in Script Properties (Extensions → Apps Script → Project Settings)\n2. Add team members to the Team Registry spreadsheet\n3. Run refreshDashboard() to populate data');
}

function _setupOverviewSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.OVERVIEW);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.OVERVIEW, 0);
  sheet.clear();

  // Title
  sheet.getRange('A1:F1').merge().setValue('🏠 GWAS Master Dashboard').setFontSize(18).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff').setHorizontalAlignment('center');
  sheet.getRange('A2:F2').merge().setValue('Last refreshed: —').setFontColor('#80868b').setHorizontalAlignment('center').setFontStyle('italic');

  // KPI cards row
  const kpiLabels = ['Open Tasks', 'Overdue Tasks', 'Active Projects', 'Meetings Today', 'Pending Approvals', 'KB Articles'];
  const kpiCells = ['A4', 'B4', 'C4', 'D4', 'E4', 'F4'];
  const kpiValueCells = ['A5', 'B5', 'C5', 'D5', 'E5', 'F5'];
  const kpiColors = ['#e8f0fe', '#fce8e6', '#e6f4ea', '#fef7e0', '#f3e8fd', '#e8f0fe'];

  kpiLabels.forEach((label, i) => {
    const labelCell = sheet!.getRange(kpiCells[i]);
    labelCell.setValue(label).setFontWeight('bold').setFontSize(10).setBackground(kpiColors[i]).setHorizontalAlignment('center').setVerticalAlignment('middle');

    const valueCell = sheet!.getRange(kpiValueCells[i]);
    valueCell.setValue('—').setFontSize(28).setFontWeight('bold').setBackground(kpiColors[i]).setHorizontalAlignment('center').setVerticalAlignment('middle');
  });

  sheet.setRowHeight(4, 30);
  sheet.setRowHeight(5, 60);
  sheet.setColumnWidths(1, 6, 140);

  // Section headers
  sheet.getRange('A7').setValue('📋 Recent Tasks').setFontWeight('bold').setFontSize(12).setFontColor('#1a73e8');
  sheet.getRange('D7').setValue('📅 Today\'s Meetings').setFontWeight('bold').setFontSize(12).setFontColor('#1a73e8');
  sheet.getRange('A15').setValue('🚀 Active Projects').setFontWeight('bold').setFontSize(12).setFontColor('#1a73e8');
  sheet.getRange('D15').setValue('⏳ Pending Approvals').setFontWeight('bold').setFontSize(12).setFontColor('#1a73e8');
}

function _setupTeamActivitySheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.TEAM_ACTIVITY);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.TEAM_ACTIVITY);
  sheet.clear();

  const headers = ['Name', 'Email', 'Tasks Due Today', 'Overdue Tasks', 'Tasks In Progress', 'Meetings Today', 'Active Project', 'Last Digest Sent'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 160);
}

function _setupProjectsSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.PROJECTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.PROJECTS);
  sheet.clear();

  const headers = ['Project ID', 'Name', 'Status', 'Owner', 'Progress %', 'Target Date', 'Days Left', 'Spec Doc', 'Drive Folder'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 140);
}

function _setupTasksSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.TASKS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.TASKS);
  sheet.clear();

  const headers = ['Task ID', 'Title', 'Owner', 'Project', 'Status', 'Priority', 'Due Date', 'Source', 'Created'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 140);
}

function _setupCalendarSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.CALENDAR);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.CALENDAR);
  sheet.clear();

  const headers = ['Date', 'Time', 'Title', 'Organizer', 'Attendees', 'Meet Link', 'Notes Doc', 'Duration (min)'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 150);
}

function _setupDigestLogSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.DIGEST_LOG);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.DIGEST_LOG);
  sheet.clear();

  const headers = ['Timestamp', 'Digest Type', 'Recipients', 'Delivery Channel', 'Status', 'Error'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 160);
}

function _setupKbIndexSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.KB_INDEX);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.KB_INDEX);
  sheet.clear();

  const headers = ['KB ID', 'Title', 'Source', 'URL', 'Summary', 'Tags', 'Last Indexed'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 180);
}

function _setupAiInsightsSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.AI_INSIGHTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.AI_INSIGHTS);
  sheet.clear();

  sheet.getRange('A1').setValue('🤖 AI Insights').setFontSize(16).setFontWeight('bold').setFontColor('#1a73e8');
  sheet.getRange('A2').setValue('Generated every Monday at 8 AM by Gemini').setFontColor('#80868b').setFontStyle('italic');
  sheet.getRange('A4').setValue('Week of').setFontWeight('bold');
  sheet.getRange('B4').setValue('—');
  sheet.getRange('A5').setValue('Insight').setFontWeight('bold');
  sheet.getRange('A6:F30').merge().setValue('No insights generated yet. Run generateWeeklyInsights() to populate.').setFontColor('#80868b').setWrap(true);
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 600);
}

function _setupPendingApprovalsSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.PENDING_APPROVALS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.PENDING_APPROVALS);
  sheet.clear();

  const headers = ['Approval ID', 'Action Type', 'Payload (JSON)', 'Requested By', 'Assigned To', 'Chat Space ID', 'Chat Message ID', 'Created At', 'Expires At', 'Status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 160);
  sheet.setColumnWidth(3, 300); // Payload column wider
}

function _setupSystemLogSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(SHEET_NAMES.SYSTEM_LOG);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAMES.SYSTEM_LOG);
  sheet.clear();

  const headers = ['Timestamp', 'Module', 'Level', 'Message'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 4, [180, 140, 80, 500]);
}

function _setupTriggers(): void {
  // Remove any existing triggers for this script to avoid duplicates.
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Refresh dashboard every 30 minutes.
  ScriptApp.newTrigger('refreshDashboard').timeBased().everyMinutes(30).create();

  // Weekly AI insights every Monday at 8 AM.
  ScriptApp.newTrigger('generateWeeklyInsights').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();

  // Expire old approvals daily at midnight.
  ScriptApp.newTrigger('runExpireApprovals').timeBased().everyDays(1).atHour(0).create();

  GWAS.gwasLog('Dashboard', 'INFO', 'Triggers installed: refreshDashboard (30min), generateWeeklyInsights (Mon 8AM), expireApprovals (daily midnight).');
}
