# GWAS — Google Workspace Automation System

A fully automated, AI-augmented workspace operating system built entirely within Google Workspace using Apps Script and Gemini. All automation is authored as TypeScript, managed locally with `clasp`, and deployed to Google Apps Script.

---

## What it does

| Module | What it automates |
|---|---|
| **01 Dashboard** | Master Sheets dashboard — live KPIs, team activity, pending approvals, AI weekly insights |
| **02 Calendar** | Weekly standup creation, pre-meeting doc setup, event color coding, focus time blocking |
| **03 Meeting Notes** | Pre-meeting docs, post-meeting AI summaries, action item extraction from meetings + Gmail + Chat |
| **04 Tasks** | Task tracker (Sheets + Google Tasks API), Gemini priority scoring, overdue alerts |
| **05 Projects** | One-click project workspace (Drive folder + Spec Doc + Calendar + Tasks), deadline alerts |
| **06 Digest** | Personalized AM/PM/weekly digests via Gmail + Google Chat DM |
| **07 Knowledge Base** | Semantic search across Drive, Gmail, Calendar, and meeting notes using Gemini embeddings |
| **08 Reporting** | Daily/weekly/monthly reports as Docs and Slides, delivered via Chat + Gmail |
| **09 Admin Chat App** | Native Google Chat App — AI agent, slash commands, interactive dialogs, full system control without leaving Chat |

**Everything flows to Google Chat.** Every automated action (task creation, calendar event suggestion, urgent alert, digest, meeting summary) is delivered as an interactive Chat card. Task and event creation require your approval via Approve/Reject buttons before anything is written.

---

## Prerequisites

- Google Workspace Business Plus or Enterprise
- `clasp` installed: `npm install -g @google/clasp`
- Apps Script API enabled: https://script.google.com/home/usersettings
- A Google AI Studio API key: https://aistudio.google.com/app/apikey
- A Google Chat app configured in Google Cloud Console (for sending Chat messages)

---

## Deployment order

Deploy in this exact order — each module depends on the library being available first.

### Step 1 — Create Google Workspace resources

Create these manually in Google Workspace before deploying any scripts:

| Resource | Purpose | Note |
|---|---|---|
| Google Sheet | Team Registry | Note the spreadsheet ID |
| Google Sheet | Master Dashboard | Note the spreadsheet ID |
| Google Sheet | Task Tracker | Note the spreadsheet ID |
| Google Sheet | Projects | Note the spreadsheet ID |
| Google Sheet | Knowledge Base | Note the spreadsheet ID |
| Google Sheet | System Log | Note the spreadsheet ID |
| Shared Drive folder | Team Drive root | Note the folder ID |
| Shared Drive folder | `Projects/` inside Team Drive | Note the folder ID |
| Google Chat space | Main team space | Note the space ID (`spaces/XXXXX`) |
| Google Chat space | Approvals space (optional) | Can reuse team space |

### Step 2 — Deploy the shared library

```bash
cd gwas/lib
clasp login
clasp create --type standalone --title "GWAS Shared Library"
# Copy the scriptId printed to .clasp.json
clasp push
```

In the Apps Script editor for the library:
1. **Deploy → New deployment → Library**
2. Copy the **Library Script ID** (different from the script ID)
3. Note the **version number** (use `1` for initial deploy)

### Step 3 — Update library references in all modules

Replace `REPLACE_WITH_LIB_SCRIPT_ID` in every module's `appsscript.json` with the Library Script ID from Step 2.

```bash
# Quick replace (run from gwas/ directory):
find modules -name "appsscript.json" -exec \
  sed -i 's/REPLACE_WITH_LIB_SCRIPT_ID/YOUR_ACTUAL_LIB_SCRIPT_ID/g' {} \;
```

### Step 4 — Deploy each module

> Deploy Module 09 last — it depends on all other modules being live so the agent has data to read.

For each module, bind it to the appropriate Google Sheet (modules 01, 04, 05, 07) or create standalone (modules 02, 03, 06, 08):

```bash
# Module 01 — Dashboard (bind to Dashboard spreadsheet)
cd gwas/modules/01-dashboard
clasp create --type sheets --title "GWAS Dashboard" --parentId "DASHBOARD_SPREADSHEET_ID"
clasp push

# Module 02 — Calendar (standalone)
cd gwas/modules/02-calendar
clasp create --type standalone --title "GWAS Calendar Automation"
clasp push

# Module 03 — Meeting Notes (standalone + web app)
cd gwas/modules/03-meeting-notes
clasp create --type standalone --title "GWAS Meeting Notes"
clasp push
# Then deploy as Web App in Apps Script editor (Execute as: Me, Access: Anyone with Google)
# Copy the web app URL → set as APPROVAL_CALLBACK_URL script property

# Module 04 — Tasks (bind to Tasks spreadsheet)
cd gwas/modules/04-tasks
clasp create --type sheets --title "GWAS Task Tracker" --parentId "TASKS_SPREADSHEET_ID"
clasp push

# Module 05 — Projects (bind to Projects spreadsheet)
cd gwas/modules/05-projects
clasp create --type sheets --title "GWAS Projects" --parentId "PROJECTS_SPREADSHEET_ID"
clasp push

# Module 06 — Digest (standalone)
cd gwas/modules/06-digest
clasp create --type standalone --title "GWAS Daily Digest"
clasp push

# Module 07 — Knowledge Base (bind to KB spreadsheet)
cd gwas/modules/07-knowledge-base
clasp create --type sheets --title "GWAS Knowledge Base" --parentId "KB_SPREADSHEET_ID"
clasp push

# Module 08 — Reporting (standalone)
cd gwas/modules/08-reporting
clasp create --type standalone --title "GWAS Reporting"
clasp push

# Module 09 — Admin Chat App (standalone)
cd gwas/modules/09-admin-chat-app
clasp create --type standalone --title "GWAS Admin Chat App"
clasp push
# Then in Apps Script editor: Deploy → New deployment → Web app
# Copy the Deployment ID → paste into Google Cloud Console → Chat API → Configuration
```

### Step 5 — Configure Script Properties

In each module's Apps Script editor: **Project Settings → Script Properties → Add property**

Set these properties on the **shared library** script (they are read by all modules via `GWAS.getConfig()`):

| Property | Value |
|---|---|
| `GEMINI_API_KEY` | Your Google AI Studio API key |
| `TEAM_REGISTRY_SPREADSHEET_ID` | Team Registry sheet ID |
| `DASHBOARD_SPREADSHEET_ID` | Dashboard sheet ID |
| `TASKS_SPREADSHEET_ID` | Task Tracker sheet ID |
| `PROJECTS_SPREADSHEET_ID` | Projects sheet ID |
| `KB_SPREADSHEET_ID` | Knowledge Base sheet ID |
| `LOG_SPREADSHEET_ID` | System Log sheet ID |
| `TEAM_CHAT_SPACE_ID` | Main Chat space ID (without `spaces/` prefix) |
| `APPROVALS_CHAT_SPACE_ID` | Approvals Chat space ID |
| `TEAM_DRIVE_FOLDER_ID` | Team Drive root folder ID |
| `PROJECTS_DRIVE_FOLDER_ID` | Projects subfolder ID |

Additional property on **Module 03** only:

| Property | Value |
|---|---|
| `APPROVAL_CALLBACK_URL` | Web app deployment URL for Module 03 |
| `MONITORED_CHAT_SPACE_IDS` | Comma-separated Chat space IDs to scan (e.g. `spaces/ABC,spaces/XYZ`) |

### Step 6 — Run one-time setup functions

Open each module in the Apps Script editor and run these functions once:

```
lib/index.ts          → setupLibrary()        # seeds config keys, creates Team sheet
...
09-admin-chat-app     → getSetupInstructions() # prints full Chat app config guide
```

### Step 6b — Configure the Chat App in Google Cloud Console

1. Go to **console.cloud.google.com → APIs & Services → Google Chat API → Configuration**
2. Set **App name**: `GWAS Assistant`
3. **Connection settings**: Apps Script → paste the Deployment ID from Module 09
4. Add **Slash commands** (ID must match exactly):

| ID | Command | Description |
|---|---|---|
| 1 | `/status` | Live system dashboard |
| 2 | `/tasks` | Your open tasks + team overdue |
| 3 | `/projects` | Active projects status |
| 4 | `/digest` | Trigger a digest now |
| 5 | `/create` | Create a task or project |
| 6 | `/search` | Search the knowledge base |
| 7 | `/report` | Generate a report |
| 8 | `/approve` | List pending approvals |
| 9 | `/help` | Show all commands |

5. **Publish** the app to your domain
6. Add `@GWAS Assistant` to your team spaces

```
lib/index.ts          → setupLibrary()        # seeds config keys, creates Team sheet
01-dashboard          → setupDashboard()       # creates all dashboard sheets + triggers
02-calendar           → setupCalendarAutomation()
03-meeting-notes      → setupMeetingNotes()
04-tasks              → setupTaskTracker()
05-projects           → setupProjectsSheet()
06-digest             → setupDigest()
07-knowledge-base     → setupKnowledgeBase()
08-reporting          → setupReporting()
```

### Step 7 — Add team members

Open the **Team Registry spreadsheet** → **Team** sheet and fill in your team:

| Email | Name | Chat User ID | Chat DM Space ID | Role | Timezone |
|---|---|---|---|---|---|
| alice@company.com | Alice Smith | users/123456 | spaces/DM_SPACE_ID | lead | America/New_York |
| bob@company.com | Bob Jones | users/789012 | spaces/DM_SPACE_ID | member | America/Chicago |

**How to find Chat User IDs and DM Space IDs:**
- User ID: In Chat, open a DM → the URL contains the user ID
- DM Space ID: The `spaces/XXXXX` part of the DM URL

---

## Admin Chat App — what you can do from Chat

The Chat App is a fully conversational AI agent. You never need to open a spreadsheet or script editor for day-to-day operations.

### Slash commands (instant, no typing)

```
/status    → Live KPI dashboard: open tasks, overdue, active projects, at-risk, pending approvals
/tasks     → Your open tasks grouped by overdue / due today / upcoming + team overdue summary
/projects  → Active projects with progress %, days left, at-risk flagging
/approve   → All pending approval cards assigned to you — approve/reject inline
/create    → Opens a dialog to create a task or project with dropdowns and date picker
/search    → Opens a search dialog — semantic KB search across all indexed content
/digest    → Buttons to trigger AM, PM, or weekly digest immediately
/report    → Buttons to generate daily, weekly, or monthly report immediately
/help      → Full command reference + example natural language queries
```

### Natural language (just talk to it)

The agent reads your message, determines intent via Gemini, and executes the right action:

```
"Show me overdue tasks for the team"
  → /tasks card with full overdue breakdown

"Create a task: update the onboarding docs, assign to Alice, due next Friday, P1"
  → Task created immediately, confirmation card returned

"What projects are at risk this week?"
  → /projects card filtered to at-risk items with Gemini context

"Search for anything about the Q4 roadmap"
  → Semantic KB search, top 6 results with relevance scores

"Trigger the PM digest"
  → Digest triggered, team notified

"How many tasks were completed this week?"
  → Gemini answers from live spreadsheet data

"Create a project: Mobile App Redesign, owner Bob, target March 31"
  → Project row created, Drive folder + spec doc + calendar events set up automatically
```

### Approval cards (inline, no browser needed)

Every automated action that needs confirmation arrives as a Chat card with **Approve / Reject** buttons. Clicking Approve executes the action immediately — no URL redirect, no browser tab.

---

## How approvals work

When GWAS extracts an action item from a meeting, email, or Chat message, it sends you an interactive card in Google Chat:

```
┌─────────────────────────────────────────┐
│ New task from meeting: Update API docs  │
│ Action required · CREATE TASK           │
├─────────────────────────────────────────┤
│ Summary                                 │
│ Update the API documentation to reflect │
│ the new authentication changes.         │
├─────────────────────────────────────────┤
│ Details                                 │
│ Meeting: Engineering Sync               │
│ Suggested Owner: Alice Smith            │
│ Priority: P1                            │
│ Due Date: 2025-02-14                    │
├─────────────────────────────────────────┤
│ [✅ Approve]  [❌ Reject]               │
└─────────────────────────────────────────┘
```

- **Approve** → task is created in the Task Tracker and synced to Google Tasks
- **Reject** → action is discarded and logged
- **No response in 24h** → approval expires automatically

The same flow applies to calendar event suggestions extracted from any source.

---

## Automation schedule

| Time | What runs |
|---|---|
| Every 15 min | Check for upcoming meetings needing prep docs |
| Every 15 min | Check for recently ended meetings (post-meeting processing) |
| Every 30 min | Dashboard data refresh |
| Every 30 min | Gmail scan for actionable content |
| Every 60 min | Chat space scan for action items |
| Every 60 min | Drive docs indexing into KB |
| **7:00 AM daily** | AM digest → Gmail + Chat DM to each team member |
| **7:30 AM daily** | Personal task digest → Gmail + Chat DM |
| **5:30 PM daily** | PM digest → Gmail + Chat DM |
| **6:00 PM daily** | Overdue task report → Chat + email to leads |
| **6:00 PM daily** | Daily activity report → Chat + email to leads |
| **6:00 AM daily** | Index yesterday's meeting notes into KB |
| **Sunday 6 PM** | Create next week's standup events |
| **Sunday 7 PM** | Block focus time for the week |
| **Monday 8:30 AM** | Weekly digest → Gmail + Chat |
| **Monday 9:00 AM** | Weekly project status report → Doc + Chat + email |
| **1st of month** | Monthly performance report → Slides + Chat + email |

---

## Updating and redeploying

After editing TypeScript source files:

```bash
cd gwas/modules/03-meeting-notes
clasp push
```

To update the shared library and bump the version:
```bash
cd gwas/lib
clasp push
# In Apps Script editor: Deploy → Manage deployments → New version
# Update version number in all modules' appsscript.json
```

---

## Troubleshooting

**Approval cards not appearing in Chat**
- Verify the Chat app is added as a member to the relevant spaces
- Check `TEAM_CHAT_SPACE_ID` is set correctly (without `spaces/` prefix)
- Confirm `chat.messages.create` scope is authorized

**Meet transcripts not fetching**
- Meet transcription must be enabled by your Workspace admin
- The script must have `https://www.googleapis.com/auth/meetings.space.created` scope authorized

**Gemini API errors**
- Verify `GEMINI_API_KEY` is set in Script Properties
- Free tier limit: 1,500 requests/day — if hitting limits, increase `CACHE_TTL_SECONDS` in `GeminiClient.ts`

**"Library not found" errors**
- Confirm the Library Script ID in `appsscript.json` matches the deployed library (not the script ID)
- Ensure the library version number matches what's deployed

**Execution timeout errors**
- Apps Script has a 30-minute limit on Workspace Business Plus
- If a function times out, split it into smaller batches using `PropertiesService` to track progress

---

## File structure

```
gwas/
├── lib/                          # Shared library (deploy first)
│   ├── src/
│   │   ├── Types.ts              # All shared TypeScript interfaces
│   │   ├── Config.ts             # PropertiesService wrapper
│   │   ├── GeminiClient.ts       # Gemini REST API client + embeddings
│   │   ├── TeamRegistry.ts       # Team member registry (Sheets-backed)
│   │   ├── ChatClient.ts         # Chat API client + approval cards
│   │   ├── ApprovalsStore.ts     # Approval record persistence
│   │   ├── Utils.ts              # Dates, email, logging, Sheets helpers
│   │   └── index.ts              # setupLibrary(), healthCheck()
│   ├── appsscript.json
│   └── .clasp.json
├── modules/
│   ├── 01-dashboard/             # Master Dashboard
│   ├── 02-calendar/              # Calendar & Meeting Automation
│   ├── 03-meeting-notes/         # Meeting Notes + Context Extraction (Gmail, Chat, Meet)
│   ├── 04-tasks/                 # Task Tracker
│   ├── 05-projects/              # Project Management
│   ├── 06-digest/                # Daily Digest
│   ├── 07-knowledge-base/        # Unified Knowledge Base
│   ├── 08-reporting/             # Unified Reporting
│   └── 09-admin-chat-app/        # AI Agentic Admin Dashboard (native Chat App)
│       ├── src/
│       │   ├── Types.ts          # Chat event/response type definitions
│       │   ├── ChatApp.ts        # onMessage() entry point — slash commands + NL agent
│       │   ├── Dialogs.ts        # Modal dialog builders and submission handlers
│       │   ├── CardActions.ts    # Interactive card button click handlers
│       │   ├── AgentContext.ts   # Live system stats, health check, conversational fallback
│       │   └── Setup.ts          # Cloud Console configuration guide
│       ├── appsscript.json
│       └── .clasp.json
├── tsconfig.base.json
├── clasp.config.json             # Module → scriptId mapping
├── .gitignore
└── README.md
```
