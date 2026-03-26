/**
 * Daily Digest module — AM, PM, and Weekly digests.
 * Delivers personalized summaries to each team member via Gmail + Chat DM.
 */

function setupDigest(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // AM digest: 7:00 AM daily.
  ScriptApp.newTrigger('sendAmDigest').timeBased().everyDays(1).atHour(7).create();

  // PM digest: 5:30 PM daily.
  ScriptApp.newTrigger('sendPmDigest').timeBased().everyDays(1).atHour(17).nearMinute(30).create();

  // Weekly digest: Monday 8:30 AM.
  ScriptApp.newTrigger('sendWeeklyDigest')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).nearMinute(30).create();

  GWAS.gwasLog('Digest', 'INFO', 'Digest triggers installed.');
  Logger.log('✅ Module 06 setup complete.');
}

// ─── AM Digest ────────────────────────────────────────────────────────────────

function sendAmDigest(): void {
  GWAS.gwasLog('Digest', 'INFO', 'Sending AM digests...');
  const members = GWAS.getTeamMembers();
  let sent = 0;

  members.forEach(member => {
    try {
      _sendAmDigestToMember(member);
      sent++;
    } catch (e) {
      GWAS.gwasLog('Digest', 'ERROR', `AM digest failed for ${member.email}: ${(e as Error).message}`);
    }
  });

  _logDigest('am', sent);
  GWAS.gwasLog('Digest', 'INFO', `AM digests sent to ${sent}/${members.length} members.`);
}

function _sendAmDigestToMember(member: TeamMember): void {
  const today = GWAS.todayIso();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  // Calendar events today.
  const cal = CalendarApp.getDefaultCalendar();
  const events = cal.getEvents(todayStart, todayEnd).filter(e => !e.isAllDayEvent());
  const calSummaries = events.map(e => ({
    title: e.getTitle(),
    startTime: e.getStartTime().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    endTime: e.getEndTime().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    attendeeCount: e.getGuestList().length,
  }));

  // Tasks from Tasks spreadsheet.
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  const dueToday: Task[] = [];
  const overdue: Task[] = [];

  if (tasksSheet && tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(r => {
      if (r[3]?.toString() !== member.email) return;
      if (r[5] === 'done') return;
      const task = _rowToTask(r);
      if (task.dueDate === today) dueToday.push(task);
      else if (GWAS.isOverdue(task.dueDate)) overdue.push(task);
    });
  }

  // Active projects with upcoming deadlines.
  const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const projSheet = projectsSs.getSheetByName('Projects');
  const urgentProjects: Array<{ name: string; targetDate: string; daysLeft: number }> = [];

  if (projSheet && projSheet.getLastRow() > 1) {
    const data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 12).getValues();
    data.forEach(r => {
      const status = r[3]?.toString();
      const owner = r[4]?.toString();
      const team = r[5]?.toString().split(',').map((s: string) => s.trim());
      const targetDate = r[7]?.toString();
      if (status === 'done' || status === 'on_hold') return;
      if (owner !== member.email && !team.includes(member.email)) return;
      if (!targetDate) return;
      const days = GWAS.daysUntil(targetDate);
      if (days <= 7) urgentProjects.push({ name: r[1]?.toString(), targetDate, daysLeft: days });
    });
  }

  // Gemini focus recommendation.
  const focusPrompt = `Give a one-sentence focus recommendation for someone starting their workday with:
- ${dueToday.length} tasks due today
- ${overdue.length} overdue tasks
- ${calSummaries.length} meetings today
- ${urgentProjects.length} projects with deadlines within 7 days
Be direct and actionable. One sentence only.`;

  let geminiInsight = '';
  try {
    geminiInsight = GWAS.callGemini(focusPrompt);
  } catch (_) {}

  // Build Chat card.
  const sections: object[] = [];

  if (geminiInsight) {
    sections.push({
      widgets: [{ textParagraph: { text: `💡 <i>${geminiInsight}</i>` } }],
    });
  }

  if (calSummaries.length > 0) {
    sections.push({
      header: `📅 Meetings Today (${calSummaries.length})`,
      widgets: calSummaries.slice(0, 5).map(e => ({
        decoratedText: {
          topLabel: `${e.startTime} – ${e.endTime}`,
          text: e.title,
          bottomLabel: `${e.attendeeCount} attendee(s)`,
        },
      })),
    });
  }

  if (overdue.length > 0) {
    sections.push({
      header: `🔴 Overdue (${overdue.length})`,
      widgets: overdue.slice(0, 4).map(t => ({
        decoratedText: {
          topLabel: `${t.priority} · due ${t.dueDate}`,
          text: t.title,
        },
      })),
    });
  }

  if (dueToday.length > 0) {
    sections.push({
      header: `🟡 Due Today (${dueToday.length})`,
      widgets: dueToday.slice(0, 4).map(t => ({
        decoratedText: { topLabel: t.priority, text: t.title },
      })),
    });
  }

  if (urgentProjects.length > 0) {
    sections.push({
      header: `🚀 Project Deadlines`,
      widgets: urgentProjects.map(p => ({
        decoratedText: {
          topLabel: p.daysLeft <= 1 ? '🚨 Tomorrow' : `⚠️ ${p.daysLeft} days`,
          text: p.name,
          bottomLabel: p.targetDate,
        },
      })),
    });
  }

  const dashUrl = `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('DASHBOARD_SPREADSHEET_ID')}`;
  sections.push({
    widgets: [{
      buttonList: {
        buttons: [{ text: '📊 Open Dashboard', onClick: { openLink: { url: dashUrl } } }],
      },
    }],
  });

  GWAS.sendDigestCard(member, 'am', sections);

  // Email.
  const htmlBody = GWAS.wrapHtmlEmail(
    `☀️ Good morning, ${member.name.split(' ')[0]}`,
    `${geminiInsight ? `<div class="section"><p><em>💡 ${geminiInsight}</em></p></div>` : ''}
    <div class="section">
      <h2>📅 Meetings Today (${calSummaries.length})</h2>
      ${calSummaries.slice(0, 5).map(e => `<div class="item">${e.startTime} – ${e.endTime} &nbsp; <strong>${e.title}</strong></div>`).join('') || '<div class="item">No meetings</div>'}
    </div>
    <div class="section">
      <h2>🔴 Overdue (${overdue.length})</h2>
      ${overdue.slice(0, 5).map(t => `<div class="item"><span class="badge p1">${t.priority}</span> ${t.title} <small>due ${t.dueDate}</small></div>`).join('') || '<div class="item">None</div>'}
    </div>
    <div class="section">
      <h2>🟡 Due Today (${dueToday.length})</h2>
      ${dueToday.slice(0, 5).map(t => `<div class="item"><span class="badge p2">${t.priority}</span> ${t.title}</div>`).join('') || '<div class="item">None</div>'}
    </div>
    <p><a href="${dashUrl}">📊 Open Dashboard →</a></p>`
  );

  GWAS.sendEmail({
    to: member.email,
    subject: `☀️ Your day: ${dueToday.length} due today, ${overdue.length} overdue — ${new Date().toDateString()}`,
    body: `Good morning ${member.name}. ${dueToday.length} tasks due today, ${overdue.length} overdue, ${calSummaries.length} meetings.`,
    htmlBody,
  });
}

// ─── PM Digest ────────────────────────────────────────────────────────────────

function sendPmDigest(): void {
  GWAS.gwasLog('Digest', 'INFO', 'Sending PM digests...');
  const members = GWAS.getTeamMembers();
  let sent = 0;

  members.forEach(member => {
    try {
      _sendPmDigestToMember(member);
      sent++;
    } catch (e) {
      GWAS.gwasLog('Digest', 'ERROR', `PM digest failed for ${member.email}: ${(e as Error).message}`);
    }
  });

  _logDigest('pm', sent);
  GWAS.gwasLog('Digest', 'INFO', `PM digests sent to ${sent}/${members.length} members.`);
}

function _sendPmDigestToMember(member: TeamMember): void {
  const today = GWAS.todayIso();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  const completedToday: Task[] = [];
  const stillOpen: Task[] = [];
  const dueToday: Task[] = [];

  if (tasksSheet && tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(r => {
      if (r[3]?.toString() !== member.email) return;
      const task = _rowToTask(r);
      if (task.status === 'done' && task.created.startsWith(today)) {
        completedToday.push(task);
      } else if (task.status !== 'done') {
        if (task.dueDate === today) dueToday.push(task);
        else if (GWAS.isOverdue(task.dueDate)) stillOpen.push(task);
      }
    });
  }

  // Today's meetings with notes links.
  const cal = CalendarApp.getDefaultCalendar();
  const todayEvents = cal.getEvents(todayStart, todayEnd).filter(e =>
    !e.isAllDayEvent() && e.getGuestList().length > 0
  );
  const meetingLinks = todayEvents.map(e => {
    const desc = e.getDescription() ?? '';
    const match = desc.match(/https:\/\/docs\.google\.com\/document\/[^\s)]+/);
    return { title: e.getTitle(), url: match ? match[0] : '' };
  }).filter(m => m.url);

  // Gemini end-of-day summary.
  const summaryPrompt = `Write a one-sentence end-of-day summary for someone who:
- Completed ${completedToday.length} tasks today
- Has ${dueToday.length + stillOpen.length} tasks still open
- Attended ${todayEvents.length} meetings
Be encouraging and forward-looking. One sentence only.`;

  let geminiInsight = '';
  try { geminiInsight = GWAS.callGemini(summaryPrompt); } catch (_) {}

  const sections: object[] = [];

  if (geminiInsight) {
    sections.push({ widgets: [{ textParagraph: { text: `💡 <i>${geminiInsight}</i>` } }] });
  }

  sections.push({
    header: `✅ Completed Today (${completedToday.length})`,
    widgets: completedToday.length > 0
      ? completedToday.slice(0, 5).map(t => ({ decoratedText: { text: t.title } }))
      : [{ textParagraph: { text: 'No tasks completed today.' } }],
  });

  if (dueToday.length + stillOpen.length > 0) {
    sections.push({
      header: `📋 Carry Forward (${dueToday.length + stillOpen.length})`,
      widgets: [...dueToday, ...stillOpen].slice(0, 5).map(t => ({
        decoratedText: { topLabel: t.priority, text: t.title, bottomLabel: `due ${t.dueDate || 'no date'}` },
      })),
    });
  }

  if (meetingLinks.length > 0) {
    sections.push({
      header: `📝 Meeting Notes`,
      widgets: meetingLinks.slice(0, 4).map(m => ({
        decoratedText: {
          text: m.title,
          button: { text: 'Notes', onClick: { openLink: { url: m.url } } },
        },
      })),
    });
  }

  GWAS.sendDigestCard(member, 'pm', sections);

  const htmlBody = GWAS.wrapHtmlEmail(
    `🌙 End of day, ${member.name.split(' ')[0]}`,
    `${geminiInsight ? `<div class="section"><p><em>💡 ${geminiInsight}</em></p></div>` : ''}
    <div class="section">
      <h2>✅ Completed Today (${completedToday.length})</h2>
      ${completedToday.slice(0, 5).map(t => `<div class="item">${t.title}</div>`).join('') || '<div class="item">None</div>'}
    </div>
    <div class="section">
      <h2>📋 Carry Forward (${dueToday.length + stillOpen.length})</h2>
      ${[...dueToday, ...stillOpen].slice(0, 5).map(t => `<div class="item"><span class="badge p2">${t.priority}</span> ${t.title}</div>`).join('') || '<div class="item">None</div>'}
    </div>
    ${meetingLinks.length > 0 ? `<div class="section"><h2>📝 Meeting Notes</h2>${meetingLinks.map(m => `<div class="item"><a href="${m.url}">${m.title}</a></div>`).join('')}</div>` : ''}`
  );

  GWAS.sendEmail({
    to: member.email,
    subject: `🌙 Day wrap-up: ${completedToday.length} done, ${dueToday.length + stillOpen.length} carry forward`,
    body: `End of day summary. Completed: ${completedToday.length}. Carry forward: ${dueToday.length + stillOpen.length}.`,
    htmlBody,
  });
}

// ─── Weekly Digest ────────────────────────────────────────────────────────────

function sendWeeklyDigest(): void {
  GWAS.gwasLog('Digest', 'INFO', 'Sending weekly digest...');

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');

  let completedCount = 0, openCount = 0, overdueCount = 0;
  const byOwner: Record<string, { completed: number; open: number }> = {};

  if (tasksSheet && tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(r => {
      const status = r[5]?.toString();
      const owner = r[3]?.toString();
      const due = r[7]?.toString();
      if (!byOwner[owner]) byOwner[owner] = { completed: 0, open: 0 };
      if (status === 'done') { completedCount++; byOwner[owner].completed++; }
      else {
        openCount++;
        byOwner[owner].open++;
        if (GWAS.isOverdue(due)) overdueCount++;
      }
    });
  }

  const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const projSheet = projectsSs.getSheetByName('Projects');
  let activeProjects = 0;
  if (projSheet && projSheet.getLastRow() > 1) {
    const data = projSheet.getRange(2, 4, projSheet.getLastRow() - 1, 1).getValues();
    activeProjects = data.filter(r => r[0] === 'active').length;
  }

  const narrativePrompt = `Write a 2-3 sentence weekly team digest summary:
- Tasks completed this week: ${completedCount}
- Tasks still open: ${openCount}
- Overdue tasks: ${overdueCount}
- Active projects: ${activeProjects}
Be factual and motivating. Prose only, no bullet points.`;

  let narrative = '';
  try { narrative = GWAS.callGemini(narrativePrompt); } catch (_) {}

  // Post to team Chat space.
  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  const card = {
    header: {
      title: `📊 Weekly Team Digest — ${new Date().toDateString()}`,
      subtitle: 'GWAS Weekly Summary',
    },
    sections: [
      ...(narrative ? [{ widgets: [{ textParagraph: { text: narrative } }] }] : []),
      {
        header: 'This Week',
        widgets: [
          { decoratedText: { topLabel: 'Tasks Completed', text: String(completedCount) } },
          { decoratedText: { topLabel: 'Tasks Open', text: String(openCount) } },
          { decoratedText: { topLabel: 'Overdue', text: String(overdueCount) } },
          { decoratedText: { topLabel: 'Active Projects', text: String(activeProjects) } },
        ],
      },
    ],
  };

  GWAS.sendChatCard(teamSpaceId, card, `📊 Weekly digest: ${completedCount} tasks completed`);

  // Email all team members.
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
    </div>`
  );

  members.forEach(m => {
    GWAS.sendEmail({
      to: m.email,
      subject: `📊 Weekly Digest — ${completedCount} tasks done, ${openCount} open`,
      body: `Weekly summary. Completed: ${completedCount}. Open: ${openCount}. Overdue: ${overdueCount}.`,
      htmlBody,
    });
  });

  _logDigest('weekly', members.length);
  GWAS.gwasLog('Digest', 'INFO', 'Weekly digest sent.');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _rowToTask(r: unknown[]): Task {
  return {
    taskId: r[0]?.toString() ?? '',
    title: r[1]?.toString() ?? '',
    description: r[2]?.toString() ?? '',
    owner: r[3]?.toString() ?? '',
    projectId: r[4]?.toString() ?? '',
    status: (r[5]?.toString() ?? 'todo') as TaskStatus,
    priority: (r[6]?.toString() ?? 'P2') as TaskPriority,
    dueDate: r[7]?.toString() ?? '',
    created: r[8]?.toString() ?? '',
    source: (r[9]?.toString() ?? 'manual') as TaskSource,
    sourceRef: r[10]?.toString() ?? '',
    tasksApiId: r[11]?.toString() ?? '',
    approvalMessageId: r[12]?.toString() ?? '',
  };
}

function _logDigest(type: DigestType, recipientCount: number): void {
  try {
    const dashSs = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
    const logSheet = dashSs.getSheetByName('Digest Log');
    if (!logSheet) return;
    logSheet.appendRow([new Date(), type, recipientCount, 'Gmail + Chat', 'sent', '']);
  } catch (_) {}
}
