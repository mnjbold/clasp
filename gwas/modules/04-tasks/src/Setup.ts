/**
 * One-time setup for the Task Tracker spreadsheet.
 * Bind this script to the Tasks spreadsheet, then run setupTaskTracker().
 */

const TASKS_SHEET = 'Tasks';
const ARCHIVE_SHEET = 'Tasks Archive';
const STATS_SHEET = 'Task Stats';

// Column indices (1-based) matching the Tasks sheet schema.
const TASK_COL = {
  TASK_ID: 1,
  TITLE: 2,
  DESCRIPTION: 3,
  OWNER: 4,
  PROJECT_ID: 5,
  STATUS: 6,
  PRIORITY: 7,
  DUE_DATE: 8,
  CREATED: 9,
  SOURCE: 10,
  SOURCE_REF: 11,
  TASKS_API_ID: 12,
  APPROVAL_MSG_ID: 13,
} as const;

function setupTaskTracker(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  GWAS.gwasLog('Tasks', 'INFO', 'Setting up Task Tracker...');

  _createTasksSheet(ss);
  _createArchiveSheet(ss);
  _createStatsSheet(ss);
  _setupTaskTriggers();

  GWAS.gwasLog('Tasks', 'INFO', 'Task Tracker setup complete.');
  SpreadsheetApp.getUi().alert('✅ Task Tracker setup complete!');
}

function _createTasksSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) sheet = ss.insertSheet(TASKS_SHEET, 0);
  if (sheet.getLastRow() > 0) return; // already set up

  const headers = [
    'Task ID', 'Title', 'Description', 'Owner', 'Project ID',
    'Status', 'Priority', 'Due Date', 'Created', 'Source', 'Source Ref',
    'Tasks API ID', 'Approval Msg ID',
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);

  // Data validation for Status column.
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['todo', 'in_progress', 'blocked', 'done'], true).build();
  sheet.getRange(2, TASK_COL.STATUS, 1000, 1).setDataValidation(statusRule);

  // Data validation for Priority column.
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['P1', 'P2', 'P3'], true).build();
  sheet.getRange(2, TASK_COL.PRIORITY, 1000, 1).setDataValidation(priorityRule);

  // Conditional formatting: overdue rows red.
  const overdueRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND(H2<>"",H2<TODAY(),F2<>"done")`)
    .setBackground('#fce8e6')
    .setRanges([sheet.getRange('A2:M1000')])
    .build();
  sheet.setConditionalFormatRules([overdueRule]);

  sheet.setColumnWidths(1, headers.length, 150);
  sheet.setColumnWidth(2, 280); // Title wider
  sheet.setColumnWidth(3, 300); // Description wider
}

function _createArchiveSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(ARCHIVE_SHEET);
  if (!sheet) sheet = ss.insertSheet(ARCHIVE_SHEET);
  if (sheet.getLastRow() > 0) return;

  const headers = [
    'Task ID', 'Title', 'Owner', 'Project ID', 'Priority',
    'Due Date', 'Completed Date', 'Source', 'Archived At',
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#5f6368').setFontColor('#fff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, headers.length, 150);
}

function _createStatsSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  let sheet = ss.getSheetByName(STATS_SHEET);
  if (!sheet) sheet = ss.insertSheet(STATS_SHEET);
  sheet.clear();

  sheet.getRange('A1').setValue('📊 Task Statistics').setFontSize(16).setFontWeight('bold').setFontColor('#1a73e8');
  sheet.getRange('A3').setValue('Week').setFontWeight('bold');
  sheet.getRange('B3').setValue('Completed').setFontWeight('bold');
  sheet.getRange('C3').setValue('Created').setFontWeight('bold');
  sheet.getRange('D3').setValue('Overdue').setFontWeight('bold');
  sheet.getRange('E3').setValue('Completion Rate').setFontWeight('bold');
  sheet.getRange(3, 1, 1, 5).setBackground('#e8f0fe');
  sheet.setFrozenRows(3);
}

function _setupTaskTriggers(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // onEdit to sync status changes to Tasks API.
  ScriptApp.newTrigger('onTaskSheetEdit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create();

  // Daily 7:30 AM — personal task digests.
  ScriptApp.newTrigger('sendPersonalTaskDigests').timeBased().everyDays(1).atHour(7).nearMinute(30).create();

  // Daily 6 PM — overdue report.
  ScriptApp.newTrigger('sendOverdueReport').timeBased().everyDays(1).atHour(18).create();

  // Weekly Sunday midnight — archive completed tasks.
  ScriptApp.newTrigger('archiveCompletedTasks').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();

  GWAS.gwasLog('Tasks', 'INFO', 'Task triggers installed.');
}
