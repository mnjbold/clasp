# GWAS Deployment Matrix

| Module | Type | Binding target | Depends on | Required properties or IDs | Setup entry point | First smoke test | Rollback note |
|---|---|---|---|---|---|---|---|
| Shared library | Standalone Apps Script library | None | None | All shared script properties in `gwas/lib/src/Config.ts`, library script ID, library version | `setupLibrary()` in `gwas/lib/src/index.ts` | Run `healthCheck()` and confirm no missing required keys | Create a new library version before downstream updates; if broken, restore the previous library version in module manifests |
| 01 Dashboard | Sheet-bound | Dashboard spreadsheet | Shared library, Modules 04/05/06/07 data flows | Dashboard spreadsheet ID, library script ID/version | `setupDashboard()` in `gwas/modules/01-dashboard/src/Setup.ts` | Run `refreshDashboard()` and confirm sheets are created and populated | Rebind to previous library version and rerun setup if dashboard formulas or refresh fail |
| 02 Calendar | Standalone | None | Shared library, Team Registry data | Team chat space, approval callback URL for approval links | `setupCalendarAutomation()` in `gwas/modules/02-calendar/src/CalendarAutomation.ts` | Run `createWeeklyStandups()` against a test calendar window | Disable project triggers and redeploy prior version if event creation misfires |
| 03 Meeting Notes | Standalone web app | None | Shared library, Module 02, Module 04 | Approval callback URL, monitored Chat space IDs, Gemini key | `setupMeetingNotes()` in `gwas/modules/03-meeting-notes/src/Setup.ts` | Run setup, then validate one pre-meeting and one post-meeting test flow | Roll back web app deployment and restore previous callback URL if action extraction misbehaves |
| 04 Tasks | Sheet-bound | Task Tracker spreadsheet | Shared library | Tasks spreadsheet ID, approval callback URL for task approvals | `setupTaskTracker()` in `gwas/modules/04-tasks/src/Setup.ts` | Create one test task row and run `sendOverdueReport()` on sample data | Snapshot the sheet before major changes; disable triggers and restore prior version if sync breaks |
| 05 Projects | Sheet-bound | Projects spreadsheet | Shared library, Module 04 for task linkage | Projects spreadsheet ID, projects Drive folder ID, team chat space | `setupProjectsSheet()` in `gwas/modules/05-projects/src/ProjectStore.ts` | Create one test project and verify folder/doc/calendar/task artifacts | Remove test artifacts, disable triggers, restore previous version if workspace creation fails |
| 06 Digest | Standalone | None | Shared library, Modules 04/05/03 data | Team chat space, approvals space, Gemini key | `setupDigest()` in `gwas/modules/06-digest/src/Digest.ts` | Run `sendAmDigest()` for a test user or controlled dataset | Pause triggers and revert deployment if digest spam or formatting errors occur |
| 07 Knowledge Base | Sheet-bound | Knowledge Base spreadsheet | Shared library, Module 03 for meeting-note indexing | KB spreadsheet ID, Drive access, Gemini key | `setupKnowledgeBase()` in `gwas/modules/07-knowledge-base/src/KnowledgeBase.ts` | Run setup and perform one `search()` against seeded content | Restore previous library/module version if indexing corrupts the KB sheet |
| 08 Reporting | Standalone | None | Shared library, Modules 04/05/06/07 data | Log spreadsheet, Gemini key, Chat space | `setupReporting()` in `gwas/modules/08-reporting/src/Reporting.ts` | Run setup and generate one daily report in a controlled window | Disable report triggers and restore previous version if report generation fails |
| 09 Admin Chat App | Standalone web app | Google Chat API config | All upstream modules should be live first | Deployment ID, Chat API app config, approval callback URL | `getSetupInstructions()` and `healthCheck()` in `gwas/modules/09-admin-chat-app/src/Setup.ts` | DM the app and verify `/help` plus one read-only command | Repoint Chat API config to prior deployment ID if command handling breaks |

## Recommended Rollout Order

1. Shared library
2. Module 04 Tasks
3. Module 02 Calendar
4. Module 05 Projects
5. Module 03 Meeting Notes
6. Module 06 Digest
7. Module 07 Knowledge Base
8. Module 08 Reporting
9. Module 01 Dashboard
10. Module 09 Admin Chat App