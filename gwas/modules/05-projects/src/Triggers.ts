/**
 * Trigger handlers for the Project Management module.
 */

/**
 * onChange trigger — detects new project rows added from the dashboard
 * and kicks off the full workspace creation flow.
 */
function onProjectSheetChange(e: GoogleAppsScript.Events.SheetsOnChange): void {
  if (e.changeType !== 'INSERT_ROW') return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PROJECTS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return;

  // Find rows with a Project ID but no Drive folder URL (newly added).
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  data.forEach((row, i) => {
    const projectId = row[PROJ_COL.PROJECT_ID - 1]?.toString();
    const folderUrl = row[PROJ_COL.DRIVE_FOLDER_URL - 1]?.toString();
    const name = row[PROJ_COL.NAME - 1]?.toString();

    if (projectId && name && !folderUrl) {
      try {
        createProjectWorkspace(projectId);
      } catch (err) {
        GWAS.gwasLog('Projects', 'ERROR', `Workspace creation failed for ${projectId}: ${(err as Error).message}`);
      }
    }
  });
}

/**
 * Weekly Monday 9 AM — generates and sends project status reports.
 */
function sendWeeklyProjectReports(): void {
  GWAS.gwasLog('Projects', 'INFO', 'Generating weekly project status reports...');
  const projects = getActiveProjects();

  if (projects.length === 0) {
    GWAS.gwasLog('Projects', 'INFO', 'No active projects — skipping weekly report.');
    return;
  }

  // Recalculate progress for all active projects.
  projects.forEach(p => recalculateProgress(p.projectId));

  // Generate a combined status report Doc.
  const reportUrl = _generateWeeklyStatusDoc(projects);

  // Post to team Chat space.
  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  const card = {
    header: {
      title: `📊 Weekly Project Status — ${new Date().toDateString()}`,
      subtitle: `${projects.length} active project(s)`,
    },
    sections: [
      {
        widgets: projects.slice(0, 8).map(p => ({
          decoratedText: {
            topLabel: `${p.status.toUpperCase()} · ${p.progressPct}% complete`,
            text: p.name,
            bottomLabel: p.targetDate ? `Target: ${p.targetDate} (${GWAS.daysUntil(p.targetDate)}d)` : 'No deadline',
          },
        })),
      },
      {
        widgets: [{
          buttonList: {
            buttons: [{ text: '📄 Full Report', onClick: { openLink: { url: reportUrl } } }],
          },
        }],
      },
    ],
  };
  GWAS.sendChatCard(teamSpaceId, card, `📊 Weekly project status: ${projects.length} active projects`);

  // Email leads.
  GWAS.getTeamLeads().forEach(lead => {
    GWAS.sendEmail({
      to: lead.email,
      subject: `📊 Weekly Project Status — ${new Date().toDateString()}`,
      body: `${projects.length} active projects. Full report: ${reportUrl}`,
    });
  });

  GWAS.gwasLog('Projects', 'INFO', `Weekly project reports sent. Report: ${reportUrl}`);
}

function _generateWeeklyStatusDoc(projects: Project[]): string {
  const rootFolderId = GWAS.getConfig('PROJECTS_DRIVE_FOLDER_ID');
  const rootFolder = DriveApp.getFolderById(rootFolderId);

  // Find or create a Reports folder.
  const reportsFolders = rootFolder.getFoldersByName('_Weekly Reports');
  const reportsFolder = reportsFolders.hasNext() ? reportsFolders.next() : rootFolder.createFolder('_Weekly Reports');

  const doc = DocumentApp.create(`Weekly Project Status — ${GWAS.todayIso()}`);
  DriveApp.getFileById(doc.getId()).moveTo(reportsFolder);

  const body = doc.getBody();
  body.appendParagraph(`Weekly Project Status Report`)
    .setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(new Date().toDateString())
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  // Gemini narrative.
  const statsText = projects.map(p =>
    `${p.name}: ${p.status}, ${p.progressPct}% complete, target ${p.targetDate || 'none'}`
  ).join('\n');

  const narrative = GWAS.callGemini(
    `Write a 3-4 sentence executive summary of this week's project status:\n${statsText}\n\nBe factual and concise.`
  );
  body.appendParagraph('Executive Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(narrative);

  // Per-project sections.
  body.appendParagraph('Project Details').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  projects.forEach(p => {
    body.appendParagraph(p.name).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(`Status: ${p.status} · Progress: ${p.progressPct}% · Target: ${p.targetDate || 'TBD'}`);
    body.appendParagraph(`Owner: ${p.owner} · Team: ${p.team.join(', ') || 'TBD'}`);
    if (p.specDocUrl) body.appendParagraph(`Spec: ${p.specDocUrl}`);
  });

  doc.saveAndClose();
  return doc.getUrl();
}

/**
 * Daily 8 AM — checks for projects with deadlines in 7 days or 1 day.
 */
function checkDeadlineAlerts(): void {
  const projects = getActiveProjects();

  projects.forEach(p => {
    if (!p.targetDate) return;
    const days = GWAS.daysUntil(p.targetDate);

    if (days === 7 || days === 1) {
      _sendDeadlineAlert(p, days);
    }
  });
}

function _sendDeadlineAlert(project: Project, daysLeft: number): void {
  const urgency = daysLeft === 1 ? '🚨 TOMORROW' : '⚠️ 7 days';
  const message = `${urgency}: Project "${project.name}" is due ${daysLeft === 1 ? 'tomorrow' : 'in 7 days'} (${project.targetDate}).\n\nProgress: ${project.progressPct}%`;

  // Alert owner.
  const owner = GWAS.getMemberByEmail(project.owner);
  if (owner) {
    GWAS.sendUrgentAlert({
      member: owner,
      title: `Project deadline ${daysLeft === 1 ? 'tomorrow' : 'in 7 days'}: ${project.name}`,
      message,
      sourceUrl: project.specDocUrl,
      alsoPostToTeamSpace: daysLeft === 1,
    });
  }

  // Alert team members.
  project.team.forEach(email => {
    const member = GWAS.getMemberByEmail(email);
    if (member && email !== project.owner) {
      GWAS.sendUrgentAlert({
        member,
        title: `Project deadline ${daysLeft === 1 ? 'tomorrow' : 'in 7 days'}: ${project.name}`,
        message,
        sourceUrl: project.specDocUrl,
      });
    }
  });

  GWAS.gwasLog('Projects', 'INFO', `Deadline alert sent for ${project.projectId} (${daysLeft} days left).`);
}
