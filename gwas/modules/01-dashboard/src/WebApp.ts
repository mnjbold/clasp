/**
 * GWAS HQ — Unified Web App Dashboard
 * Deploy Module 01 as a Web App to get a shareable URL.
 */

function doGet(_e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('WebAppPage')
    .setTitle('GWAS HQ — Workspace Intelligence')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function webGetData(): string {
  try {
    const members = GWAS.getTeamMembers();
    const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
    const projSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
    const dashSs = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
    const tasksSheet = tasksSs.getSheetByName('Tasks');
    const projSheet = projSs.getSheetByName('Projects');
    const todayIso = GWAS.todayIso();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let openTasks = 0;
    let overdueTasks = 0;
    let todayTasks = 0;
    let p1Tasks = 0;
    const tasksList: Array<Record<string, unknown>> = [];

    if (tasksSheet && tasksSheet.getLastRow() > 1) {
      const rows = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
      for (const row of rows) {
        const status = (row[5] ?? '').toString();
        const due = (row[7] ?? '').toString();
        const priority = (row[6] ?? 'P2').toString();
        if (status && status !== 'done') {
          openTasks++;
          const isOverdue = due && due < todayIso;
          if (isOverdue) overdueTasks++;
          if (due === todayIso) todayTasks++;
          if (priority === 'P1') p1Tasks++;
          tasksList.push({
            id: row[0],
            title: row[1],
            owner: row[3] || '—',
            status,
            priority,
            due: due || '—',
            overdue: !!isOverdue,
            source: row[9] || 'manual',
          });
        }
      }

      tasksList.sort((left, right) => {
        const a = left as {overdue?: boolean; priority?: string};
        const b = right as {overdue?: boolean; priority?: string};
        if (a.overdue && !b.overdue) return -1;
        if (!a.overdue && b.overdue) return 1;
        if (a.priority === 'P1' && b.priority !== 'P1') return -1;
        if (a.priority !== 'P1' && b.priority === 'P1') return 1;
        return 0;
      });
    }

    let activeProjects = 0;
    let atRiskProjects = 0;
    const projectList: Array<Record<string, unknown>> = [];
    if (projSheet && projSheet.getLastRow() > 1) {
      const rows = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 13).getValues();
      for (const row of rows) {
        const status = (row[3] ?? '').toString();
        if (status === 'completed') continue;
        const targetDate = row[7] ? new Date(row[7] as string) : null;
        const daysLeft = targetDate ? Math.ceil((targetDate.getTime() - today.getTime()) / 86400000) : null;
        if (status === 'active') {
          activeProjects++;
          if (daysLeft !== null && daysLeft <= 7) atRiskProjects++;
        }
        projectList.push({
          id: row[0],
          name: row[1],
          description: row[2] || '',
          status,
          owner: row[4] || '—',
          targetDate: targetDate ? Utilities.formatDate(targetDate, 'America/New_York', 'MMM d, yyyy') : '—',
          progress: Number(row[10]) || 0,
          daysLeft,
          atRisk: daysLeft !== null && daysLeft <= 7,
          specUrl: row[8] || '',
          driveUrl: row[9] || '',
        });
      }
    }

    let meetingsToday = 0;
    const calendarEvents: Array<Record<string, unknown>> = [];
    try {
      const cal = CalendarApp.getDefaultCalendar();
      const todayEnd = new Date(today.getTime() + 86400000);
      const weekEnd = new Date(today.getTime() + 7 * 86400000);
      meetingsToday = cal.getEvents(today, todayEnd).length;
      for (const event of cal.getEvents(today, weekEnd).slice(0, 12)) {
        const startMs = event.getStartTime().getTime();
        calendarEvents.push({
          title: event.getTitle(),
          start: Utilities.formatDate(event.getStartTime(), 'America/New_York', 'EEE, MMM d · h:mm a'),
          isToday: startMs >= today.getTime() && startMs < todayEnd.getTime(),
          duration: Math.round((event.getEndTime().getTime() - startMs) / 60000),
        });
      }
    } catch (_) {
      // Calendar access is optional for the dashboard.
    }

    let pendingApprovals = 0;
    try {
      const sheet = dashSs.getSheetByName('Pending Approvals');
      if (sheet && sheet.getLastRow() > 1) {
        pendingApprovals = sheet.getRange(2, 10, sheet.getLastRow() - 1, 1).getValues().filter(row => row[0] === 'pending').length;
      }
    } catch (_) {
      // Approval sheet is optional for the dashboard.
    }

    let latestInsight = '';
    let insightDate = '';
    try {
      const sheet = dashSs.getSheetByName('AI Insights');
      if (sheet && sheet.getLastRow() > 1) {
        const lastRow = sheet.getLastRow();
        latestInsight = sheet.getRange(lastRow, 2).getValue()?.toString() || '';
        insightDate = sheet.getRange(lastRow, 1).getValue()?.toString() || '';
      }
    } catch (_) {
      // Insight sheet is optional for the dashboard.
    }

    const digestLog: Array<Record<string, unknown>> = [];
    try {
      const sheet = dashSs.getSheetByName('Digest Log');
      if (sheet && sheet.getLastRow() > 1) {
        const rows = sheet.getRange(2, 1, Math.min(sheet.getLastRow() - 1, 8), 4).getValues();
        for (const row of rows) {
          digestLog.push({
            date: (row[0] ?? '').toString().substring(0, 16),
            type: row[1] || '',
            member: row[2] || '',
            status: row[3] || '',
          });
        }
      }
    } catch (_) {
      // Digest history is optional for the dashboard.
    }

    return JSON.stringify({
      ok: true,
      kpis: {openTasks, overdueTasks, todayTasks, p1Tasks, activeProjects, atRiskProjects, meetingsToday, pendingApprovals, teamSize: members.length},
      tasks: tasksList,
      projects: projectList,
      calendar: calendarEvents,
      team: members.map(member => ({name: member.name, email: member.email, role: member.role, timezone: member.timezone || ''})),
      latestInsight,
      insightDate,
      digestLog,
      urls: {
        dashboard: `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('DASHBOARD_SPREADSHEET_ID')}`,
        tasks: `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('TASKS_SPREADSHEET_ID')}`,
        projects: `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('PROJECTS_SPREADSHEET_ID')}`,
      },
      ts: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}),
    });
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webRefresh(): string {
  try {
    refreshDashboard();
    return JSON.stringify({ok: true, message: 'Dashboard refreshed! All sheets updated.'});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webGenerateInsights(): string {
  try {
    generateWeeklyInsights();
    return JSON.stringify({ok: true, message: 'AI insights generated and saved!'});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webCreateTask(json: string): string {
  try {
    const params = JSON.parse(json) as {title?: string; description: string; owner: string; priority: string; dueDate: string};
    if (!params.title?.trim()) return JSON.stringify({ok: false, error: 'Title is required.'});
    createTaskFromDashboard(params as {title: string; description: string; owner: string; priority: string; dueDate: string});
    return JSON.stringify({ok: true, message: `Task "${params.title}" created successfully!`});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webCreateProject(json: string): string {
  try {
    const params = JSON.parse(json) as {name?: string; description?: string; owner: string; targetDate: string};
    if (!params.name?.trim() || !params.description?.trim()) return JSON.stringify({ok: false, error: 'Name and description required.'});
    createProjectFromDashboard(params as {name: string; description: string; owner: string; targetDate: string});
    return JSON.stringify({ok: true, message: `Project "${params.name}" created! Module 05 will set up the workspace.`});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webTriggerDigest(type: string): string {
  try {
    const result = _runDashboardDigest(type as DigestType);
    const label = type === 'am' ? 'Morning (AM)' : type === 'pm' ? 'Evening (PM)' : 'Weekly';
    return JSON.stringify({ok: true, message: `${label} digest sent to ${result.sent}/${result.total} recipients. Failed: ${result.failed}`});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webHealthCheck(): string {
  try {
    const status = getDashboardSystemStatus();
    const missing = Object.entries(status.config).filter(([, value]) => !value).map(([key]) => key);
    return JSON.stringify({
      ok: true,
      audit: status.config,
      missing,
      teamSize: status.teamSize,
      stores: {tasks: status.tasks, projects: status.projects, digestLog: status.digestLog},
    });
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webUpdateTaskStatus(taskId: string, status: string): string {
  try {
    const sheet = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID')).getSheetByName('Tasks');
    if (!sheet || sheet.getLastRow() < 2) throw new Error('Tasks sheet not found');
    const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    const rowIndex = ids.findIndex(row => row[0] === taskId);
    if (rowIndex === -1) throw new Error('Task not found');
    sheet.getRange(rowIndex + 2, 6).setValue(status);
    GWAS.gwasLog('Dashboard', 'INFO', `Task ${taskId} → ${status} (web dashboard)`);
    return JSON.stringify({ok: true, message: `Status updated to ${status}`});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}

function webGetTeamMembers(): string {
  try {
    return JSON.stringify({ok: true, members: GWAS.getTeamMembers().map(member => ({name: member.name, email: member.email}))});
  } catch (error) {
    return JSON.stringify({ok: false, error: (error as Error).toString()});
  }
}