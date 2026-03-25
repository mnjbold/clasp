/**
 * Setup and configuration guide for the GWAS Admin Chat App.
 *
 * After deploying this script, configure the Chat app in Google Cloud Console:
 *
 * 1. Go to: console.cloud.google.com → APIs & Services → Google Chat API → Configuration
 *
 * 2. App name: GWAS Assistant
 *    Avatar URL: https://fonts.gstatic.com/s/i/googlematerialicons/smart_toy/v1/24px.svg
 *    Description: AI workspace assistant — tasks, projects, approvals, digests, KB search
 *
 * 3. Functionality:
 *    ✅ Receive 1:1 messages
 *    ✅ Join spaces and group conversations
 *
 * 4. Connection settings:
 *    ✅ Apps Script
 *    Deployment: [paste your Apps Script deployment ID]
 *
 * 5. Slash commands — add each with the matching Command ID:
 *    ID 1  /status    "Live system dashboard"
 *    ID 2  /tasks     "Your open tasks + team overdue"
 *    ID 3  /projects  "Active projects status"
 *    ID 4  /digest    "Trigger a digest now"
 *    ID 5  /create    "Create a task or project"
 *    ID 6  /search    "Search the knowledge base"
 *    ID 7  /report    "Generate a report"
 *    ID 8  /approve   "List pending approvals"
 *    ID 9  /help      "Show all commands"
 *
 * 6. Permissions: your Workspace domain
 *
 * 7. Publish the app (internal).
 *
 * Then add the bot to your team spaces and DM it to start.
 */

function getSetupInstructions(): void {
  Logger.log(`
GWAS Admin Chat App — Setup Instructions
=========================================

1. Deploy this script as an Apps Script project (standalone).
2. In Apps Script editor: Deploy → New deployment → Web app
   - Execute as: Me
   - Access: Anyone with Google
   Copy the Deployment ID.

3. Go to Google Cloud Console → APIs & Services → Google Chat API → Configuration
4. Set connection type to "Apps Script" and paste the Deployment ID.
5. Add slash commands (IDs 1-9) as listed in this file.
6. Publish the app to your domain.
7. Add the bot to your team Chat spaces.

Script properties required (same as other GWAS modules — set on the shared library):
  GEMINI_API_KEY, DASHBOARD_SPREADSHEET_ID, TASKS_SPREADSHEET_ID,
  PROJECTS_SPREADSHEET_ID, KB_SPREADSHEET_ID, TEAM_CHAT_SPACE_ID,
  TEAM_DRIVE_FOLDER_ID, APPROVAL_CALLBACK_URL

Run healthCheck() below to verify all properties are set.
  `);
}

function healthCheck(): void {
  const audit = GWAS.auditConfig();
  const missing = Object.entries(audit).filter(([, v]) => !v).map(([k]) => k);
  const members = GWAS.getTeamMembers();

  Logger.log(`GWAS Admin Chat App — Health Check
Config keys set: ${Object.values(audit).filter(Boolean).length}/${Object.keys(audit).length}
${missing.length > 0 ? 'Missing: ' + missing.join(', ') : 'All config keys present ✅'}
Team members: ${members.length}
`);
}
