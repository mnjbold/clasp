# 📋 Common Tasks Guide - Copy & Paste Instructions

**No experience needed!** Just copy the task, paste it in Copilot chat, and follow the instructions.

---

## ✅ TASK 1: Create a Login Form (5 Minutes)

### What You'll Get:
- Login form that looks nice
- Password field (dots instead of visible text)
- Validation (checks for empty fields)
- Tests (proves it works)
- Submit button

### Steps:

**Step 1:** Copy this request:
```
Frontend Expert, please create a login form component with these fields:
- Email input (with validation)
- Password input (hidden text)
- "Remember me" checkbox
- Login button (disabled while submitting)
Include styling to make it look professional.
Write tests for: 1) Valid login, 2) Empty email, 3) Empty password.
All tests must PASS before you show me the code.
```

**Step 2:** Paste it in Copilot chat and press Enter

**Step 3:** Wait for agent response (30 seconds to 2 minutes)

**Step 4:** You'll see:
```
✅ Component code (React or Vue or Angular)
✅ CSS styling
✅ Tests (showing ✅ PASS)
✅ PASS/FAIL matrix
```

**Step 5:** Click the copy button (📋) on the code block

**Step 6:** Open your project file and paste (`Ctrl+V`)

**Step 7:** Done! 🎉 Login form is ready to use!

---

## ✅ TASK 2: Add Database Connection (10 Minutes)

### What You'll Get:
- Connection code (PostgreSQL/MongoDB)
- Error handling (if database is down)
- Tests proving it works
- Ready to use immediately

### Steps:

**Step 1:** Copy this request:
```
Backend Architect, please create a database connection for [DATABASE_TYPE: PostgreSQL/MongoDB/MySQL].
Include:
- Connection config (reads from .env file)
- Error handling (connection fails gracefully)
- Connection pooling (reuses connections)
- Tests for: 1) Successful connection, 2) Connection timeout, 3) Invalid credentials

The code should be production-ready with all tests PASSING.
```

**Step 2:** Replace `[DATABASE_TYPE: ...]` with your database (choose one):
- `PostgreSQL`
- `MongoDB`
- `MySQL`
- `SQLite`

**Step 3:** Paste in chat and press Enter

**Step 4:** You'll see:
```
✅ Connection code
✅ Error handling pattern
✅ .env example variables
✅ Tests (✅ PASS)
```

**Step 5:** Copy the code and paste into your project

**Step 6:** Done! 🎉 Database is connected!

---

## ✅ TASK 3: Write Tests for Existing Code (10 Minutes)

### What You'll Get:
- Complete test file
- Happy path test (normal use)
- Error cases test (what if it breaks?)
- Edge cases test (unusual inputs)
- Coverage report

### Steps:

**Step 1:** Copy the function you want tested (from your code)

**Step 2:** Copy this request:
```
QA Specialist, please write comprehensive tests for this function:

[PASTE YOUR FUNCTION HERE]

Write tests for:
1. Normal case (happy path)
2. Error case (function fails)
3. Edge case (unusual inputs)
4. Boundary case (minimum/maximum values)

Use [TEST_FRAMEWORK: Jest/Pytest/Mocha].
All tests must PASS with minimum 80% coverage.
```

**Step 3:** Paste in chat and press Enter

**Step 4:** You'll see:
```
✅ Test file (ready to copy)
✅ Each test explained
✅ Test results: X passed, 0 failed
✅ Coverage: XX% ✓
```

**Step 5:** Copy and paste into your test folder

**Step 6:** Done! 🎉 Good tests written and passing!

---

## ✅ TASK 4: Fix a Common Bug (10 Minutes)

### What You'll Get:
- Root cause explanation (why the bug happened)
- Fixed code
- Tests proving it's fixed

### Steps:

**Step 1:** Copy this request based on your bug:

### Bug: Duplicate Submissions
```
Backend Architect, I have a bug where users can click the submit button 
twice and it processes the request twice.

Here's the form code:
[PASTE YOUR CODE HERE]

How do I prevent duplicate submissions? Write the fixed code with tests 
proving it can't submit twice, no matter how many times the user clicks.
```

### Bug: Login Not Working
```
Backend Architect, users can't log in even with correct credentials.

Here's the login code:
[PASTE YOUR CODE HERE]

What's wrong? Fix it and write tests that verify:
1) Correct email/password → Login succeeds
2) Wrong password → Login fails
3) Missing email → Login fails
```

### Bug: Data Not Saving
```
Backend Architect, user data isn't saving to the database.

Here's my code:
[PASTE YOUR CODE HERE]

What's wrong? Fix it and include tests proving data is saved correctly.
```

**Step 2:** Paste in chat and press Enter

**Step 3:** You'll see:
```
✅ Explanation of the bug
✅ Fixed code
✅ Tests (✅ PASS)
✅ Before/after comparison
```

**Step 4:** Copy the fixed code

**Step 5:** Replace your broken code with fixed version

**Step 6:** Done! 🎉 Bug fixed and tests verify it's fixed!

---

## ✅ TASK 5: Deploy to Production (15 Minutes)

### What You'll Get:
- Deployment checklist
- Docker setup (if needed)
- Environment configuration
- Deployment steps
- Rollback plan (if something goes wrong)

### Steps:

**Step 1:** Copy this request:
```
DevOps Lead, I want to deploy my app to production on [PLATFORM: Heroku/AWS/Azure/DigitalOcean].

Current setup:
- Framework: [Next.js/FastAPI/Go]
- Database: [PostgreSQL/MongoDB]
- Testing: [Jest/Pytest]

I need:
1. Deployment guide (step-by-step)
2. Environment variables configured
3. Database migrations handled
4. Health check endpoint
5. Rollback plan

Make sure everything is production-ready!
```

**Step 2:** Replace placeholders with your actual setup

**Step 3:** Paste in chat and press Enter

**Step 4:** You'll see:
```
✅ Deployment guide
✅ Scripts to run
✅ Environment setup
✅ Health check code
✅ Rollback instructions
```

**Step 5:** Follow the step-by-step guide

**Step 6:** Done! 🎉 App is live in production!

---

## ✅ TASK 6: Add User Authentication (20 Minutes)

### What You'll Get:
- Authentication logic (secure passwords)
- Login endpoint
- Registration endpoint
- Token generation (stay logged in)
- Tests for all scenarios

### Steps:

**Step 1:** Copy this request:
```
Backend Architect, please create a secure user authentication system:

Requirements:
- User registration (email + password)
- User login (email + password)
- Password hashing (never store plain text)
- JWT tokens (keep user logged in)
- Logout endpoint

Security checks:
- Password must be at least 8 characters
- Email must be valid
- No SQL injection
- HTTPS-only cookies

Write tests proving all security features work.
All tests must PASS.
```

**Step 2:** Paste in chat and press Enter

**Step 3:** You'll see:
```
✅ Authentication code (secure)
✅ API endpoints (3 endpoints)
✅ Password hashing setup
✅ Token generation
✅ Tests (✅ PASS)
```

**Step 4:** Copy and integrate into your project

**Step 5:** Done! 🎉 Secure authentication working!

---

## ✅ TASK 7: Create API Documentation (10 Minutes)

### What You'll Get:
- Documentation for all API endpoints
- Request/response examples
- Error codes explained
- Usage instructions

### Steps:

**Step 1:** Copy this request:
```
Backend Architect, please document the API I just created:

[PASTE YOUR API ROUTES HERE]

For each route, provide:
- What it does (description)
- How to call it (example request)
- What it returns (example response)
- Error cases (what can go wrong)

Make it clear enough that another developer can use it immediately.
```

**Step 2:** Paste in chat and press Enter

**Step 3:** You'll see:
```
✅ Documentation (nicely formatted)
✅ Example requests
✅ Example responses
✅ Error cases
✅ Usage guide
```

**Step 4:** Copy to your README or wiki

**Step 5:** Done! 🎉 API is documented!

---

## 🎯 Quick Reference

### Fastest Tasks (< 5 min):
- Write comments explaining code
- Generate API error messages
- Create environmental variable templates

### Medium Tasks (5-15 min):
- Create login form
- Add database connection
- Write tests
- Fix simple bugs

### Complex Tasks (15-30 min):
- Add authentication system
- Deploy to production
- Build complete feature
- Setup CI/CD pipeline

---

## ❓ What If Something Goes Wrong?

### If code doesn't compile:
```
"The code didn't compile. Error: [PASTE ERROR]"
Agent will fix it! ✅
```

### If tests fail:
```
"Tests are failing. [PASTE TEST OUTPUT]"
Agent will fix it! ✅
```

### If you don't understand the output:
```
"I don't understand the PASS/FAIL matrix. Can you explain it simply?"
Agent will explain! ✅
```

---

## 🚀 You're Ready!

Pick a task above, copy-paste it, and start building! 🎉

Need more help? Read:
- [HOW_TO_USE_FOR_HUMANS.md] - Beginner's guide
- [BEGINNER_GLOSSARY.md] - What do these words mean?
- [QUICK_START_VISUAL.md] - See the flowchart
