function _ensureDashboardTasksSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  let sheet = ss.getSheetByName('Tasks');
  if (!sheet) {
    sheet = ss.insertSheet('Tasks', 0);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 13).setValues([[
      'Task ID', 'Title', 'Description', 'Owner', 'Project ID',
      'Status', 'Priority', 'Due Date', 'Created', 'Source', 'Source Ref',
      'Tasks API ID', 'Approval Msg ID',
    ]]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 13, 150);
    sheet.setColumnWidth(2, 280);
    sheet.setColumnWidth(3, 300);
  }

  return sheet;
}

function _ensureDashboardProjectsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  let sheet = ss.getSheetByName('Projects');
  if (!sheet) {
    sheet = ss.insertSheet('Projects', 0);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 13).setValues([[
      'Project ID', 'Name', 'Description', 'Status', 'Owner', 'Team',
      'Start Date', 'Target Date', 'Spec Doc URL', 'Drive Folder URL',
      'Progress %', 'Last Updated', 'Tasks List ID',
    ]]).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 13, 160);
    sheet.setColumnWidth(2, 220);
    sheet.setColumnWidth(3, 300);
  }

  return sheet;
}

function getDashboardSystemStatus(): {
  config: Record<string, boolean>;
  teamSize: number;
  tasks: { exists: boolean; rows: number };
  projects: { exists: boolean; rows: number };
  digestLog: { exists: boolean; rows: number };
} {
  const audit = GWAS.auditConfig();
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const projSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const dashSs = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  const projectsSheet = projSs.getSheetByName('Projects');
  const digestSheet = dashSs.getSheetByName('Digest Log');

  return {
    config: audit,
    teamSize: GWAS.getTeamMembers().length,
    tasks: {
      exists: !!tasksSheet,
      rows: tasksSheet ? Math.max(tasksSheet.getLastRow() - 1, 0) : 0,
    },
    projects: {
      exists: !!projectsSheet,
      rows: projectsSheet ? Math.max(projectsSheet.getLastRow() - 1, 0) : 0,
    },
    digestLog: {
      exists: !!digestSheet,
      rows: digestSheet ? Math.max(digestSheet.getLastRow() - 1, 0) : 0,
    },
  };
}

function triggerAmDigest(): void {
  const result = _runDashboardDigest('am');
  try {
    SpreadsheetApp.getUi().alert(`AM digest sent to ${result.sent}/${result.total} recipients. Failed: ${result.failed}`);
  } catch (_) {
    // Ignore UI errors when not running from spreadsheet UI context.
  }
}

function triggerPmDigest(): void {
  const result = _runDashboardDigest('pm');
  try {
    SpreadsheetApp.getUi().alert(`PM digest sent to ${result.sent}/${result.total} recipients. Failed: ${result.failed}`);
  } catch (_) {
    // Ignore UI errors when not running from spreadsheet UI context.
  }
}

function triggerWeeklyDigest(): void {
  const result = _runDashboardDigest('weekly');
  try {
    SpreadsheetApp.getUi().alert(`Weekly digest sent to ${result.sent}/${result.total} recipients. Failed: ${result.failed}`);
  } catch (_) {
    // Ignore UI errors when not running from spreadsheet UI context.
  }
}

function _runDashboardDigest(type: DigestType): { sent: number; failed: number; total: number } {
  switch (type) {
    case 'am':
      return _sendDashboardAmDigest();
    case 'pm':
      return _sendDashboardPmDigest();
    case 'weekly':
      return _sendDashboardWeeklyDigest();
    default:
      throw new Error(`Unknown digest type: ${type}`);
  }
}

function _sendDashboardAmDigest(): { sent: number; failed: number; total: number } {
  GWAS.gwasLog('DashboardDigest', 'INFO', 'Sending AM digests from dashboard...');
  const members = GWAS.getTeamMembers();
  let sent = 0;
  let failed = 0;

  members.forEach(member => {
    try {
      _sendDashboardAmDigestToMember(member);
      sent++;
    } catch (error) {
      failed++;
      GWAS.gwasLog('DashboardDigest', 'ERROR', `AM digest failed for ${member.email}: ${(error as Error).message}`);
    }
  });

  _dashboardLogDigest('am', sent, failed === 0 ? 'sent' : 'partial', failed > 0 ? `${failed} failed` : '');
  return {sent, failed, total: members.length};
}

function _sendDashboardPmDigest(): { sent: number; failed: number; total: number } {
  GWAS.gwasLog('DashboardDigest', 'INFO', 'Sending PM digests from dashboard...');
  const members = GWAS.getTeamMembers();
  let sent = 0;
  let failed = 0;

  members.forEach(member => {
    try {
      _sendDashboardPmDigestToMember(member);
      sent++;
    } catch (error) {
      failed++;
      GWAS.gwasLog('DashboardDigest', 'ERROR', `PM digest failed for ${member.email}: ${(error as Error).message}`);
    }
  });

  _dashboardLogDigest('pm', sent, failed === 0 ? 'sent' : 'partial', failed > 0 ? `${failed} failed` : '');
  return {sent, failed, total: members.length};
}

function _sendDashboardWeeklyDigest(): { sent: number; failed: number; total: number } {
  GWAS.gwasLog('DashboardDigest', 'INFO', 'Sending weekly digest from dashboard...');
  const tasksSheet = _ensureDashboardTasksSheet();
  let completedCount = 0;
  let openCount = 0;
  let overdueCount = 0;

  if (tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(row => {
      const status = row[5] ? row[5].toString() : '';
      const due = row[7] ? row[7].toString() : '';
      if (status === 'done') {
        completedCount++;
      } else {
        openCount++;
        if (GWAS.isOverdue(due)) overdueCount++;
      }
    });
  }

  const projSheet = _ensureDashboardProjectsSheet();
  let activeProjects = 0;
  if (projSheet.getLastRow() > 1) {
    const rows = projSheet.getRange(2, 4, projSheet.getLastRow() - 1, 1).getValues();
    activeProjects = rows.filter(row => row[0] === 'active' || row[0] === 'planning').length;
  }

  let narrative = '';
  try {
    narrative = GWAS.callGemini(
      `Write a 2-3 sentence weekly team digest summary:
- Tasks completed this week: ${completedCount}
- Tasks still open: ${openCount}
- Overdue tasks: ${overdueCount}
- Active projects: ${activeProjects}
Be factual and motivating. Prose only, no bullet points.`,
    );
  } catch (_) {
    // Gemini is optional for the digest.
  }

  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  const card = {
    header: {
      title: `📊 Weekly Team Digest — ${new Date().toDateString()}`,
      subtitle: 'GWAS Weekly Summary',
    },
    sections: [
      ...(narrative ? [{widgets: [{textParagraph: {text: narrative}}]}] : []),
      {
        header: 'This Week',
        widgets: [
          {decoratedText: {topLabel: 'Tasks Completed', text: String(completedCount)}},
          {decoratedText: {topLabel: 'Tasks Open', text: String(openCount)}},
          {decoratedText: {topLabel: 'Overdue', text: String(overdueCount)}},
          {decoratedText: {topLabel: 'Active Projects', text: String(activeProjects)}},
        ],
      },
    ],
  };

  try {
    GWAS.sendChatCard(teamSpaceId, card, `📊 Weekly digest: ${completedCount} tasks completed`);
  } catch (error) {
    GWAS.gwasLog('DashboardDigest', 'WARN', `Weekly Chat post failed: ${(error as Error).message}`);
  }

  const members = GWAS.getTeamMembers();
  const htmlBody = GWAS.wrapHtmlEmail(
    `📊 Weekly Team Digest — ${new Date().toDateString()}`,
    `${narrative ? `<div class="section"><p>${narrative}</p></div>` : ''}
    <div class="section">
      <h2>This Week</h2>
      <div class="item">✅ Tasks completed: <strong>${completedCount}</strong></div>
      <div class="item">📋 Tasks open: <strong>${openCount}</strong></div>
      <div class="item">⚠️ Overdue: <strong>${overdueCount}</strong></div>
      <div class="item">🚀 Active projects: <strong>${activeProjects}</strong></div>
    </div>`,
  );

  let sent = 0;
  let failed = 0;
  members.forEach(member => {
    try {
      GWAS.sendEmail({
        to: member.email,
        subject: `📊 Weekly Digest — ${completedCount} tasks done, ${openCount} open`,
        body: `Weekly summary. Completed: ${completedCount}. Open: ${openCount}. Overdue: ${overdueCount}.`,
        htmlBody,
      });
      sent++;
    } catch (error) {
      failed++;
      GWAS.gwasLog('DashboardDigest', 'ERROR', `Weekly email failed for ${member.email}: ${(error as Error).message}`);
    }
  });

  _dashboardLogDigest('weekly', sent, failed === 0 ? 'sent' : 'partial', failed > 0 ? `${failed} failed` : '');
  return {sent, failed, total: members.length};
}

function _sendDashboardAmDigestToMember(member: TeamMember): void {
  const today = GWAS.todayIso();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const cal = CalendarApp.getDefaultCalendar();
  const events = cal.getEvents(todayStart, todayEnd).filter(event => !event.isAllDayEvent());
  const calSummaries = events.map(event => ({
    title: event.getTitle(),
    startTime: event.getStartTime().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
    endTime: event.getEndTime().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}),
    attendeeCount: event.getGuestList().length,
  }));

  const tasksSheet = _ensureDashboardTasksSheet();
  const dueToday: Task[] = [];
  const overdue: Task[] = [];
  if (tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(row => {
      if ((row[3] ? row[3].toString() : '') !== member.email) return;
      if (row[5] === 'done') return;
      const task = _dashboardRowToTask(row);
      if (task.dueDate === today) dueToday.push(task);
      else if (GWAS.isOverdue(task.dueDate)) overdue.push(task);
    });
  }

  const projSheet = _ensureDashboardProjectsSheet();
  const urgentProjects: Array<{name: string; targetDate: string; daysLeft: number}> = [];
  if (projSheet.getLastRow() > 1) {
    const data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 13).getValues();
    data.forEach(row => {
      const status = row[3] ? row[3].toString() : '';
      const owner = row[4] ? row[4].toString() : '';
      const team = (row[5] ? row[5].toString() : '').split(',').map((value: string) => value.trim()).filter(Boolean);
      const targetDate = row[7] ? row[7].toString() : '';
      if (status === 'completed' || status === 'on_hold') return;
      if (owner !== member.email && !team.includes(member.email)) return;
      if (!targetDate) return;
      const days = GWAS.daysUntil(targetDate);
      if (days <= 7) urgentProjects.push({name: row[1] ? row[1].toString() : '', targetDate, daysLeft: days});
    });
  }

  let geminiInsight = '';
  try {
    geminiInsight = GWAS.callGemini(
      `Give a one-sentence focus recommendation for someone starting their workday with:
- ${dueToday.length} tasks due today
- ${overdue.length} overdue tasks
- ${calSummaries.length} meetings today
- ${urgentProjects.length} projects with deadlines within 7 days
Be direct and actionable. One sentence only.`,
    );
  } catch (_) {
    // Gemini is optional for the digest.
  }

  const sections: object[] = [];
  if (geminiInsight) {
    sections.push({widgets: [{textParagraph: {text: `💡 <i>${geminiInsight}</i>`}}]});
  }
  if (calSummaries.length > 0) {
    sections.push({
      header: `📅 Meetings Today (${calSummaries.length})`,
      widgets: calSummaries.slice(0, 5).map(summary => ({
        decoratedText: {
          topLabel: `${summary.startTime} – ${summary.endTime}`,
          text: summary.title,
          bottomLabel: `${summary.attendeeCount} attendee(s)`,
        },
      })),
    });
  }
  if (overdue.length > 0) {
    sections.push({
      header: `🔴 Overdue (${overdue.length})`,
      widgets: overdue.slice(0, 4).map(task => ({decoratedText: {topLabel: `${task.priority} · due ${task.dueDate}`, text: task.title}})),
    });
  }
  if (dueToday.length > 0) {
    sections.push({
      header: `🟡 Due Today (${dueToday.length})`,
      widgets: dueToday.slice(0, 4).map(task => ({decoratedText: {topLabel: task.priority, text: task.title}})),
    });
  }
  if (urgentProjects.length > 0) {
    sections.push({
      header: '🚀 Project Deadlines',
      widgets: urgentProjects.map(project => ({
        decoratedText: {
          topLabel: project.daysLeft <= 1 ? '🚨 Tomorrow' : `⚠️ ${project.daysLeft} days`,
          text: project.name,
          bottomLabel: project.targetDate,
        },
      })),
    });
  }

  const dashUrl = `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('DASHBOARD_SPREADSHEET_ID')}`;
  sections.push({widgets: [{buttonList: {buttons: [{text: '📊 Open Dashboard', onClick: {openLink: {url: dashUrl}}}]}}]});

  try {
    GWAS.sendDigestCard(member, 'am', sections);
  } catch (error) {
    GWAS.gwasLog('DashboardDigest', 'WARN', `AM Chat digest skipped for ${member.email}: ${(error as Error).message}`);
  }

  const htmlBody = GWAS.wrapHtmlEmail(
    `☀️ Good morning, ${member.name.split(' ')[0]}`,
    `${geminiInsight ? `<div class="section"><p><em>💡 ${geminiInsight}</em></p></div>` : ''}
    <div class="section">
      <h2>📅 Meetings Today (${calSummaries.length})</h2>
      ${calSummaries.slice(0, 5).map(summary => `<div class="item">${summary.startTime} – ${summary.endTime} &nbsp; <strong>${summary.title}</strong></div>`).join('') || '<div class="item">No meetings</div>'}
    </div>
    <div class="section">
      <h2>🔴 Overdue (${overdue.length})</h2>
      ${overdue.slice(0, 5).map(task => `<div class="item"><span class="badge p1">${task.priority}</span> ${task.title} <small>due ${task.dueDate}</small></div>`).join('') || '<div class="item">None</div>'}
    </div>
    <div class="section">
      <h2>🟡 Due Today (${dueToday.length})</h2>
      ${dueToday.slice(0, 5).map(task => `<div class="item"><span class="badge p2">${task.priority}</span> ${task.title}</div>`).join('') || '<div class="item">None</div>'}
    </div>
    <p><a href="${dashUrl}">📊 Open Dashboard →</a></p>`,
  );

  GWAS.sendEmail({
    to: member.email,
    subject: `☀️ Your day: ${dueToday.length} due today, ${overdue.length} overdue — ${new Date().toDateString()}`,
    body: `Good morning ${member.name}. ${dueToday.length} tasks due today, ${overdue.length} overdue, ${calSummaries.length} meetings.`,
    htmlBody,
  });
}

function _sendDashboardPmDigestToMember(member: TeamMember): void {
  const today = GWAS.todayIso();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);
  const tasksSheet = _ensureDashboardTasksSheet();
  const completedToday: Task[] = [];
  const stillOpen: Task[] = [];
  const dueToday: Task[] = [];

  if (tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(row => {
      if ((row[3] ? row[3].toString() : '') !== member.email) return;
      const task = _dashboardRowToTask(row);
      if (task.status === 'done' && task.created.startsWith(today)) {
        completedToday.push(task);
      } else if (task.status !== 'done') {
        if (task.dueDate === today) dueToday.push(task);
        else if (GWAS.isOverdue(task.dueDate)) stillOpen.push(task);
      }
    });
  }

  const cal = CalendarApp.getDefaultCalendar();
  const todayEvents = cal.getEvents(todayStart, todayEnd).filter(event => !event.isAllDayEvent() && event.getGuestList().length > 0);
  const meetingLinks = todayEvents.map(event => {
    const desc = event.getDescription() || '';
    const match = desc.match(/https:\/\/docs\.google\.com\/document\/[^\s)]+/);
    return {title: event.getTitle(), url: match ? match[0] : ''};
  }).filter(link => link.url);

  let geminiInsight = '';
  try {
    geminiInsight = GWAS.callGemini(
      `Write a one-sentence end-of-day summary for someone who:
- Completed ${completedToday.length} tasks today
- Has ${dueToday.length + stillOpen.length} tasks still open
- Attended ${todayEvents.length} meetings
Be encouraging and forward-looking. One sentence only.`,
    );
  } catch (_) {
    // Gemini is optional for the digest.
  }

  const sections: object[] = [];
  if (geminiInsight) {
    sections.push({widgets: [{textParagraph: {text: `💡 <i>${geminiInsight}</i>`}}]});
  }
  sections.push({
    header: `✅ Completed Today (${completedToday.length})`,
    widgets: completedToday.length > 0
      ? completedToday.slice(0, 5).map(task => ({decoratedText: {text: task.title}}))
      : [{textParagraph: {text: 'No tasks completed today.'}}],
  });
  if (dueToday.length + stillOpen.length > 0) {
    sections.push({
      header: `📋 Carry Forward (${dueToday.length + stillOpen.length})`,
      widgets: [...dueToday, ...stillOpen].slice(0, 5).map(task => ({
        decoratedText: {
          topLabel: task.priority,
          text: task.title,
          bottomLabel: `due ${task.dueDate || 'no date'}`,
        },
      })),
    });
  }
  if (meetingLinks.length > 0) {
    sections.push({
      header: '📝 Meeting Notes',
      widgets: meetingLinks.slice(0, 4).map(link => ({
        decoratedText: {
          text: link.title,
          button: {text: 'Notes', onClick: {openLink: {url: link.url}}},
        },
      })),
    });
  }

  try {
    GWAS.sendDigestCard(member, 'pm', sections);
  } catch (error) {
    GWAS.gwasLog('DashboardDigest', 'WARN', `PM Chat digest skipped for ${member.email}: ${(error as Error).message}`);
  }

  const htmlBody = GWAS.wrapHtmlEmail(
    `🌙 End of day, ${member.name.split(' ')[0]}`,
    `${geminiInsight ? `<div class="section"><p><em>💡 ${geminiInsight}</em></p></div>` : ''}
    <div class="section">
      <h2>✅ Completed Today (${completedToday.length})</h2>
      ${completedToday.slice(0, 5).map(task => `<div class="item">${task.title}</div>`).join('') || '<div class="item">None</div>'}
    </div>
    <div class="section">
      <h2>📋 Carry Forward (${dueToday.length + stillOpen.length})</h2>
      ${[...dueToday, ...stillOpen].slice(0, 5).map(task => `<div class="item"><span class="badge p2">${task.priority}</span> ${task.title}</div>`).join('') || '<div class="item">None</div>'}
    </div>
    ${meetingLinks.length > 0 ? `<div class="section"><h2>📝 Meeting Notes</h2>${meetingLinks.map(link => `<div class="item"><a href="${link.url}">${link.title}</a></div>`).join('')}</div>` : ''}`,
  );

  GWAS.sendEmail({
    to: member.email,
    subject: `🌙 Day wrap-up: ${completedToday.length} done, ${dueToday.length + stillOpen.length} carry forward`,
    body: `End of day summary. Completed: ${completedToday.length}. Carry forward: ${dueToday.length + stillOpen.length}.`,
    htmlBody,
  });
}

function _dashboardRowToTask(row: unknown[]): Task {
  return {
    taskId: row[0] ? row[0].toString() : '',
    title: row[1] ? row[1].toString() : '',
    description: row[2] ? row[2].toString() : '',
    owner: row[3] ? row[3].toString() : '',
    projectId: row[4] ? row[4].toString() : '',
    status: (row[5] ? row[5].toString() : 'todo') as TaskStatus,
    priority: (row[6] ? row[6].toString() : 'P2') as TaskPriority,
    dueDate: row[7] ? row[7].toString() : '',
    created: row[8] ? row[8].toString() : '',
    source: (row[9] ? row[9].toString() : 'manual') as TaskSource,
    sourceRef: row[10] ? row[10].toString() : '',
    tasksApiId: row[11] ? row[11].toString() : '',
    approvalMessageId: row[12] ? row[12].toString() : '',
  };
}

function _dashboardLogDigest(type: DigestType, recipientCount: number, status: string, note: string): void {
  try {
    const dashSs = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
    let logSheet = dashSs.getSheetByName('Digest Log');
    if (!logSheet) {
      logSheet = dashSs.insertSheet('Digest Log');
      logSheet.getRange(1, 1, 1, 6).setValues([['Timestamp', 'Type', 'Recipients', 'Channel', 'Status', 'Notes']]).setFontWeight('bold');
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([new Date(), type, recipientCount, 'Dashboard', status, note || '']);
  } catch (_) {
    // Logging should never break the dashboard flow.
  }
}