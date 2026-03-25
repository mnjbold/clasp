# Spec: Google Workspace Automation System (GWAS)

## Problem Statement

The team (11–50 people, Google Workspace Business Plus/Enterprise) needs a fully automated, AI-augmented workspace operating system built entirely within the Google ecosystem. The system must eliminate manual overhead for recurring tasks: meeting preparation, note-taking, task tracking, project management, daily communication, and reporting. All automation is authored as TypeScript Apps Script projects, managed locally via `clasp`, and deployed to Google Apps Script. Gemini AI (Google AI Studio API key) provides intelligence across all modules.

---

## Architecture Overview

The system is organized as **multiple clasp TypeScript projects** (one per module), all sharing a common library project. Each module is an independent Apps Script deployment that can be updated, versioned, and rolled back independently.

```
gwas/
├── lib/                    # Shared library (GeminiClient, Utils, Config)
├── modules/
│   01-dashboard/           # Master Dashboard (Sheets-based)
│   02-calendar/            # Calendar & Meeting Automation
│   03-meeting-notes/       # Meeting Notes (pre + post AI summary)
│   04-tasks/               # Task Tracker (Sheets + Tasks API)
│   05-projects/            # Project Management (Sheets DB + Docs + Calendar)
│   06-digest/              # Daily Digest (Gmail + Chat)
│   07-knowledge-base/      # Unified Knowledge Base (Drive + Gemini Embeddings)
│   08-reporting/           # Unified Reporting (cross-module aggregation)
└── clasp.config.json       # Root config mapping modules to script IDs
```

**Google Workspace services used:**
- `SpreadsheetApp` — master dashboard, task tracker, project DB, reporting
- `CalendarApp` + Calendar API (advanced) — event automation, deadlines
- `DocumentApp` + Docs API (advanced) — meeting notes, project specs, KB articles
- `DriveApp` + Drive API (advanced) — file organization, KB indexing
- `GmailApp` + Gmail API (advanced) — daily digest, email-based triggers
- Chat API (advanced service) — Chat space notifications, digest cards
- Tasks API (advanced service) — task sync with Google Tasks app
- Meet REST API (via `UrlFetchApp`) — transcript retrieval post-meeting
- `HtmlService` — sidebar UIs within Sheets/Docs
- `PropertiesService` — API keys, config, state
- `ScriptApp` — trigger management
- Gemini REST API (via `UrlFetchApp`) — AI summarization, extraction, embeddings

---

## Module Specifications

### Module 01 — Master Dashboard

**Purpose:** Central Sheets-based command center aggregating live data from all other modules.

**Structure (one Spreadsheet, multiple sheets):**
| Sheet | Contents |
|---|---|
| `Overview` | KPI cards: open tasks, active projects, meetings today, digest status |
| `Team Activity` | Per-member: tasks due, meetings, last active project |
| `Projects` | Live pull from Module 05 project DB |
| `Tasks` | Live pull from Module 04 task tracker |
| `Calendar` | Today + next 7 days events for all team members |
| `Digest Log` | History of sent digests (AM/PM) |
| `KB Index` | Knowledge base article count, last updated |
| `AI Insights` | Gemini-generated weekly summary of team activity |

**Automation:**
- Time-based trigger: refresh all data sheets every 30 minutes
- Weekly trigger (Monday 8 AM): Gemini generates `AI Insights` narrative from aggregated data
- `onOpen` trigger: show sidebar with quick-action buttons (create task, create project, trigger digest)

**Acceptance Criteria:**
- Dashboard auto-refreshes without manual intervention
- All data reflects state within 30 minutes of source changes
- AI Insights sheet populated every Monday with a Gemini-generated summary
- Quick-action sidebar functional from Sheets UI

---

### Module 02 — Calendar & Meeting Automation

**Purpose:** Automate recurring calendar events, pre-meeting setup, and post-meeting cleanup.

**Features:**
- **Daily standup creator:** Time-based trigger (Sunday 6 PM) creates the next week's daily standup events with Meet links, agenda template in description, and all team members as guests
- **Meeting prep trigger:** 30 minutes before any calendar event with ≥2 attendees, create a pre-meeting Google Doc (from template) and add its link to the event description
- **Focus time blocker:** Weekly trigger blocks 2-hour focus windows per team member based on their calendar availability
- **Event color coding:** Auto-apply color codes by event type (standup=green, 1:1=blue, external=red, deadline=yellow)
- **Conflict detection:** On new event creation, check for conflicts and send Chat notification to organizer

**Triggers:**
- `ScriptApp.newTrigger('createWeeklyStandups').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(18).create()`
- `ScriptApp.newTrigger('preMeetingSetup').timeBased().everyMinutes(30).create()` (polls upcoming events)
- Calendar `onEventUpdated` installable trigger for conflict detection

**Acceptance Criteria:**
- Standup events created automatically each week with Meet links
- Pre-meeting doc created and linked in event description ≥30 min before start
- Color coding applied consistently across all event types
- Conflict notifications delivered to organizer via Chat

---

### Module 03 — Meeting Notes Automation

**Purpose:** Auto-create structured meeting notes before meetings and AI-summarize them after.

**Pre-meeting flow:**
1. Trigger fires 30 min before event (from Module 02)
2. Create Google Doc from template: `[Date] [Event Title] - Meeting Notes`
3. Pre-fill: attendees, agenda (from event description), date/time, Meet link
4. Add doc link to calendar event description
5. Post doc link to relevant Google Chat space

**Post-meeting flow:**
1. Time-based trigger polls for meetings that ended in the last 15 minutes
2. Fetch Meet transcript via Meet REST API (if available)
3. Send transcript to Gemini: extract summary, action items, decisions, open questions
4. Append AI-generated sections to the meeting notes Doc
5. Extract action items → create tasks in Module 04 (Tasks API)
6. Post summary card to Google Chat space
7. Send summary email to all attendees via Gmail

**Gemini prompt structure:**
```
Analyze this meeting transcript and return JSON with:
- summary: 3-5 sentence meeting summary
- action_items: [{owner, task, due_date}]
- decisions: [string]
- open_questions: [string]
Transcript: {transcript_text}
```

**Acceptance Criteria:**
- Pre-meeting doc created and linked before every meeting with ≥2 attendees
- Post-meeting AI summary appended to doc within 20 minutes of meeting end
- Action items automatically created as tasks in Module 04
- Summary posted to Chat and emailed to attendees

---

### Module 04 — Task Tracker

**Purpose:** Unified task management system using Sheets as the database, synced bidirectionally with Google Tasks API.

**Sheets structure (`Tasks` spreadsheet):**
| Column | Description |
|---|---|
| Task ID | Auto-generated UUID |
| Title | Task name |
| Description | Details |
| Owner | Team member email |
| Project | Linked project ID |
| Status | `todo` / `in_progress` / `blocked` / `done` |
| Priority | `P1` / `P2` / `P3` |
| Due Date | Date |
| Created | Timestamp |
| Source | `manual` / `meeting` / `project` |
| Tasks API ID | Synced Google Tasks ID |

**Automation:**
- `onEdit` trigger: when Status changes to `done`, mark corresponding Google Tasks item complete
- Time-based trigger (daily 7:30 AM): send each team member their personal task digest via Gmail + Chat DM
- Time-based trigger (daily 6 PM): flag overdue tasks, send overdue report to team leads
- Weekly trigger: archive completed tasks to `Tasks Archive` sheet, generate completion stats
- Gemini priority scoring: on new task creation, Gemini suggests priority based on title + description

**Acceptance Criteria:**
- Tasks created from meeting notes (Module 03) appear in Sheets within 5 minutes
- Bidirectional sync with Google Tasks app functional
- Personal task digest delivered daily at 7:30 AM
- Overdue tasks flagged and reported daily at 6 PM
- Priority auto-suggested by Gemini on task creation

---

### Module 05 — Project Management

**Purpose:** Custom project tracker using Sheets as the project database, Docs for specifications, Tasks API for todos, and Calendar for milestones/deadlines.

**Sheets structure (`Projects` spreadsheet):**
| Column | Description |
|---|---|
| Project ID | Auto-generated |
| Name | Project name |
| Description | Brief description |
| Status | `planning` / `active` / `on_hold` / `completed` |
| Owner | Lead email |
| Team | Comma-separated member emails |
| Start Date | Date |
| Target Date | Deadline |
| Spec Doc URL | Link to Google Doc |
| Drive Folder URL | Link to project Drive folder |
| Progress % | Calculated from linked tasks |
| Last Updated | Timestamp |

**On project creation (triggered via sidebar or form):**
1. Generate Project ID
2. Create Drive folder: `Projects/{Project Name}/` with subfolders: `Specs/`, `Assets/`, `Reports/`
3. Create project spec Doc from template in `Specs/` folder
4. Create Calendar milestone events for key dates
5. Create task list in Google Tasks API
6. Add project row to Sheets DB
7. Post project creation announcement to team Chat space
8. Gemini generates initial project brief from name + description

**Progress tracking:**
- `Progress %` auto-calculated from linked tasks (done/total)
- Weekly trigger: generate project status report Doc, post to Chat
- Deadline alert: 7 days and 1 day before target date, send alert to owner + team

**Acceptance Criteria:**
- Project creation flow (folder + doc + calendar + tasks) completes in one action
- Progress % updates automatically as tasks are completed
- Weekly status reports generated and posted to Chat
- Deadline alerts sent at 7-day and 1-day marks

---

### Module 06 — Daily Digest

**Purpose:** Send structured AM and PM digests to each team member via Gmail and Google Chat.

**AM Digest (7:00 AM daily):**
- Today's calendar events (from CalendarApp)
- Tasks due today (from Module 04 Sheets)
- Overdue tasks (from Module 04 Sheets)
- Active projects with upcoming deadlines (from Module 05)
- Gemini-generated "focus recommendation" for the day
- Delivered: personalized Gmail email + Google Chat DM card

**PM Digest (5:30 PM daily):**
- Tasks completed today
- Tasks not completed (carry-forward)
- Meetings that occurred today + links to meeting notes
- Any new tasks created from today's meetings
- Gemini-generated end-of-day summary
- Delivered: personalized Gmail email + Google Chat DM card

**Weekly Digest (Monday 8:30 AM):**
- Week-in-review: completed tasks, meetings held, projects progressed
- Upcoming week: meetings, deadlines, milestones
- Team-wide stats (aggregate, not individual)
- Delivered: team Gmail email + Google Chat space post

**Acceptance Criteria:**
- AM digest delivered by 7:05 AM daily to all team members
- PM digest delivered by 5:35 PM daily
- Weekly digest delivered Monday by 8:35 AM
- Each digest is personalized per team member (their tasks, their meetings)
- Gemini-generated summaries included in each digest

---

### Module 07 — Unified Knowledge Base

**Purpose:** Index all Google Workspace content (Drive, Docs, Gmail threads, Calendar events, meeting notes) into a searchable knowledge base using Gemini embeddings.

**KB Index structure (`Knowledge Base` spreadsheet):**
| Column | Description |
|---|---|
| KB ID | Auto-generated |
| Title | Document/thread title |
| Source | `drive` / `gmail` / `calendar` / `meeting_notes` |
| URL | Link to source |
| Summary | Gemini-generated 2-3 sentence summary |
| Tags | Gemini-extracted keywords |
| Embedding | Stored as JSON array (Gemini embedding vector) |
| Created | Timestamp |
| Last Indexed | Timestamp |

**Indexing triggers:**
- Drive: `onFileChange` trigger indexes new/modified Docs in designated team folders
- Gmail: daily trigger indexes starred/labeled threads
- Calendar: weekly trigger indexes past meeting events with notes links
- Meeting Notes: Module 03 triggers indexing after post-meeting summary is written

**Search (via Sheets sidebar):**
- User enters query in sidebar
- Gemini generates embedding for query
- Cosine similarity computed against stored embeddings
- Top 10 results returned with title, summary, source link

**Acceptance Criteria:**
- New Drive docs indexed within 1 hour of creation/modification
- Meeting notes indexed automatically after Module 03 completes
- Sidebar search returns relevant results using semantic similarity
- KB Index sheet shows all indexed content with summaries and tags

---

### Module 08 — Unified Reporting

**Purpose:** Aggregate data from all modules into standardized reports for team leads.

**Report types:**
| Report | Frequency | Delivery |
|---|---|---|
| Daily Team Activity | Daily 6 PM | Chat space + Gmail to leads |
| Weekly Project Status | Monday 9 AM | Google Doc + Chat + Gmail |
| Monthly Performance | 1st of month | Google Slides deck + Gmail |
| On-demand Report | Manual trigger | Sheets sidebar → generates Doc |

**Data sources per report:**
- Tasks: completion rate, overdue count, by owner, by project
- Projects: status distribution, on-track vs. at-risk, milestone hits
- Meetings: count, average duration, action item completion rate
- KB: articles added, search queries (logged)
- Digest: delivery success log

**Gemini role:**
- Narrative generation: convert raw stats into readable paragraphs
- Risk flagging: identify at-risk projects/team members from data patterns
- Trend analysis: compare current week/month to previous periods

**Acceptance Criteria:**
- All scheduled reports delivered on time without manual intervention
- Reports contain both raw data tables and Gemini-generated narrative
- Monthly Slides deck auto-generated with charts from Sheets data
- On-demand report generation functional from Sheets sidebar

---

## Shared Library (`lib/`)

All modules import from a shared Apps Script library project:

```typescript
// lib/GeminiClient.ts
export function callGemini(prompt: string, model?: string): string
export function getEmbedding(text: string): number[]
export function callGeminiStructured<T>(prompt: string, schema: object): T

// lib/Config.ts
export function getConfig(key: string): string
export function setConfig(key: string, value: string): void

// lib/Utils.ts
export function generateId(): string
export function formatDate(date: Date): string
export function sendChatMessage(spaceId: string, text: string, card?: object): void
export function sendEmail(to: string, subject: string, body: string, htmlBody?: string): void
export function log(module: string, level: string, message: string): void

// lib/TeamRegistry.ts
export function getTeamMembers(): TeamMember[]
export function getMemberByEmail(email: string): TeamMember | null
export interface TeamMember { email: string; name: string; chatUserId: string; role: string }
```

---

## Implementation Plan (Ordered)

1. **Scaffold clasp workspace** — Initialize root directory, `tsconfig.json`, shared `lib/` project, and all 8 module directories with `clasp create` and `.clasp.json` files

2. **Build shared library** — Implement `GeminiClient`, `Config`, `Utils`, `TeamRegistry`; deploy as Apps Script library; configure API key in `PropertiesService`

3. **Module 01: Master Dashboard** — Create Sheets structure, implement data-pull functions, set up 30-min refresh trigger, build `onOpen` sidebar

4. **Module 04: Task Tracker** — Implement Sheets DB, Tasks API sync, `onEdit` trigger, overdue detection; this is a dependency for Modules 03, 05, 06

5. **Module 05: Project Management** — Implement project creation flow (Drive folder + Doc + Calendar + Tasks), progress calculation, deadline alerts

6. **Module 02: Calendar Automation** — Standup creator, pre-meeting doc trigger, color coding, conflict detection

7. **Module 03: Meeting Notes** — Pre-meeting doc creation, Meet transcript fetch, Gemini extraction, task creation handoff to Module 04

8. **Module 06: Daily Digest** — AM/PM/weekly digest generation, Gmail + Chat delivery, personalization per member

9. **Module 07: Knowledge Base** — Indexing triggers, Gemini embedding generation, KB Index Sheets structure, sidebar search UI

10. **Module 08: Reporting** — Scheduled reports, Gemini narrative generation, Slides deck auto-generation, on-demand report sidebar

11. **Integration testing** — End-to-end test of full automation chain: meeting → notes → tasks → digest → dashboard → KB

12. **Trigger audit & quota check** — Verify all triggers are within Apps Script quotas (20 triggers/script), consolidate where needed

---

## Acceptance Criteria (System-Level)

- All 8 modules deploy successfully via `clasp push` from local TypeScript source
- No module exceeds the 6-minute Apps Script execution time limit
- Total daily trigger count across all modules stays within quota
- Gemini API key stored only in `PropertiesService`, never in source code
- All team member data (emails, Chat IDs) stored in `TeamRegistry` config sheet, not hardcoded
- System operates fully autonomously — no manual intervention required for daily operations
- All modules log execution results to a central `System Log` sheet in the Master Dashboard

---

## Google Chat as Unified Control Plane

All notifications, approvals, and alerts are routed to Google Chat — the user never needs to leave Chat to act on anything.

**Approval flow (interactive Chat cards):**
- Any automated action that creates/modifies data (task creation, calendar event suggestion, task assignment, meeting prep doc) sends an interactive Chat card to the relevant user(s)
- Card contains: context summary, proposed action, and two buttons: **Approve** / **Reject**
- On Approve: action executes (task created, event added, doc linked, etc.)
- On Reject: action is discarded, logged, and optionally prompts for reason
- Approvals time out after 24 hours and are auto-rejected with a notification

**Context sources for task/event extraction (Module 03 expanded):**
- Google Meet transcripts (post-meeting)
- Google Chat messages (monitored space/DM messages via Chat API event subscriptions)
- Gmail threads (starred, labeled, or matching keywords)
- Google Docs meeting notes (on-save trigger)
- Calendar event descriptions and updates

**Gemini extracts from all sources:**
- Action items → proposed tasks (with suggested owner, due date, priority)
- Scheduling needs → proposed calendar events
- Decisions → logged to KB
- Emergencies/urgencies → immediate Chat alert to relevant person

**All of the following are delivered exclusively to Google Chat:**
- Task creation approvals
- Calendar event suggestions
- Meeting prep notifications (doc link, agenda)
- Daily AM/PM digest cards
- Overdue task alerts
- Project deadline warnings
- Emergency/urgent email alerts
- Post-meeting AI summaries
- Weekly team digest

## Constraints & Assumptions

- Google Workspace Business Plus/Enterprise (30-min execution limit applies)
- Gemini AI Studio free tier: 1,500 requests/day — digest and reporting use caching to stay within quota
- Meet transcripts require Meet recording/transcription to be enabled by Workspace admin
- Chat API requires a Google Chat app to be configured in Google Cloud Console
- Team member list maintained manually in `TeamRegistry` config sheet (no Admin SDK dependency)
- All Drive automation scoped to a designated `Team Drive` shared drive, not personal drives
- TypeScript compiled via `clasp` before push; no external build pipeline required
