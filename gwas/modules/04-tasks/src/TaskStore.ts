/**
 * Task CRUD operations against the Tasks spreadsheet.
 * All other modules call these functions to create/update tasks.
 */

function _getTasksSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const sheet = ss.getSheetByName(TASKS_SHEET);
  if (!sheet) throw new Error('[Tasks] Tasks sheet not found. Run setupTaskTracker() first.');
  return sheet;
}

/**
 * Creates a new task row and optionally syncs to Google Tasks API.
 * Returns the generated taskId.
 */
function createTask(params: {
  title: string;
  description?: string;
  owner?: string;
  projectId?: string;
  priority?: TaskPriority;
  dueDate?: string;
  source?: TaskSource;
  sourceRef?: string;
}): string {
  const taskId = GWAS.generateId();
  const sheet = _getTasksSheet();

  sheet.appendRow([
    taskId,
    params.title,
    params.description ?? '',
    params.owner ?? '',
    params.projectId ?? '',
    'todo',
    params.priority ?? 'P2',
    params.dueDate ?? '',
    new Date().toISOString(),
    params.source ?? 'manual',
    params.sourceRef ?? '',
    '', // Tasks API ID — filled by syncToTasksApi
    '', // Approval Msg ID
  ]);

  GWAS.gwasLog('Tasks', 'INFO', `Task created: ${taskId} — "${params.title}" (owner: ${params.owner ?? 'unassigned'})`);

  // Sync to Google Tasks API if owner is set.
  if (params.owner) {
    try {
      const apiId = _createGoogleTask(taskId, params.title, params.description ?? '', params.dueDate ?? '');
      const row = GWAS.findRowByValue(sheet, TASK_COL.TASK_ID, taskId);
      if (row > 0) sheet.getRange(row, TASK_COL.TASKS_API_ID).setValue(apiId);
    } catch (e) {
      GWAS.gwasLog('Tasks', 'WARN', `Tasks API sync failed for ${taskId}: ${(e as Error).message}`);
    }
  }

  return taskId;
}

/**
 * Updates a task's status. If set to 'done', marks the Google Tasks item complete.
 */
function updateTaskStatus(taskId: string, status: TaskStatus): void {
  const sheet = _getTasksSheet();
  const row = GWAS.findRowByValue(sheet, TASK_COL.TASK_ID, taskId);
  if (row < 0) {
    GWAS.gwasLog('Tasks', 'WARN', `updateTaskStatus: task ${taskId} not found.`);
    return;
  }

  sheet.getRange(row, TASK_COL.STATUS).setValue(status);

  if (status === 'done') {
    const apiId = sheet.getRange(row, TASK_COL.TASKS_API_ID).getValue()?.toString();
    if (apiId) {
      try {
        _completeGoogleTask(apiId);
      } catch (e) {
        GWAS.gwasLog('Tasks', 'WARN', `Tasks API complete failed for ${taskId}: ${(e as Error).message}`);
      }
    }
  }

  GWAS.gwasLog('Tasks', 'INFO', `Task ${taskId} status → ${status}`);
}

/**
 * Returns all tasks for a given owner email.
 */
function getTasksForOwner(email: string): Task[] {
  return _getAllTasks().filter(t => t.owner.toLowerCase() === email.toLowerCase());
}

/**
 * Returns all non-done tasks.
 */
function getOpenTasks(): Task[] {
  return _getAllTasks().filter(t => t.status !== 'done');
}

/**
 * Returns all tasks due today for a given owner.
 */
function getTasksDueTodayForOwner(email: string): Task[] {
  const today = GWAS.todayIso();
  return getTasksForOwner(email).filter(t => t.dueDate === today && t.status !== 'done');
}

/**
 * Returns all overdue tasks for a given owner.
 */
function getOverdueTasksForOwner(email: string): Task[] {
  return getTasksForOwner(email).filter(t => GWAS.isOverdue(t.dueDate) && t.status !== 'done');
}

/**
 * Returns tasks completed today for a given owner.
 */
function getTasksCompletedTodayForOwner(email: string): Task[] {
  const today = GWAS.todayIso();
  return getTasksForOwner(email).filter(t => {
    if (t.status !== 'done') return false;
    // Use the Created date as a proxy — ideally we'd track completion date separately.
    return t.created.startsWith(today);
  });
}

function _getAllTasks(): Task[] {
  const sheet = _getTasksSheet();
  if (sheet.getLastRow() < 2) return [];

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  return data
    .filter(r => r[0]) // skip blank rows
    .map(r => ({
      taskId: r[0]?.toString(),
      title: r[1]?.toString(),
      description: r[2]?.toString(),
      owner: r[3]?.toString(),
      projectId: r[4]?.toString(),
      status: r[5]?.toString() as TaskStatus,
      priority: r[6]?.toString() as TaskPriority,
      dueDate: r[7]?.toString(),
      created: r[8]?.toString(),
      source: r[9]?.toString() as TaskSource,
      sourceRef: r[10]?.toString(),
      tasksApiId: r[11]?.toString(),
      approvalMessageId: r[12]?.toString(),
    }));
}

// ─── Google Tasks API ─────────────────────────────────────────────────────────

const GWAS_TASK_LIST_NAME = 'GWAS Tasks';

function _getOrCreateTaskList(): string {
  const lists = Tasks.Tasklists!.list({ maxResults: 100 });
  const existing = (lists.items ?? []).find((l: GoogleAppsScript.Tasks.Schema.TaskList) => l.title === GWAS_TASK_LIST_NAME);
  if (existing?.id) return existing.id;

  const created = Tasks.Tasklists!.insert({ title: GWAS_TASK_LIST_NAME });
  return created.id!;
}

function _createGoogleTask(taskId: string, title: string, notes: string, dueDate: string): string {
  const listId = _getOrCreateTaskList();
  const task: GoogleAppsScript.Tasks.Schema.Task = {
    title: `[${taskId}] ${title}`,
    notes,
    status: 'needsAction',
  };
  if (dueDate) {
    task.due = new Date(dueDate).toISOString();
  }
  const created = Tasks.Tasks!.insert(task, listId);
  return created.id ?? '';
}

function _completeGoogleTask(apiId: string): void {
  const listId = _getOrCreateTaskList();
  Tasks.Tasks!.patch({ status: 'completed' }, listId, apiId);
}
