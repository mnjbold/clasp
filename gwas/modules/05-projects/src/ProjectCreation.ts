/**
 * Full project creation flow:
 * Drive folder → Spec Doc → Calendar milestones → Tasks list → Chat announcement
 */

/**
 * Creates a complete project workspace. Called when a new row is detected
 * in the Projects sheet (via onChange trigger) or directly from the dashboard.
 */
function createProjectWorkspace(projectId: string): void {
  const ss = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const sheet = ss.getSheetByName(PROJECTS_SHEET);
  if (!sheet) return;

  const row = GWAS.findRowByValue(sheet, PROJ_COL.PROJECT_ID, projectId);
  if (row < 0) return;

  const rowData = sheet.getRange(row, 1, 1, 12).getValues()[0];
  const project: Project = {
    projectId: rowData[0]?.toString(),
    name: rowData[1]?.toString(),
    description: rowData[2]?.toString(),
    status: rowData[3]?.toString() as ProjectStatus,
    owner: rowData[4]?.toString(),
    team: rowData[5]?.toString().split(',').map((s: string) => s.trim()).filter(Boolean),
    startDate: rowData[6]?.toString() || GWAS.todayIso(),
    targetDate: rowData[7]?.toString(),
    specDocUrl: rowData[8]?.toString(),
    driveFolderUrl: rowData[9]?.toString(),
    progressPct: 0,
    lastUpdated: new Date().toISOString(),
  };

  // Skip if already set up (has a Drive folder URL).
  if (project.driveFolderUrl) return;

  GWAS.gwasLog('Projects', 'INFO', `Creating workspace for project: ${project.projectId} — "${project.name}"`);

  try {
    // 1. Create Drive folder structure.
    const folderUrl = _createDriveFolders(project);

    // 2. Create spec Doc.
    const specDocUrl = _createSpecDoc(project, folderUrl);

    // 3. Create Calendar milestone events.
    _createMilestoneEvents(project);

    // 4. Create Google Tasks list.
    _createTasksList(project);

    // 5. Update the sheet row with URLs.
    sheet.getRange(row, PROJ_COL.SPEC_DOC_URL).setValue(specDocUrl);
    sheet.getRange(row, PROJ_COL.DRIVE_FOLDER_URL).setValue(folderUrl);
    sheet.getRange(row, PROJ_COL.STATUS).setValue('active');
    sheet.getRange(row, PROJ_COL.START_DATE).setValue(GWAS.todayIso());
    sheet.getRange(row, PROJ_COL.LAST_UPDATED).setValue(new Date().toISOString());

    // 6. Post Chat announcement.
    _announceProjectCreation(project, specDocUrl, folderUrl);

    GWAS.gwasLog('Projects', 'INFO', `Project ${project.projectId} workspace created successfully.`);
  } catch (e) {
    GWAS.gwasLog('Projects', 'ERROR', `Project creation failed for ${project.projectId}: ${(e as Error).message}`);
    throw e;
  }
}

function _createDriveFolders(project: Project): string {
  const rootFolderId = GWAS.getConfig('PROJECTS_DRIVE_FOLDER_ID');
  const rootFolder = DriveApp.getFolderById(rootFolderId);

  const projectFolder = rootFolder.createFolder(`[${project.projectId}] ${project.name}`);
  projectFolder.createFolder('Specs');
  projectFolder.createFolder('Assets');
  projectFolder.createFolder('Reports');
  projectFolder.createFolder('Meeting Notes');

  // Share with team members.
  project.team.forEach(email => {
    try {
      projectFolder.addEditor(email);
    } catch (_) { /* skip if email not in domain */ }
  });
  if (project.owner) {
    try { projectFolder.addEditor(project.owner); } catch (_) {}
  }

  GWAS.gwasLog('Projects', 'INFO', `Drive folder created: ${projectFolder.getUrl()}`);
  return projectFolder.getUrl();
}

function _createSpecDoc(project: Project, folderUrl: string): string {
  // Get the Specs subfolder.
  const rootFolderId = GWAS.getConfig('PROJECTS_DRIVE_FOLDER_ID');
  const rootFolder = DriveApp.getFolderById(rootFolderId);
  const projectFolders = rootFolder.getFoldersByName(`[${project.projectId}] ${project.name}`);
  if (!projectFolders.hasNext()) return '';

  const projectFolder = projectFolders.next();
  const specsFolders = projectFolder.getFoldersByName('Specs');
  const specsFolder = specsFolders.hasNext() ? specsFolders.next() : projectFolder;

  // Create the spec doc.
  const doc = DocumentApp.create(`[${project.projectId}] ${project.name} — Project Spec`);
  DriveApp.getFileById(doc.getId()).moveTo(specsFolder);

  const body = doc.getBody();
  body.clear();

  // Title.
  body.appendParagraph(project.name)
    .setHeading(DocumentApp.ParagraphHeading.TITLE);

  body.appendParagraph(`Project ID: ${project.projectId} · Owner: ${project.owner} · Target: ${project.targetDate || 'TBD'}`)
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  // Gemini-generated brief.
  const brief = _generateProjectBrief(project);

  body.appendParagraph('Overview').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(brief);

  body.appendParagraph('Goals').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('1. ').setHeading(DocumentApp.ParagraphHeading.NORMAL);

  body.appendParagraph('Scope').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('In scope:').setBold(true);
  body.appendParagraph('• ');
  body.appendParagraph('Out of scope:').setBold(true);
  body.appendParagraph('• ');

  body.appendParagraph('Team').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Owner: ${project.owner}`);
  body.appendParagraph(`Team: ${project.team.join(', ') || 'TBD'}`);

  body.appendParagraph('Timeline').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(`Start: ${project.startDate || GWAS.todayIso()}`);
  body.appendParagraph(`Target completion: ${project.targetDate || 'TBD'}`);

  body.appendParagraph('Milestones').setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('• ');

  body.appendParagraph('Risks & Dependencies').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('• ');

  body.appendParagraph('Notes').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('');

  doc.saveAndClose();
  GWAS.gwasLog('Projects', 'INFO', `Spec doc created: ${doc.getUrl()}`);
  return doc.getUrl();
}

function _generateProjectBrief(project: Project): string {
  const prompt = `Write a concise 2-3 sentence project overview for a project spec document.

Project name: ${project.name}
Description: ${project.description}
Owner: ${project.owner}
Target date: ${project.targetDate || 'not set'}

Write in professional, factual prose. Focus on what the project delivers and why it matters.`;

  try {
    return GWAS.callGemini(prompt);
  } catch (_) {
    return project.description || 'Project overview to be completed.';
  }
}

function _createMilestoneEvents(project: Project): void {
  if (!project.targetDate) return;

  const cal = CalendarApp.getDefaultCalendar();
  const targetDate = GWAS.parseIsoDate(project.targetDate);

  // Kickoff event (today).
  const kickoff = new Date();
  kickoff.setHours(10, 0, 0, 0);
  const kickoffEnd = new Date(kickoff.getTime() + 60 * 60000);
  const kickoffEvent = cal.createEvent(
    `🚀 [${project.projectId}] ${project.name} — Kickoff`,
    kickoff, kickoffEnd,
    {
      description: `Project kickoff for ${project.name}.\n\nSpec: ${project.specDocUrl || 'TBD'}`,
      guests: [project.owner, ...project.team].filter(Boolean).join(','),
    }
  );
  kickoffEvent.setColor(CalendarApp.EventColor.GREEN);

  // Deadline event.
  targetDate.setHours(17, 0, 0, 0);
  const deadlineEnd = new Date(targetDate.getTime() + 30 * 60000);
  const deadlineEvent = cal.createEvent(
    `🏁 [${project.projectId}] ${project.name} — Deadline`,
    targetDate, deadlineEnd,
    {
      description: `Target completion date for ${project.name}.`,
      guests: [project.owner, ...project.team].filter(Boolean).join(','),
    }
  );
  deadlineEvent.setColor(CalendarApp.EventColor.RED);

  GWAS.gwasLog('Projects', 'INFO', `Calendar milestones created for project ${project.projectId}.`);
}

function _createTasksList(project: Project): void {
  try {
    const list = Tasks.Tasklists!.insert({ title: `[${project.projectId}] ${project.name}` });
    GWAS.gwasLog('Projects', 'INFO', `Tasks list created: ${list.id} for project ${project.projectId}`);
  } catch (e) {
    GWAS.gwasLog('Projects', 'WARN', `Tasks list creation failed: ${(e as Error).message}`);
  }
}

function _announceProjectCreation(project: Project, specDocUrl: string, folderUrl: string): void {
  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');

  const card = {
    header: {
      title: `🚀 New Project: ${project.name}`,
      subtitle: `ID: ${project.projectId} · Owner: ${project.owner}`,
    },
    sections: [
      {
        widgets: [
          { textParagraph: { text: project.description } },
          {
            decoratedText: {
              topLabel: 'Target Date',
              text: project.targetDate || 'Not set',
            },
          },
          {
            decoratedText: {
              topLabel: 'Team',
              text: project.team.join(', ') || 'TBD',
            },
          },
        ],
      },
      {
        widgets: [{
          buttonList: {
            buttons: [
              { text: '📄 Spec Doc', onClick: { openLink: { url: specDocUrl } } },
              { text: '📁 Drive Folder', onClick: { openLink: { url: folderUrl } } },
            ],
          },
        }],
      },
    ],
  };

  GWAS.sendChatCard(teamSpaceId, card, `🚀 New project created: ${project.name}`);

  // Also email the owner and team.
  const allEmails = [project.owner, ...project.team].filter(Boolean);
  allEmails.forEach(email => {
    GWAS.sendEmail({
      to: email,
      subject: `🚀 New project: ${project.name} [${project.projectId}]`,
      body: `A new project has been created.\n\nName: ${project.name}\nDescription: ${project.description}\nSpec: ${specDocUrl}\nDrive: ${folderUrl}`,
      htmlBody: GWAS.wrapHtmlEmail(
        `🚀 New Project: ${project.name}`,
        `<div class="section">
          <p>${project.description}</p>
          <div class="item"><strong>Project ID:</strong> ${project.projectId}</div>
          <div class="item"><strong>Owner:</strong> ${project.owner}</div>
          <div class="item"><strong>Target Date:</strong> ${project.targetDate || 'Not set'}</div>
          <div class="item"><strong>Team:</strong> ${project.team.join(', ') || 'TBD'}</div>
        </div>
        <div class="section">
          <a href="${specDocUrl}">📄 View Spec Doc</a> &nbsp;|&nbsp;
          <a href="${folderUrl}">📁 Open Drive Folder</a>
        </div>`
      ),
    });
  });
}
