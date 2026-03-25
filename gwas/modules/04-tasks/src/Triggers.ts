/**
 * Trigger handlers for the Task Tracker module.
 */

// ─── onEdit ───────────────────────────────────────────────────────────────────

/**
 * Fires on any edit to the Tasks spreadsheet.
 * Handles: status changes → Tasks API sync, new rows → Gemini priority suggestion.
 */
function onTaskSheetEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const sheet = e.range.getSheet();
  if (sheet.getName() !== TASKS_SHEET) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < 2) return; // header row

  // Status column changed.
  if (col === TASK_COL.STATUS) {
    const newStatus = e.range.getValue()?.toString() as TaskStatus;
    const taskId = sheet.getRange(row, TASK_COL.TASK_ID).getValue()?.toString();
    if (taskId && newStatus) {
      _handleStatusChange(sheet, row, taskId, newStatus);
    }
  }

  // New row added (Title filled in, Task ID empty) → auto-fill ID + suggest priority.
  if (col === TASK_COL.TITLE) {
    const taskId = sheet.getRange(row, TASK_COL.TASK_ID).getValue()?.toString();
    if (!taskId) {
      const newId = GWAS.generateId();
      sheet.getRange(row, TASK_COL.TASK_ID).setValue(newId);
      sheet.getRange(row, TASK_COL.CREATED).setValue(new Date().toISOString());
      sheet.getRange(row, TASK_COL.STATUS).setValue('todo');

      // Suggest priority via Gemini (async-safe: runs within 30s edit window).
      const title = e.range.getValue()?.toString() ?? '';
      const desc = sheet.getRange(row, TASK_COL.DESCRIPTION).getValue()?.toString() ?? '';
      if (title) {
        try {
          const priority = _suggestPriority(title, desc);
          sheet.getRange(row, TASK_COL.PRIORITY).setValue(priority);
        } catch (_) { /* non-critical */ }
      }
    }
  }
}

function _handleStatusChange(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  row: number,
  taskId: string,
  newStatus: TaskStatus
): void {
  if (newStatus === 'done') {
    const apiId = sheet.getRange(row, TASK_COL.TASKS_API_ID).getValue()?.toString();
    if (apiId) {
      try {
        _completeGoogleTask(apiId);
        GWAS.gwasLog('Tasks', 'INFO', `Task ${taskId} marked done → synced to Tasks API.`);
      } catch (e) {
        GWAS.gwasLog('Tasks', 'WARN', `Tasks API sync failed for ${taskId}: ${(e as Error).message}`);
      }
    }
    // Colour the row green.
    sheet.getRange(row, 1, 1, 13).setBackground('#e6f4ea');
  } else if (newStatus === 'in_progress') {
    sheet.getRange(row, 1, 1, 13).setBackground('#e8f0fe');
  } else if (newStatus === 'blocked') {
    sheet.getRange(row, 1, 1, 13).setBackground('#fef7e0');
  } else {
    sheet.getRange(row, 1, 1, 13).setBackground(null);
  }
}

function _suggestPriority(title: string, description: string): TaskPriority {
  const prompt = `Given this task, suggest a priority level.
Title: ${title}
Description: ${description}

Rules:
- P1: urgent, blocking, deadline today/tomorrow, customer-facing issue
- P2: important, this week, normal work
- P3: nice to have, no deadline, low impact

Respond with exactly one of: P1, P2, P3`;

  const result = GWAS.callGemini(prompt).trim().toUpperCase();
  if (result === 'P1' || result === 'P2' || result === 'P3') return result as TaskPriority;
  return 'P2';
}

// ─── Daily 7:30 AM — personal task digests ───────────────────────────────────

function sendPersonalTaskDigests(): void {
  GWAS.gwasLog('Tasks', 'INFO', 'Sending personal task digests...');
  const members = GWAS.getTeamMembers();

  members.forEach(member => {
    try {
      _sendPersonalDigest(member);
    } catch (e) {
      GWAS.gwasLog('Tasks', 'ERROR', `Digest failed for ${member.email}: ${(e as Error).message}`);
    }
  });

  GWAS.gwasLog('Tasks', 'INFO', `Personal task digests sent to ${members.length} members.`);
}

function _sendPersonalDigest(member: TeamMember): void {
  const dueToday = getTasksDueTodayForOwner(member.email);
  const overdue = getOverdueTasksForOwner(member.email);
  const inProgress = getTasksForOwner(member.email).filter(t => t.status === 'in_progress');

  if (dueToday.length === 0 && overdue.length === 0 && inProgress.length === 0) return;

  // Build Chat card sections.
  const sections: object[] = [];

  if (overdue.length > 0) {
    sections.push({
      header: `🔴 Overdue (${overdue.length})`,
      widgets: overdue.slice(0, 5).map(t => ({
        decoratedText: {
          topLabel: t.priority,
          text: t.title,
          bottomLabel: `Due: ${t.dueDate} · ${t.projectId || 'No project'}`,
        },
      })),
    });
  }

  if (dueToday.length > 0) {
    sections.push({
      header: `🟡 Due Today (${dueToday.length})`,
      widgets: dueToday.slice(0, 5).map(t => ({
        decoratedText: {
          topLabel: t.priority,
          text: t.title,
          bottomLabel: t.projectId || 'No project',
        },
      })),
    });
  }

  if (inProgress.length > 0) {
    sections.push({
      header: `🔵 In Progress (${inProgress.length})`,
      widgets: inProgress.slice(0, 3).map(t => ({
        decoratedText: { text: t.title, bottomLabel: t.projectId || 'No project' },
      })),
    });
  }

  GWAS.sendDigestCard(member, 'am', sections);

  // Also send email summary.
  const tasksSsUrl = `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('TASKS_SPREADSHEET_ID')}`;
  const htmlBody = GWAS.wrapHtmlEmail(
    `☀️ Your tasks for ${new Date().toDateString()}`,
    `<div class="section">
      <h2>🔴 Overdue (${overdue.length})</h2>
      ${overdue.slice(0, 10).map(t => `<div class="item"><span class="badge p1">${t.priority}</span> ${t.title} <small>— due ${t.dueDate}</small></div>`).join('')}
    </div>
    <div class="section">
      <h2>🟡 Due Today (${dueToday.length})</h2>
      ${dueToday.slice(0, 10).map(t => `<div class="item"><span class="badge p2">${t.priority}</span> ${t.title}</div>`).join('')}
    </div>
    <div class="section">
      <h2>🔵 In Progress (${inProgress.length})</h2>
      ${inProgress.slice(0, 5).map(t => `<div class="item">${t.title}</div>`).join('')}
    </div>
    <p><a href="${tasksSsUrl}">Open Task Tracker →</a></p>`
  );

  GWAS.sendEmail({
    to: member.email,
    subject: `Your tasks for ${new Date().toDateString()} — ${overdue.length} overdue, ${dueToday.length} due today`,
    body: `Overdue: ${overdue.length} | Due today: ${dueToday.length} | In progress: ${inProgress.length}`,
    htmlBody,
  });
}

// ─── Daily 6 PM — overdue report ─────────────────────────────────────────────

function sendOverdueReport(): void {
  GWAS.gwasLog('Tasks', 'INFO', 'Sending overdue task report...');

  const allTasks = getOpenTasks();
  const overdueTasks = allTasks.filter(t => GWAS.isOverdue(t.dueDate));

  if (overdueTasks.length === 0) {
    GWAS.gwasLog('Tasks', 'INFO', 'No overdue tasks — skipping report.');
    return;
  }

  // Group by owner.
  const byOwner: Record<string, Task[]> = {};
  overdueTasks.forEach(t => {
    const key = t.owner || 'Unassigned';
    if (!byOwner[key]) byOwner[key] = [];
    byOwner[key].push(t);
  });

  const leads = GWAS.getTeamLeads();
  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');

  // Build report text.
  const lines = Object.entries(byOwner).map(([owner, tasks]) =>
    `${owner}: ${tasks.length} overdue task(s)\n` +
    tasks.slice(0, 3).map(t => `  • ${t.title} (due ${t.dueDate})`).join('\n')
  );

  const reportText = `⚠️ *Overdue Tasks Report — ${new Date().toDateString()}*\n\n${lines.join('\n\n')}\n\nTotal overdue: ${overdueTasks.length}`;

  // Post to team Chat space.
  GWAS.sendChatMessage(teamSpaceId, reportText);

  // Email leads.
  leads.forEach(lead => {
    GWAS.sendEmail({
      to: lead.email,
      subject: `⚠️ Overdue Tasks Report — ${overdueTasks.length} tasks overdue`,
      body: reportText,
    });
  });

  // Alert individual owners via DM for their own overdue tasks.
  Object.entries(byOwner).forEach(([ownerEmail, tasks]) => {
    const member = GWAS.getMemberByEmail(ownerEmail);
    if (!member) return;
    GWAS.sendUrgentAlert({
      member,
      title: `You have ${tasks.length} overdue task(s)`,
      message: tasks.slice(0, 5).map(t => `• ${t.title} (due ${t.dueDate})`).join('\n'),
    });
  });

  GWAS.gwasLog('Tasks', 'INFO', `Overdue report sent. ${overdueTasks.length} overdue tasks across ${Object.keys(byOwner).length} owners.`);
}

// ─── Weekly archive ───────────────────────────────────────────────────────────

function archiveCompletedTasks(): void {
  GWAS.gwasLog('Tasks', 'INFO', 'Archiving completed tasks...');
  const ss = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = ss.getSheetByName(TASKS_SHEET);
  const archiveSheet = ss.getSheetByName(ARCHIVE_SHEET);
  if (!tasksSheet || !archiveSheet) return;

  const lastRow = tasksSheet.getLastRow();
  if (lastRow < 2) return;

  const data = tasksSheet.getRange(2, 1, lastRow - 1, 13).getValues();
  const rowsToDelete: number[] = [];

  data.forEach((row, i) => {
    if (row[TASK_COL.STATUS - 1] !== 'done') return;
    archiveSheet.appendRow([
      row[0], row[1], row[3], row[4], row[6],
      row[7], '', row[9], new Date().toISOString(),
    ]);
    rowsToDelete.push(i + 2);
  });

  // Delete from bottom up to preserve row indices.
  rowsToDelete.reverse().forEach(r => tasksSheet.deleteRow(r));

  GWAS.gwasLog('Tasks', 'INFO', `Archived ${rowsToDelete.length} completed tasks.`);
}
