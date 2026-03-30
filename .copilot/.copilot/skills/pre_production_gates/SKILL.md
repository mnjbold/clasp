---
name: "pre_production_gates"
description: "Master skill for pre-production quality validation. Automatically detects testing framework (Jest, Pytest, Go Test, NUnit), runs syntax check, build verification, comprehensive test suite with coverage thresholds, and generates PASS/FAIL matrix mapping requirements to test results. Mandatory quality gate before any code is considered 'done'."
---

# Pre-Production Gates Skill

## Overview

This skill enforces 100% automated testing and zero-bug validation before code is marked complete. It auto-detects your project's testing framework and validation tools, then runs the full quality checklist.

---

## 🎯 Auto-Detection Engine

### Testing Framework Detection

```bash
Step 1: Read package.json / requirements.txt / go.mod / pom.xml / Cargo.toml
Step 2: Identify test framework
        - Jest/Vitest? → npm test
        - Pytest? → python -m pytest
        - Go? → go test ./...
        - NUnit? → dotnet test
        - RSpec? → bundle exec rspec
Step 3: Identify linter
        - ESLint? → npm run lint
        - Pylint? → python -m pylint
        - Clippy? → cargo clippy
Step 4: Identify build command
        - npm run build / cargo build / go build / dotnet build
```

---

## ✅ Phase 1: Syntax & Build Check

### Validation Steps:
1. Run linter (ESLint, Pylint, Clippy, etc.) → fix all warnings
2. Run type checker (TypeScript, Mypy, Clippy) → fix all errors
3. Run build command → verify compilation succeeds
4. Check for file import errors → resolve all missing imports

### Success Criteria:
- ✅ Lint: 0 warnings/errors
- ✅ Type check: 0 errors
- ✅ Build: ✓ Compilation successful
- ✅ All dependencies available

---

## ✅ Phase 2: Automated Testing Validation

### Test Coverage Requirements:
- ✅ Happy path tested (main functionality)
- ✅ 1-2 edge cases covered (boundary conditions)
- ✅ Error handling tested (failure modes)
- ✅ Minimum coverage threshold: 80%+ (configurable)

### Commands by Framework:

| Framework | Test Command | Coverage Command |
|-----------|--------------|------------------|
| Jest | `npm test` | `npm test -- --coverage` |
| Pytest | `python -m pytest` | `python -m pytest --cov=src --cov-report=term-missing` |
| Go Test | `go test ./...` | `go test -cover ./...` |
| NUnit | `dotnet test` | `dotnet test /p:CollectCoverage=true` |
| RSpec | `bundle exec rspec` | `bundler exec rspec --format json-mutations` |

### Success Criteria:
- ✅ All tests: GREEN (PASS)
- ✅ Coverage: 80%+
- ✅ No skipped/pending tests
- ✅ No flaky tests (consistent results)

---

## ✅ Phase 3: Terminal & Log Verification

### Validation Steps:
1. Check dev server logs for runtime errors
2. Verify edge case behavior in terminal
3. Confirm API responses (if applicable)
4. Check database state (if applicable)

### Success Criteria:
- ✅ No runtime errors in logs
- ✅ No warnings in console
- ✅ All API responses correct
- ✅ Database transactions atomic

---

## ✅ Phase 4: Requirements Mapping

### PASS/FAIL Matrix

Generate a matrix mapping every requirement to test case(s):

```
REQUIREMENT                           | TEST CASE                  | STATUS
--------------------------------------|---------------------------|--------
1. Login form accepts email+password  | test_login_form_submit()   | ✅ PASS
2. Form validates inputs              | test_login_validation()    | ✅ PASS
3. Redux dispatch on submit           | test_redux_dispatch()      | ✅ PASS
4. Error visible for failed login     | test_error_message()       | ✅ PASS
5. Rate limiting prevents brute force | test_rate_limit()          | ✅ PASS
```

### Final Report

```
=== PRE-PRODUCTION GATES REPORT ===

✅ PHASE 1: Syntax & Build (PASS)
   Linter: 0 errors
   TypeScript: 0 errors
   Build: ✓ Success
   Dependencies: ✓ All available

✅ PHASE 2: Testing (PASS)
   Total Tests: 42
   Passed: 42 ✓
   Failed: 0
   Coverage: 87% (Target: 80%+) ✓

✅ PHASE 3: Verification (PASS)
   Runtime errors: 0
   Console warnings: 0
   API responses: ✓ Correct
   Database state: ✓ Valid

✅ PHASE 4: Requirements Mapping (PASS)
   Requirements covered: 5/5
   Tests green: 5/5
   Edge cases: 3/3

RESULT: ✅ ALL GATES PASSED | Ready for production
```

---

## 🚀 Usage

### Via Copilot Chat:
```
User: "Run pre-production gates"
Agent Response: [Automatically detects framework, runs all checks, returns PASS/FAIL matrix]
```

### Via Terminal (MCP CLI):
```bash
# Auto-detect and run all gates
./scripts/pre-production-gates.sh

# Or manually specify framework
./scripts/pre-production-gates.sh --framework jest
./scripts/pre-production-gates.sh --framework pytest
```

---

## 📋 Configuration Files

### `.copilot/settings.json` (Auto-Generated)

```json
{
  "preProductionGates": {
    "framework": "jest",
    "testCommand": "npm test",
    "coverageThreshold": 80,
    "buildCommand": "npm run build",
    "lintCommand": "npm run lint",
    "requiredPasses": ["syntax", "build", "tests", "coverage", "logs"]
  }
}
```

### `.copilot/quality-gates.json` (Custom Thresholds)

```json
{
  "coverage": {
    "branches": 85,
    "lines": 80,
    "functions": 80,
    "statements": 80
  },
  "lint": {
    "maxWarnings": 0,
    "maxErrors": 0
  },
  "performance": {
    "testTimeout": 30000,
    "buildTimeout": 120000
  }
}
```

---

## 🛠️ Troubleshooting

### "Tests failing but code looks correct"
→ Run with verbose flag: `npm test -- --verbose`
→ Check for environment setup (env vars, database, mock servers)

### "Coverage threshold not met"
→ Identify untested code: `npm test -- --coverage`
→ Write tests for branches with <80% coverage
→ Merge similar tests to improve coverage

### "Build succeeds locally but CI/CD fails"
→ Check Node.js/Python version match
→ Verify all dependencies in package.json/requirements.txt
→ Run on same OS as CI (or use Docker)

---

## ✨ MASTER Methodology Integration

This skill embeds **R** (Results-Oriented):
- Validates every requirement is met before marking done
- Provides measurable PASS/FAIL evidence
- Prevents shipping broken code to production
- Ensures 100% test coverage before release
