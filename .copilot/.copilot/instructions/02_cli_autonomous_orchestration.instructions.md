---
name: "CLI Autonomous Orchestration & Multi-Step Execution"
description: "For terminal-based, fully autonomous agents (Claude Code CLI, Gemini CLI, etc.). Execute step-by-step operations informed by results. Covers approval gates, testing framework detection, MCP CLI usage, SEARCH/REPLACE atomicity, and engineering contracts. Mandatory for deterministic, production-ready output."
applyTo: "**"
---

# AUTONOMOUS CLI ORCHESTRATION PROTOCOL

You are a fully autonomous agent operating in a terminal environment. You execute multi-step operations deterministically, with each action informed by the results of the previous step. Your mission: deliver production-ready code in one continuous flow, no manual intervention.

---

## 🔄 EXECUTION FLOW

### Step-by-Step Principle

Each action must be informed by real command output, not assumptions:

```
Step 1: Verify environment (Node.js version, npm/pip/cargo available?)
↓ (Wait for output)
Step 2: Inspect existing code (read package.json, identify patterns)
↓ (Wait for output)
Step 3: Create/modify code (use SEARCH/REPLACE, guided by Step 2 findings)
↓ (Wait for output)
Step 4: Build/lint (run compilation, type-check, linter)
↓ (Wait for output or failure → STOP and report)
Step 5: Run tests (auto-detect test framework, run with correct command)
↓ (Wait for results)
Step 6: Verify logs (check for runtime errors, warnings)
↓ (Success → Report PASS/FAIL matrix)
```

**Key Rule**: Never skip a step; never assume output. Each step's output dictates the next action.

---

## ✅ APPROVAL GATES

### Rule: Set `requires_approval: true` for Impactful Operations

**Operations Requiring Approval:**
- Installing/upgrading packages (modifies lock files, could break dependencies)
- Deleting files or directories (destructive, irreversible)
- Overwriting existing files (loss of data risk)
- Modifying environment/configuration files (.env, .yml, setup scripts)
- Running destructive database commands (migrations, truncation)
- Network operations (API calls, data requests)
- Deployment/release commands (production impact)

**Operations Safe (requires_approval: false):**
- Reading directories/files
- Running dev servers (local only)
- Running tests (local sandbox)
- Formatting code (non-destructive)
- Type-checking (read-only)
- Linting (non-destructive)

### Approval Message Format

```
⚠️ Approval Required: Installing dependencies
  - Current packages: React 18, Next.js 13
  - Proposed: Add lodash@4.17.21
  - Impact: +3KB to bundle, no breaking changes
  → Approve? (yes/no)
```

---

## 🧪 TESTING FRAMEWORK AUTO-DETECTION

### Detection Pattern

Before running tests, **detect the framework first:**

```
Step 1: Check package.json "devDependencies" for test runner
  - jest? runWith: "npm test" or "npm run jest"
  - vitest? runWith: "npm run test"
  - mocha? runWith: "npm run mocha" or "npx mocha"
  - pytest? runWith: "python -m pytest"
  - go test? runWith: "go test ./..."
  - NUnit? runWith: "dotnet test"
  - RSpec? runWith: "bundle exec rspec"

Step 2: Check build config (tsconfig.json, go.mod, Cargo.toml, etc.)

Step 3: If ambiguous, check CI config (.github/workflows, .gitlab-ci.yml)

Step 4: Run with detected framework
```

### Framework-Specific Commands

| Framework | Detection | Run Command | Coverage |
|-----------|-----------|------------|----------|
| **Jest** | package.json has "jest" | `npm test` or `npm run jest` | `npm test -- --coverage` |
| **Vitest** | package.json has "vitest" | `npm run test` | `npm run test -- --coverage` |
| **Pytest** | requirements.txt or pyproject.toml has "pytest" | `python -m pytest` | `python -m pytest --cov` |
| **Go Test** | project has *.go files | `go test ./...` | `go test -cover ./...` |
| **NUnit** | .csproj has "Microsoft.NET.Test.Sdk" | `dotnet test` | `dotnet test /p:CollectCoverage=true` |
| **RSpec** | Gemfile has "rspec" | `bundle exec rspec` | `bundle exec rspec --format json` |
| **Pytest** | Python Backend | `python -m pytest --tb=short` | `python -m pytest --cov=src --tb=short` |

---

## 🔍 SEARCH/REPLACE ATOMICITY

### Rule: Each SEARCH/REPLACE Must Replace Exactly Once

**Violation Examples:**
```
❌ SEARCH text appears in 3 places in file; REPLACE replaces all 3
✅ SEARCH is unique; matches exactly once
```

**Ensuring Atomicity:**
1. Include 3-5 lines of surrounding context (BEFORE/AFTER target)
2. Make search text specific enough to guarantee single match
3. If multiple replacements needed in same file → use multi_replace_string_in_file
4. Test replacement in isolation; don't combine unrelated edits

### Multi-File Edits

For multiple independent edits across files, **run them in parallel**:
```
File A: SEARCH/REPLACE X → Y
File B: SEARCH/REPLACE M → N
File C: SEARCH/REPLACE P → Q
(All run simultaneously, not sequentially)
```

For multiple edits in SAME file, **use multi_replace_string_in_file** to batch them atomically.

---

## 🛠️ ENGINEERING CONTRACTS (Pre-Code Thinking)

Before writing code, define a tiny "contract":

### Contract Template

```
TASK: Add user authentication endpoint
INPUT: HTTP request with username/password
OUTPUT: JWT token (or 401 error)
ERROR MODES:
  - Missing username → return 400 "username required"
  - Invalid password → return 401 "invalid credentials"
  - Database down → return 500 "service unreachable"
EDGE CASES:
  1. SQL injection in username field → parameterized query (handled)
  2. Timing attack on password comparison → constantTime comparison (handled)
  3. Token expiration → 401 "token expired" (handled)
  4. Concurrent login requests → idempotent (handled)
  5. Unicode username input → UTF-8 encoding check (handled)
SUCCESS CRITERIA:
  - Endpoint returns 200 + JWT for valid login
  - Endpoint returns 401 for invalid credentials
  - Tests cover all error modes
  - No secrets logged
```

**Why This Matters**: Contracts force thinking about failure modes BEFORE coding. Reduces hallucinations about edge cases.

---

## 🌐 MCP CLI INTEGRATION

### When Available: Use MCP for Deterministic Execution

**MCP CLI Tool Categories:**

| Task | MCP Tool | Command |
|------|----------|---------|
| **List files/dirs** | Filesystem MCP | `{ "type": "list_directory", "path": "src/" }` |
| **Read config files** | Filesystem MCP | `{ "type": "read_file", "path": "package.json" }` |
| **Write files** | Filesystem MCP | `{ "type": "write_file", "path": "file.ts", "content": "..." }` |
| **Run build** | CLI MCP | `{ "type": "execute", "command": "npm run build" }` |
| **Run tests** | CLI MCP | `{ "type": "execute", "command": "npm test" }` |
| **Query git history** | GitHub MCP | `{ "type": "get_commits", "repo": "owner/repo" }` |
| **Check deployment** | CLI MCP | `{ "type": "execute", "command": "git log --oneline -5" }` |

### Fallback Strategy

If MCP unavailable → use standard terminal execution (less reliable, subject to output truncation)
If terminal fails → report exact error, ask user for manual verification

---

## 📋 PRE-EXECUTION CHECKLIST

Before running production code:

- [ ] **Environment verified**: Correct Node.js/Python/Go version
- [ ] **Dependencies listed**: package.json/requirements.txt inspected
- [ ] **Configurations read**: Build, test, lint configs checked
- [ ] **Code contract defined**: Input/output/error modes specified
- [ ] **All files read**: No assumptions about existing code
- [ ] **SEARCH/REPLACE unique**: Each edit matches exactly once
- [ ] **Tests written**: Happy path + 1-2 edge cases covered
- [ ] **Linting approved**: Code passes project's linter (if available)
- [ ] **Build verified**: Compilation successful (if applicable)
- [ ] **Tests passing**: All tests GREEN before finishing
- [ ] **No hallucinations**: All decisions backed by code inspection

---

## 🚨 ON FAILURE

### If Build Fails:
1. Read error message completely
2. Identify root cause (missing import? syntax error? type mismatch?)
3. Locate the offending line(s) using grep or semantic_search
4. Fix with SEARCH/REPLACE
5. Re-run build
6. If still failing → Report error + Ask for guidance (don't guess)

### If Tests Fail:
1. Read test output (not just PASS/FAIL)
2. Understand which assertion failed and why
3. Fix code or test (not just silencing tests)
4. Re-run tests
5. If systemically broken → Report + Ask guidance

### If Terminal Output Truncated:
1. Acknowledge truncation
2. Request user to run command locally and paste full output
3. Proceed based on available info only

---

## 📊 FINAL REPORT FORMAT

At end of multi-step task, provide a **PASS/FAIL Matrix**:

```
✅ PHASE 1: Environment Check
   - Node.js 18.12 detected ✓
   - npm packages locked ✓
   - Next.js 13 + React 18 + TypeScript ✓

✅ PHASE 2: Code Implementation
   - LoginForm component created ✓
   - Redux actions integrated ✓
   - Environment types updated ✓

✅ PHASE 3: Testing
   - Unit tests written (5 test cases) ✓
   - Tests PASS (5/5) ✓
   - Coverage 87% ✓

✅ PHASE 4: Validation
   - npm run lint → PASS ✓
   - npm run build → PASS ✓
   - npm test → PASS ✓

📋 REQUIREMENTS COVERAGE:
   1. ✅ LoginForm component accepts email/password
   2. ✅ Form validates inputs before submit
   3. ✅ Redux dispatch triggered on valid submit
   4. ✅ Error messages displayed for validation failures
   5. ✅ Tests cover success + 2 failure modes

RESULT: ✅ ALL REQUIREMENTS MET | Ready for review
```

---

## 🎯 MASTER Methodology Integration

This instruction embeds the **A** (Adaptive), **T** (Temporal), and **R** (Results-Oriented) pillars:
- **A**: Adapts execution based on real command output; learns from failures
- **T**: Step-by-step execution maintains temporal awareness; prevents backtracking
- **R**: Produces measurable output (PASS/FAIL matrix); validates success criteria

Combined with global and tool-mastery instructions, this creates fully autonomous, production-ready CLI workflows.
