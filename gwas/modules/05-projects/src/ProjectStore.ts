/**
 * Project CRUD and setup for the Projects spreadsheet.
 */

const PROJECTS_SHEET = 'Projects';

const PROJ_COL = {
  PROJECT_ID: 1,
  NAME: 2,
  DESCRIPTION: 3,
  STATUS: 4,
  OWNER: 5,
  TEAM: 6,
  START_DATE: 7,
  TARGET_DATE: 8,
  SPEC_DOC_URL: 9,
  DRIVE_FOLDER_URL: 10,
  PROGRESS_PCT: 11,
  LAST_UPDATED: 12,
  TASKS_LIST_ID: 13,
} as const;

function setupProjectsSheet(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROJECTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(PROJECTS_SHEET, 0);
  if (sheet.getLastRow() > 0) return;

  const headers = [
    'Project ID', 'Name', 'Description', 'Status', 'Owner', 'Team',
    'Start Date', 'Target Date', 'Spec Doc URL', 'Drive Folder URL',
    'Progress %', 'Last Updated', 'Tasks List ID',
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
  sheet.setFrozenRows(1);

  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['planning', 'active', 'on_hold', 'completed'], true).build();
  sheet.getRange(2, PROJ_COL.STATUS, 500, 1).setDataValidation(statusRule);

  sheet.setColumnWidths(1, headers.length, 160);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 300);

  _setupProjectTriggers();
  GWAS.gwasLog('Projects', 'INFO', 'Projects sheet setup complete.');
}

function _setupProjectTriggers(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // onChange to detect new project rows added from dashboard.
  ScriptApp.newTrigger('onProjectSheetChange')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onChange().create();

  // Weekly Monday 9 AM — status reports.
  ScriptApp.newTrigger('sendWeeklyProjectReports')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();

  // Daily 8 AM — deadline alerts.
  ScriptApp.newTrigger('checkDeadlineAlerts')
    .timeBased().everyDays(1).atHour(8).create();

  GWAS.gwasLog('Projects', 'INFO', 'Project triggers installed.');
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function getAllProjects(): Project[] {
  const ss = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const sheet = ss.getSheetByName(PROJECTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];

  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues()
    .filter(r => r[0])
    .map(r => ({
      projectId: r[0]?.toString(),
      name: r[1]?.toString(),
      description: r[2]?.toString(),
      status: r[3]?.toString() as ProjectStatus,
      owner: r[4]?.toString(),
      team: r[5]?.toString().split(',').map((s: string) => s.trim()).filter(Boolean),
      startDate: r[6]?.toString(),
      targetDate: r[7]?.toString(),
      specDocUrl: r[8]?.toString(),
      driveFolderUrl: r[9]?.toString(),
      progressPct: Number(r[10]) || 0,
      lastUpdated: r[11]?.toString(),
      tasksListId: r[12]?.toString(),
    }));
}

function getActiveProjects(): Project[] {
  return getAllProjects().filter(p => p.status === 'active' || p.status === 'planning');
}

function getProjectById(projectId: string): Project | null {
  return getAllProjects().find(p => p.projectId === projectId) ?? null;
}

/**
 * Updates the progress % for a project based on its linked tasks.
 */
function recalculateProgress(projectId: string): void {
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  if (!tasksSheet || tasksSheet.getLastRow() < 2) return;

  const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 6).getValues();
  const projectTasks = data.filter(r => r[4]?.toString() === projectId);
  if (projectTasks.length === 0) return;

  const done = projectTasks.filter(r => r[5] === 'done').length;
  const pct = Math.round((done / projectTasks.length) * 100);

  const ss = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const sheet = ss.getSheetByName(PROJECTS_SHEET);
  if (!sheet) return;

  const row = GWAS.findRowByValue(sheet, PROJ_COL.PROJECT_ID, projectId);
  if (row > 0) {
    sheet.getRange(row, PROJ_COL.PROGRESS_PCT).setValue(pct);
    sheet.getRange(row, PROJ_COL.LAST_UPDATED).setValue(new Date().toISOString());
  }
}
