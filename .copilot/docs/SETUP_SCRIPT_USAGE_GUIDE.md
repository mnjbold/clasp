# How to Run the Setup Scripts

**Before You Start:**
- You have a project folder (Node.js, Python, Go, Java, or .NET)
- You have VS Code installed
- You want to use AI agents to code faster

**Time Required:** 2-3 minutes

---

## Step-by-Step Guide

### Step 1: Open Terminal

**On Windows:**
1. Open File Explorer
2. Navigate to your project folder
3. Click address bar (where it shows the path)
4. Type `cmd` and press Enter
   - [Opens Command Prompt in your project folder]

**On Mac:**
1. Open Terminal (⌘ + Space, type "Terminal")
2. Type: `cd /path/to/your/project`
3. Press Enter

**On Linux:**
1. Open Terminal (Ctrl + Alt + T on Ubuntu)
2. Type: `cd /path/to/your/project`
3. Press Enter

---

### Step 2: Run the Setup Script

**On Windows:**
```cmd
scripts\init-copilot-template.bat
```

Or just double-click the file:
1. Open File Explorer
2. Navigate to project → `scripts` folder
3. Double-click `init-copilot-template.bat`

**On Mac/Linux:**
```bash
bash scripts/init-copilot-template.sh
```

---

### Step 3: Answer Questions

The script will ask you simple yes/no and multiple-choice questions:

#### Question 1: Tech Stack Detection
**What you see:**
```
[*] Detecting tech stack...
[+] Node.js project detected (package.json found)
Primary tech stack: Node.js
```

If it doesn't detect automatically, it will ask you to choose.

#### Question 2: MCP Server Availability
**What you see:**
```
[*] MCP Server Availability
Do you have GitHub API access? (y/n): _
```

**What it means:** MCP makes AI agents 10x faster. Answer `y` if you have GitHub account, `n` if not.

#### Question 3: Testing Framework
**What you see:**
```
[*] Auto-detected test framework: jest
Is this correct? (y/n): _
```

Usually the script detects correctly. Just press `y`.

#### Question 4: CI/CD System
**What you see:**
```
Which CI/CD system do you use?
  1. GitHub Actions
  2. GitLab CI
  3. Jenkins
  4. None/Other
Enter choice (1-4): _
```

Pick the number matching your system.

#### Question 5: Database
**What you see:**
```
Which database do you use?
  1. PostgreSQL
  2. MongoDB
  3. MySQL
  4. None/Other
Enter choice (1-4): _
```

Pick the number matching your database.

---

### Step 4: Files Are Generated

**You'll see:**
```
[+] Generated .env.example
[+] Generated .copilot/settings.json
[+] Generated .copilot/instructions/03_node_specific.instructions.md
[+] Generated .copilot/instructions/_STACK_SUMMARY.md

Setup Complete! ✅
```

**Files created in your project:**
- `.env.example` — Example environment variables
- `.copilot/settings.json` — Configuration for AI agents
- `.copilot/instructions/03_*.md` — Rules for your tech stack
- `.copilot/instructions/_STACK_SUMMARY.md` — Quick reference

---

### Step 5: Finalize Setup

**Open VS Code:**
1. Open the project in VS Code

**Copy .env.example to .env:**
```bash
# (Only if you need it for local testing)
cp .env.example .env
```

**Edit .env with real values:**
```bash
# Open .env and add:
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

**Never commit .env:**
```bash
# Verify .git ignore has .env
echo ".env" >> .gitignore
```

**Test your setup:**
```bash
npm test              # Node.js
pytest                # Python
go test ./...         # Go
mvn test              # Java
dotnet test           # .NET
```

If tests pass ✅, you're ready!

---

## What Each File Does

### `.env.example`
**What it is:** A template showing example environment variables

**Example:**
```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
API_URL=http://localhost:3000
```

**What to do:**
- ✅ Review the variables
- ✅ Copy to `.env` for local dev
- ✅ Fill in real values
- ✅ Add `.env` to `.gitignore` (don't commit!)

### `.copilot/settings.json`
**What it is:** Configuration telling AI agents about your project

**Example:**
```json
{
  "project": {
    "stack": "node",
    "testFramework": "jest",
    "cicdSystem": "GitHub Actions"
  }
}
```

**What to do:**
- ✅ Review the auto-detected values
- ✅ Correct any wrong detections (rare)
- ✅ Leave as-is (script got it right)

### `.copilot/instructions/03_*_specific.md`
**What it is:** Rules specific to your tech stack (Node, Python, Go, etc.)

**Example snippets:**
- How to organize your project
- What code style to use
- How to run tests
- Error handling patterns

**What to do:**
- ✅ Read once (good reference)
- ✅ AI agents use automatically (you don't need to!)

### `.copilot/instructions/_STACK_SUMMARY.md`
**What it is:** Quick reference guide for your project

**Contains:**
- Your tech stack summary
- Quick start commands
- Troubleshooting tips
- Next steps

**What to do:**
- ✅ Bookmark this file
- ✅ Read if something seems wrong
- ✅ Share with team members

---

## Verify Everything Works

### Test 1: Configuration Created
```bash
# Check files were created
ls -la .copilot/settings.json
ls -la .env.example
ls -la .copilot/instructions/03_*.md
```

**Expected:** All files exist ✅

### Test 2: Tests Run
```bash
npm test              # Node.js
pytest                # Python
go test ./...         # Go
mvn test              # Java
dotnet test           # .NET
```

**Expected:** All tests pass ✅

### Test 3: Project Builds
```bash
npm run build         # Node.js
python -m compile     # Python
go build ./...        # Go
mvn compile          # Java
dotnet build         # .NET
```

**Expected:** Build succeeds ✅

---

## Common Issues & Fixes

### Issue 1: "Script not found"
**Symptoms:** `bash: scripts/init-copilot-template.sh: No such file or directory`

**Fix:** Make sure you're in the project root:
```bash
pwd
# Should output your project path, not an error
ls scripts/init-copilot-template.sh
# Should show the file exists
```

### Issue 2: "Permission denied" (Mac/Linux)
**Symptoms:** `Permission denied` when running script

**Fix:** Make executable:
```bash
chmod +x scripts/init-copilot-template.sh
bash scripts/init-copilot-template.sh
```

### Issue 3: ".env not loading"
**Symptoms:** Environment variables not available in code

**Fix:** Ensure `.env` is in project root:
```bash
ls -la .env
# Should show .env file in current directory
```

Install dotenv if needed (Node.js):
```bash
npm install dotenv
```

Add to your code:
```javascript
require('dotenv').config();
```

### Issue 4: Tests not found
**Symptoms:** `npm test` or `pytest` says no tests found

**Fix:** Install test framework:
```bash
npm install --save-dev jest      # Node.js
pip install pytest               # Python
go get testing                   # Go (built-in)
```

### Issue 5: Database connection failed
**Symptoms:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Fix:** Ensure database is running:
```bash
# Check if running
pg_isready        # PostgreSQL
mongo --version   # MongoDB
mysql -u root     # MySQL
```

Start database (varies by OS/setup) or update `.env` with correct credentials.

---

## What Happens Next?

### You're Ready for AI Agents! 🤖

1. **Open VS Code**
2. **Open Copilot Chat** (Ctrl+Shift+I or Cmd+Shift+I)
3. **Pick an agent:**
   - Frontend Expert (for UIs)
   - Backend Architect (for APIs)
   - DevOps Lead (for deployment)
   - QA Specialist (for testing)
   - Orchestrator (any task)
4. **Ask a question:**
   ```
   "Create a login form with validation"
   "Add database connection"
   "Write tests for this function"
   "Deploy to production"
   ```

AI agents will:
- ✅ Read your project structure
- ✅ Understand your tech stack
- ✅ Write proper code
- ✅ Add tests automatically
- ✅ Validate before showing code
- ✅ Give you production-ready results

---

## Getting Help

📖 **Read the guides:**
- [HOW_TO_USE_FOR_HUMANS.md](docs/HOW_TO_USE_FOR_HUMANS.md) — Easy intro

📚 **Look up terms:**
- [BEGINNER_GLOSSARY.md](.copilot/BEGINNER_GLOSSARY.md) — Explain words

⚡ **Copy-paste tasks:**
- [COMMON_TASKS_GUIDE.md](docs/COMMON_TASKS_GUIDE.md) — 7 ready-made tasks

🔍 **Quick reference:**
- `.copilot/instructions/_STACK_SUMMARY.md` — Your project config

---

## Summary Checklist

- [ ] Run setup script (`bash scripts/init-copilot-template.sh` or `.bat`)
- [ ] Answer 5 questions (~1 minute)
- [ ] Files generated automatically ✅
- [ ] Copy `.env.example` to `.env` (optional)
- [ ] Add `.env` to `.gitignore`
- [ ] Run tests: `npm test` (or your framework)
- [ ] Tests pass ✅
- [ ] Open VS Code
- [ ] Start using AI agents in Copilot Chat

**Total Time:** 5-10 minutes  
**Result:** Fully configured, production-ready AI agent system! 🚀

---

**You're done! Start asking AI agents to build your features.**
