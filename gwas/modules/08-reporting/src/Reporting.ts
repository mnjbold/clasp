/**
 * Unified Reporting module.
 *
 * Generates daily, weekly, and monthly reports aggregating data from all
 * modules. Delivers via Google Docs, Slides, Chat, and Gmail.
 */

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupReporting(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Daily 6 PM — team activity report.
  ScriptApp.newTrigger('sendDailyActivityReport').timeBased().everyDays(1).atHour(18).create();

  // Monday 9 AM — weekly project status report.
  ScriptApp.newTrigger('sendWeeklyProjectStatusReport')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();

  // 1st of each month at 8 AM — monthly performance report.
  ScriptApp.newTrigger('sendMonthlyPerformanceReport').timeBased().onMonthDay(1).atHour(8).create();

  GWAS.gwasLog('Reporting', 'INFO', 'Reporting triggers installed.');
  Logger.log('✅ Module 08 setup complete.');
}

// ─── Data aggregation ─────────────────────────────────────────────────────────

interface ReportStats {
  period: string;
  tasksCompleted: number;
  tasksCreated: number;
  tasksOverdue: number;
  tasksByOwner: Record<string, { completed: number; open: number; overdue: number }>;
  activeProjects: number;
  projectsCompleted: number;
  atRiskProjects: Array<{ name: string; daysLeft: number; progress: number }>;
  meetingsHeld: number;
  kbArticles: number;
  digestsSent: number;
}

function _gatherStats(since: Date): ReportStats {
  const sinceIso = GWAS.toIsoDate(since);
  const todayIso = GWAS.todayIso();

  // Tasks.
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const tasksSheet = tasksSs.getSheetByName('Tasks');
  let tasksCompleted = 0, tasksCreated = 0, tasksOverdue = 0;
  const tasksByOwner: ReportStats['tasksByOwner'] = {};

  if (tasksSheet && tasksSheet.getLastRow() > 1) {
    const data = tasksSheet.getRange(2, 1, tasksSheet.getLastRow() - 1, 13).getValues();
    data.forEach(r => {
      const status = r[5]?.toString();
      const owner = r[3]?.toString() || 'Unassigned';
      const created = r[8]?.toString().substring(0, 10);
      const due = r[7]?.toString();

      if (!tasksByOwner[owner]) tasksByOwner[owner] = { completed: 0, open: 0, overdue: 0 };

      if (status === 'done') {
        tasksCompleted++;
        tasksByOwner[owner].completed++;
      } else {
        tasksByOwner[owner].open++;
        if (GWAS.isOverdue(due)) {
          tasksOverdue++;
          tasksByOwner[owner].overdue++;
        }
      }
      if (created >= sinceIso) tasksCreated++;
    });
  }

  // Projects.
  const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const projSheet = projectsSs.getSheetByName('Projects');
  let activeProjects = 0, projectsCompleted = 0;
  const atRiskProjects: ReportStats['atRiskProjects'] = [];

  if (projSheet && projSheet.getLastRow() > 1) {
    const data = projSheet.getRange(2, 1, projSheet.getLastRow() - 1, 12).getValues();
    data.forEach(r => {
      const status = r[3]?.toString();
      const targetDate = r[7]?.toString();
      const progress = Number(r[10]) || 0;
      if (status === 'active' || status === 'planning') {
        activeProjects++;
        if (targetDate) {
          const days = GWAS.daysUntil(targetDate);
          if (days <= 14 && progress < 70) {
            atRiskProjects.push({ name: r[1]?.toString(), daysLeft: days, progress });
          }
        }
      }
      if (status === 'completed') projectsCompleted++;
    });
  }

  // Meetings (calendar events since `since`).
  const cal = CalendarApp.getDefaultCalendar();
  const meetings = cal.getEvents(since, new Date()).filter(e =>
    !e.isAllDayEvent() && e.getGuestList().length > 0
  );

  // KB articles.
  const kbSs = SpreadsheetApp.openById(GWAS.getConfig('KB_SPREADSHEET_ID'));
  const kbSheet = kbSs.getSheetByName('KB Index');
  const kbArticles = kbSheet ? Math.max(kbSheet.getLastRow() - 1, 0) : 0;

  // Digests sent.
  const dashSs = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
  const digestSheet = dashSs.getSheetByName('Digest Log');
  let digestsSent = 0;
  if (digestSheet && digestSheet.getLastRow() > 1) {
    const data = digestSheet.getRange(2, 1, digestSheet.getLastRow() - 1, 6).getValues();
    digestsSent = data.filter(r => {
      const ts = new Date(r[0]?.toString());
      return ts >= since;
    }).length;
  }

  return {
    period: `${sinceIso} to ${todayIso}`,
    tasksCompleted,
    tasksCreated,
    tasksOverdue,
    tasksByOwner,
    activeProjects,
    projectsCompleted,
    atRiskProjects,
    meetingsHeld: meetings.length,
    kbArticles,
    digestsSent,
  };
}

// ─── Daily activity report ────────────────────────────────────────────────────

function sendDailyActivityReport(): void {
  GWAS.gwasLog('Reporting', 'INFO', 'Generating daily activity report...');

  const since = new Date(); since.setHours(0, 0, 0, 0);
  const stats = _gatherStats(since);

  const narrative = GWAS.callGemini(
    `Write a 2-sentence daily team activity summary:
Tasks completed today: ${stats.tasksCompleted}
Tasks overdue: ${stats.tasksOverdue}
Meetings held: ${stats.meetingsHeld}
At-risk projects: ${stats.atRiskProjects.length}
Be factual and direct.`
  );

  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  const card = {
    header: { title: `📊 Daily Activity — ${new Date().toDateString()}`, subtitle: 'GWAS Daily Report' },
    sections: [
      { widgets: [{ textParagraph: { text: narrative } }] },
      {
        header: 'Today\'s Numbers',
        widgets: [
          { decoratedText: { topLabel: 'Tasks Completed', text: String(stats.tasksCompleted) } },
          { decoratedText: { topLabel: 'Tasks Overdue', text: String(stats.tasksOverdue) } },
          { decoratedText: { topLabel: 'Meetings Held', text: String(stats.meetingsHeld) } },
          { decoratedText: { topLabel: 'Active Projects', text: String(stats.activeProjects) } },
        ],
      },
      ...(stats.atRiskProjects.length > 0 ? [{
        header: '⚠️ At-Risk Projects',
        widgets: stats.atRiskProjects.map(p => ({
          decoratedText: {
            topLabel: `${p.daysLeft}d left · ${p.progress}% done`,
            text: p.name,
          },
        })),
      }] : []),
    ],
  };

  GWAS.sendChatCard(teamSpaceId, card, `📊 Daily report: ${stats.tasksCompleted} tasks done`);

  // Email leads.
  GWAS.getTeamLeads().forEach(lead => {
    GWAS.sendEmail({
      to: lead.email,
      subject: `📊 Daily Report — ${stats.tasksCompleted} tasks done, ${stats.tasksOverdue} overdue`,
      body: narrative,
      htmlBody: GWAS.wrapHtmlEmail('📊 Daily Activity Report', `
        <div class="section"><p>${narrative}</p></div>
        <div class="section">
          <h2>Today's Numbers</h2>
          <div class="item">✅ Tasks completed: <strong>${stats.tasksCompleted}</strong></div>
          <div class="item">⚠️ Tasks overdue: <strong>${stats.tasksOverdue}</strong></div>
          <div class="item">📅 Meetings held: <strong>${stats.meetingsHeld}</strong></div>
          <div class="item">🚀 Active projects: <strong>${stats.activeProjects}</strong></div>
        </div>
        ${stats.atRiskProjects.length > 0 ? `
        <div class="section">
          <h2>⚠️ At-Risk Projects</h2>
          ${stats.atRiskProjects.map(p => `<div class="item">${p.name} — ${p.daysLeft}d left, ${p.progress}% done</div>`).join('')}
        </div>` : ''}`),
    });
  });

  GWAS.gwasLog('Reporting', 'INFO', 'Daily activity report sent.');
}

// ─── Weekly project status report ────────────────────────────────────────────

function sendWeeklyProjectStatusReport(): void {
  GWAS.gwasLog('Reporting', 'INFO', 'Generating weekly project status report...');

  const since = new Date(Date.now() - 7 * 86400000);
  const stats = _gatherStats(since);

  const docUrl = _generateWeeklyReportDoc(stats);

  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  const card = {
    header: { title: `📋 Weekly Report — ${new Date().toDateString()}`, subtitle: 'GWAS Weekly Summary' },
    sections: [
      {
        header: 'This Week',
        widgets: [
          { decoratedText: { topLabel: 'Tasks Completed', text: String(stats.tasksCompleted) } },
          { decoratedText: { topLabel: 'Tasks Created', text: String(stats.tasksCreated) } },
          { decoratedText: { topLabel: 'Overdue', text: String(stats.tasksOverdue) } },
          { decoratedText: { topLabel: 'Meetings', text: String(stats.meetingsHeld) } },
          { decoratedText: { topLabel: 'Active Projects', text: String(stats.activeProjects) } },
        ],
      },
      {
        widgets: [{
          buttonList: {
            buttons: [{ text: '📄 Full Report', onClick: { openLink: { url: docUrl } } }],
          },
        }],
      },
    ],
  };

  GWAS.sendChatCard(teamSpaceId, card, `📋 Weekly report ready: ${stats.tasksCompleted} tasks done`);

  GWAS.getTeamLeads().forEach(lead => {
    GWAS.sendEmail({
      to: lead.email,
      subject: `📋 Weekly Report — ${stats.tasksCompleted} tasks done, ${stats.activeProjects} active projects`,
      body: `Weekly report: ${docUrl}`,
    });
  });

  GWAS.gwasLog('Reporting', 'INFO', `Weekly report sent. Doc: ${docUrl}`);
}

function _generateWeeklyReportDoc(stats: ReportStats): string {
  const rootFolderId = GWAS.getConfig('TEAM_DRIVE_FOLDER_ID');
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const reportsFolders = rootFolder.getFoldersByName('_Reports');
  const reportsFolder = reportsFolders.hasNext() ? reportsFolders.next() : rootFolder.createFolder('_Reports');

  const doc = DocumentApp.create(`Weekly Report — ${GWAS.todayIso()}`);
  DriveApp.getFileById(doc.getId()).moveTo(reportsFolder);
  const body = doc.getBody();

  body.appendParagraph('Weekly Team Report').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(`Period: ${stats.period}`).setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  // Gemini narrative.
  const narrative = GWAS.callGemini(`Write a 3-4 sentence weekly team performance narrative:
Tasks completed: ${stats.tasksCompleted}, created: ${stats.tasksCreated}, overdue: ${stats.tasksOverdue}
Active projects: ${stats.activeProjects}, at-risk: ${stats.atRiskProjects.length}
Meetings held: ${stats.meetingsHeld}
Be factual, identify trends, and give one recommendation.`);

  body.appendParagraph('Executive Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(narrative);

  body.appendParagraph('Task Metrics').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Completed: ${stats.tasksCompleted} | Created: ${stats.tasksCreated} | Overdue: ${stats.tasksOverdue}`);

  body.appendParagraph('By Team Member').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  Object.entries(stats.tasksByOwner).forEach(([owner, counts]) => {
    body.appendParagraph(`${owner}: ${counts.completed} done, ${counts.open} open, ${counts.overdue} overdue`);
  });

  body.appendParagraph('Projects').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Active: ${stats.activeProjects} | Completed: ${stats.projectsCompleted}`);

  if (stats.atRiskProjects.length > 0) {
    body.appendParagraph('⚠️ At-Risk Projects').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    stats.atRiskProjects.forEach(p => {
      body.appendParagraph(`• ${p.name} — ${p.daysLeft} days left, ${p.progress}% complete`);
    });
  }

  body.appendParagraph('Other Metrics').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Meetings held: ${stats.meetingsHeld}`);
  body.appendParagraph(`KB articles indexed: ${stats.kbArticles}`);
  body.appendParagraph(`Digests sent: ${stats.digestsSent}`);

  doc.saveAndClose();
  return doc.getUrl();
}

// ─── Monthly performance report (Slides) ─────────────────────────────────────

function sendMonthlyPerformanceReport(): void {
  GWAS.gwasLog('Reporting', 'INFO', 'Generating monthly performance report...');

  const since = new Date();
  since.setDate(1); since.setMonth(since.getMonth() - 1); since.setHours(0, 0, 0, 0);
  const stats = _gatherStats(since);

  const slidesUrl = _generateMonthlySlides(stats);

  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  GWAS.sendChatCard(teamSpaceId, {
    header: { title: `📊 Monthly Report — ${since.toLocaleString('default', { month: 'long', year: 'numeric' })}` },
    sections: [{
      widgets: [{
        buttonList: {
          buttons: [{ text: '📊 View Slides', onClick: { openLink: { url: slidesUrl } } }],
        },
      }],
    }],
  }, `📊 Monthly report ready`);

  GWAS.getTeamLeads().forEach(lead => {
    GWAS.sendEmail({
      to: lead.email,
      subject: `📊 Monthly Performance Report — ${since.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
      body: `Monthly report slides: ${slidesUrl}`,
    });
  });

  GWAS.gwasLog('Reporting', 'INFO', `Monthly report sent. Slides: ${slidesUrl}`);
}

function _generateMonthlySlides(stats: ReportStats): string {
  const rootFolderId = GWAS.getConfig('TEAM_DRIVE_FOLDER_ID');
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const reportsFolders = rootFolder.getFoldersByName('_Reports');
  const reportsFolder = reportsFolders.hasNext() ? reportsFolders.next() : rootFolder.createFolder('_Reports');

  const presentation = SlidesApp.create(`Monthly Report — ${GWAS.todayIso()}`);
  DriveApp.getFileById(presentation.getId()).moveTo(reportsFolder);

  const slides = presentation.getSlides();
  const titleSlide = slides[0];

  // Slide 1: Title.
  titleSlide.getShapes()[0]?.getText().setText(`Monthly Performance Report`);
  titleSlide.getShapes()[1]?.getText().setText(`Period: ${stats.period}\nGenerated by GWAS`);

  // Slide 2: Task metrics.
  const taskSlide = presentation.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
  taskSlide.getShapes()[0]?.getText().setText('Task Metrics');
  taskSlide.getShapes()[1]?.getText().setText(
    `✅ Completed: ${stats.tasksCompleted}\n` +
    `📋 Created: ${stats.tasksCreated}\n` +
    `⚠️ Overdue: ${stats.tasksOverdue}\n\n` +
    `Top performers:\n` +
    Object.entries(stats.tasksByOwner)
      .sort((a, b) => b[1].completed - a[1].completed)
      .slice(0, 5)
      .map(([owner, c]) => `  • ${owner}: ${c.completed} completed`)
      .join('\n')
  );

  // Slide 3: Projects.
  const projSlide = presentation.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
  projSlide.getShapes()[0]?.getText().setText('Project Status');
  projSlide.getShapes()[1]?.getText().setText(
    `🚀 Active: ${stats.activeProjects}\n` +
    `✅ Completed: ${stats.projectsCompleted}\n` +
    `⚠️ At-risk: ${stats.atRiskProjects.length}\n\n` +
    (stats.atRiskProjects.length > 0
      ? `At-risk projects:\n${stats.atRiskProjects.map(p => `  • ${p.name} (${p.daysLeft}d, ${p.progress}%)`).join('\n')}`
      : 'No at-risk projects.')
  );

  // Slide 4: AI narrative.
  const narrative = GWAS.callGemini(
    `Write a 4-5 sentence monthly performance narrative for a team:
Tasks completed: ${stats.tasksCompleted}, overdue: ${stats.tasksOverdue}
Active projects: ${stats.activeProjects}, at-risk: ${stats.atRiskProjects.length}
Meetings held: ${stats.meetingsHeld}
Identify key achievements, concerns, and one strategic recommendation for next month.`
  );

  const narrativeSlide = presentation.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
  narrativeSlide.getShapes()[0]?.getText().setText('AI Analysis & Recommendations');
  narrativeSlide.getShapes()[1]?.getText().setText(narrative);

  // Slide 5: Other metrics.
  const metricsSlide = presentation.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);
  metricsSlide.getShapes()[0]?.getText().setText('Other Metrics');
  metricsSlide.getShapes()[1]?.getText().setText(
    `📅 Meetings held: ${stats.meetingsHeld}\n` +
    `🧠 KB articles: ${stats.kbArticles}\n` +
    `📬 Digests sent: ${stats.digestsSent}`
  );

  presentation.saveAndClose();
  return `https://docs.google.com/presentation/d/${presentation.getId()}`;
}

// ─── On-demand report (sidebar) ───────────────────────────────────────────────

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('📊 Reports')
    .addItem('Generate Daily Report', 'sendDailyActivityReport')
    .addItem('Generate Weekly Report', 'sendWeeklyProjectStatusReport')
    .addItem('Generate Monthly Report', 'sendMonthlyPerformanceReport')
    .addSeparator()
    .addItem('Setup Reporting', 'setupReporting')
    .addToUi();
}
