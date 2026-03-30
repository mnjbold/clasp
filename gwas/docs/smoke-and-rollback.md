# GWAS Smoke Tests and Rollback Plan

## Universal Rules

1. Run `node .\gwas\tools\preflight.mjs` before any deployment.
2. Record the current script ID, library ID, library version, and any web app deployment IDs before changes.
3. After each `clasp push`, run one smoke test before moving to the next module.
4. If smoke fails, stop the rollout and restore the previous known-good version before continuing.

## Smoke Tests by Stage

### Shared library

1. Deploy the library.
2. Run `setupLibrary()`.
3. Run `healthCheck()`.
4. Confirm required script properties are recognized and the Team sheet is reachable.

### Module 04 Tasks

1. Deploy and run `setupTaskTracker()`.
2. Confirm `Tasks`, `Tasks Archive`, and `Task Stats` sheets exist.
3. Add one test task and confirm validations are present.
4. Run `sendOverdueReport()` against controlled sample data.

### Module 02 Calendar

1. Deploy and run `setupCalendarAutomation()`.
2. Run `createWeeklyStandups()` in a safe test window.
3. Confirm events are created, colored, and logged as expected.

### Module 05 Projects

1. Deploy and run `setupProjectsSheet()`.
2. Create one test project.
3. Confirm the Drive folder, subfolders, Doc, and calendar artifacts are created.

### Module 03 Meeting Notes

1. Deploy and configure the web app URL.
2. Run `setupMeetingNotes()`.
3. Validate one pre-meeting doc creation path.
4. Validate one post-meeting processing path on a controlled meeting.

### Module 06 Digest

1. Deploy and run `setupDigest()`.
2. Run `sendAmDigest()` for a limited test recipient set.
3. Confirm Gmail and Chat delivery formats are correct.

### Module 07 Knowledge Base

1. Deploy and run `setupKnowledgeBase()`.
2. Seed one known document or record.
3. Run `search()` and confirm the seeded content is returned.

### Module 08 Reporting

1. Deploy and run `setupReporting()`.
2. Generate one daily report in a controlled test window.
3. Confirm the output artifact and delivery path are correct.

### Module 01 Dashboard

1. Deploy and run `setupDashboard()`.
2. Run `refreshDashboard()`.
3. Confirm Overview, Team Activity, Projects, Tasks, Calendar, Digest Log, KB Index, AI Insights, Pending Approvals, and System Log sheets exist and refresh.

### Module 09 Admin Chat App

1. Deploy web app and capture deployment ID.
2. Configure Google Chat API with the current deployment ID.
3. Run `healthCheck()`.
4. DM the app and verify `/help` plus one read-only command.

## Rollback Procedure

1. Stop after the first failing smoke test.
2. Record the failure in the System Log and operator notes.
3. For library failures, restore the previous library version in all module manifests before any further deploys.
4. For module failures, redeploy the prior working version of that module and disable newly added triggers if necessary.
5. For web app failures, restore the previous deployment ID in the relevant callback or Chat app configuration.
6. For spreadsheet-bound failures, remove test artifacts only after you have preserved evidence needed for debugging.

## Minimum Rollback Data to Capture

- Module name
- Script ID
- Deployment ID or version number
- Library version in use
- Timestamp of change
- Smoke test that failed
- Manual follow-up required