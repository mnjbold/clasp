@echo off
REM ============================================================================
REM VS Code Copilot AI Agent Template - Interactive Setup Script (Windows)
REM 
REM This script detects your project's tech stack, asks about available tools,
REM and auto-generates the complete `.copilot/` configuration for your project.
REM
REM Usage: scripts\init-copilot-template.bat
REM ============================================================================

setlocal enabledelayedexpansion

REM Color codes (limited in Windows CMD)
set "RESET=[0m"
set "BLUE=[34m"
set "GREEN=[32m"
set "YELLOW=[33m"
set "RED=[31m"
set "CYAN=[36m"

REM Global variables
set "DETECTED_STACK="
set "DETECTED_TEST_FRAMEWORK="
set "MCP_AVAILABLE=false"
set "CI_CD_SYSTEM="
set "DATABASE_TYPE="
set "FRAMEWORKS="

cls

echo.
echo ======================================================================
echo  Windows OS Detected - Using Command Prompt Compatible Version
echo ======================================================================
echo.
echo This script will configure your project for AI agents.
echo.
echo Starting interactive setup...
echo.

REM ========================================================================
REM TECH STACK DETECTION
REM ========================================================================

echo [*] Detecting tech stack...

if exist package.json (
    echo. [+] Node.js project detected (package.json found)
    set "DETECTED_STACK=node"
    set "FRAMEWORKS=Node.js"
    set "DETECTED_TEST_FRAMEWORK=jest"
) else if exist requirements.txt (
    echo. [+] Python project detected (requirements.txt found)
    set "DETECTED_STACK=python"
    set "FRAMEWORKS=Python"
    set "DETECTED_TEST_FRAMEWORK=pytest"
) else if exist go.mod (
    echo. [+] Go project detected (go.mod found)
    set "DETECTED_STACK=go"
    set "FRAMEWORKS=Go"
    set "DETECTED_TEST_FRAMEWORK=go-test"
) else if exist pom.xml (
    echo. [+] Java project detected (pom.xml found)
    set "DETECTED_STACK=java"
    set "FRAMEWORKS=Java"
    set "DETECTED_TEST_FRAMEWORK=junit"
) else (
    echo. [-] Could not auto-detect tech stack
    echo.
    echo Please select your tech stack:
    echo   1. Node.js (JavaScript/TypeScript)
    echo   2. Python
    echo   3. Go
    echo   4. Java
    echo   5. .NET (C#)
    echo   6. Ruby
    echo   7. Other
    echo.
    set /p "CHOICE=Enter choice (1-7): "
    
    if "!CHOICE!"=="1" (
        set "DETECTED_STACK=node"
        set "FRAMEWORKS=Node.js"
        set "DETECTED_TEST_FRAMEWORK=jest"
    ) else if "!CHOICE!"=="2" (
        set "DETECTED_STACK=python"
        set "FRAMEWORKS=Python"
        set "DETECTED_TEST_FRAMEWORK=pytest"
    ) else if "!CHOICE!"=="3" (
        set "DETECTED_STACK=go"
        set "FRAMEWORKS=Go"
        set "DETECTED_TEST_FRAMEWORK=go-test"
    ) else if "!CHOICE!"=="4" (
        set "DETECTED_STACK=java"
        set "FRAMEWORKS=Java"
        set "DETECTED_TEST_FRAMEWORK=junit"
    ) else if "!CHOICE!"=="5" (
        set "DETECTED_STACK=dotnet"
        set "FRAMEWORKS=.NET"
        set "DETECTED_TEST_FRAMEWORK=nunit"
    ) else if "!CHOICE!"=="6" (
        set "DETECTED_STACK=ruby"
        set "FRAMEWORKS=Ruby"
        set "DETECTED_TEST_FRAMEWORK=rspec"
    ) else (
        set "DETECTED_STACK=other"
        set "FRAMEWORKS=Other"
    )
)

echo.
echo [+] Primary tech stack: !FRAMEWORKS!
echo.

REM ========================================================================
REM MCP AVAILABILITY
REM ========================================================================

echo [*] Checking MCP server availability...
echo.
echo Do you have GitHub API access? (y/n)
set /p "MCP_GITHUB="
if /i "!MCP_GITHUB!"=="y" (
    set "MCP_AVAILABLE=true"
    echo. [+] GitHub MCP enabled
)

echo.
where docker >nul 2>&1
if !errorlevel! equ 0 (
    echo. [+] Docker detected
    echo Do you want to enable Docker CLI MCP support? (y/n)
    set /p "MCP_DOCKER="
    if /i "!MCP_DOCKER!"=="y" (
        set "MCP_AVAILABLE=true"
        echo. [+] Docker CLI MCP enabled
    )
)

if "!MCP_AVAILABLE!"=="false" (
    echo. [-] No MCP servers detected - will use standard tools
)

echo.

REM ========================================================================
REM TESTING FRAMEWORK
REM ========================================================================

echo [*] Testing framework: !DETECTED_TEST_FRAMEWORK!
echo.

REM ========================================================================
REM CI/CD SYSTEM
REM ========================================================================

echo [*] CI/CD System
echo.
echo Which CI/CD system do you use?
echo   1. GitHub Actions
echo   2. GitLab CI
echo   3. Jenkins
echo   4. Circle CI
echo   5. Travis CI
echo   6. Azure Pipelines
echo   7. None/Other
echo.
set /p "CI_CHOICE=Enter choice (1-7): "

if "!CI_CHOICE!"=="1" (
    set "CI_CD_SYSTEM=GitHub Actions"
) else if "!CI_CHOICE!"=="2" (
    set "CI_CD_SYSTEM=GitLab CI"
) else if "!CI_CHOICE!"=="3" (
    set "CI_CD_SYSTEM=Jenkins"
) else if "!CI_CHOICE!"=="4" (
    set "CI_CD_SYSTEM=Circle CI"
) else if "!CI_CHOICE!"=="5" (
    set "CI_CD_SYSTEM=Travis CI"
) else if "!CI_CHOICE!"=="6" (
    set "CI_CD_SYSTEM=Azure Pipelines"
) else (
    set "CI_CD_SYSTEM=None/Other"
)

echo. [+] CI/CD system: !CI_CD_SYSTEM!
echo.

REM ========================================================================
REM DATABASE TYPE
REM ========================================================================

echo [*] Database Type
echo.
echo Which database do you use?
echo   1. PostgreSQL
echo   2. MongoDB
echo   3. MySQL
echo   4. SQLite
echo   5. DynamoDB (AWS)
echo   6. Firestore (Google)
echo   7. Redis
echo   8. None/Other
echo.
set /p "DB_CHOICE=Enter choice (1-8): "

if "!DB_CHOICE!"=="1" (
    set "DATABASE_TYPE=PostgreSQL"
) else if "!DB_CHOICE!"=="2" (
    set "DATABASE_TYPE=MongoDB"
) else if "!DB_CHOICE!"=="3" (
    set "DATABASE_TYPE=MySQL"
) else if "!DB_CHOICE!"=="4" (
    set "DATABASE_TYPE=SQLite"
) else if "!DB_CHOICE!"=="5" (
    set "DATABASE_TYPE=DynamoDB"
) else if "!DB_CHOICE!"=="6" (
    set "DATABASE_TYPE=Firestore"
) else if "!DB_CHOICE!"=="7" (
    set "DATABASE_TYPE=Redis"
) else (
    set "DATABASE_TYPE=None/Other"
)

echo. [+] Database type: !DATABASE_TYPE!
echo.

REM ========================================================================
REM GENERATE FILES
REM ========================================================================

echo [*] Generating configuration files...
echo.

REM Generate .env.example
echo [+] Generating .env.example
(
    echo # ============================================================================
    echo # DO NOT COMMIT REAL SECRETS - THIS FILE IS FOR EXAMPLES ONLY
    echo # Copy this to .env and fill in real values (which should NOT be in git^)
    echo # ============================================================================
    echo.
    echo # General Configuration
    echo NODE_ENV=development
    echo DEBUG=true
    echo.
) > .env.example

if "!DETECTED_STACK!"=="node" (
    (
        echo # Node.js / Next.js
        echo PORT=3000
        echo API_URL=http://localhost:3000
        echo NEXT_PUBLIC_API_URL=http://localhost:3000
        echo.
        echo # Database (if using^)
        echo DATABASE_URL=postgresql://user:password@localhost:5432/mydb
        echo.
    ) >> .env.example
) else if "!DETECTED_STACK!"=="python" (
    (
        echo # Python / FastAPI / Django
        echo FASTAPI_PORT=8000
        echo DJANGO_SECRET_KEY=your-secret-key-here
        echo DATABASE_URL=postgresql://user:password@localhost:5432/mydb
        echo.
    ) >> .env.example
) else if "!DETECTED_STACK!"=="go" (
    (
        echo # Go / Microservice
        echo SERVICE_PORT=8080
        echo SERVICE_NAME=my-service
        echo DATABASE_CONNECTION_STRING=postgresql://user:password@localhost:5432/mydb
        echo.
    ) >> .env.example
)

if "!MCP_AVAILABLE!"=="true" (
    (
        echo # MCP Server Configuration
        echo GITHUB_TOKEN=ghp_your_token_here
        echo GITHUB_MCP_ENABLED=true
        echo.
    ) >> .env.example
)

(
    echo # External Services (if using^)
    echo # STRIPE_API_KEY=sk_test_...
    echo # SENDGRID_API_KEY=SG.your_key_here
    echo.
    echo # Copilot Agent Configuration
    echo COPILOT_AGENT_TIMEOUT=30000
    echo COPILOT_MAX_CONTEXT=8000
    echo COPILOT_ENABLE_MCP=true
) >> .env.example

echo.

REM Create .copilot directory if it doesn't exist
if not exist .copilot (
    mkdir .copilot
    echo [+] Created .copilot directory
)

if not exist .copilot\instructions (
    mkdir .copilot\instructions
    echo [+] Created .copilot\instructions directory
)

REM Generate .copilot\settings.json
echo [+] Generating .copilot\settings.json

(
    echo {
    echo   "project": {
    echo     "name": "%cd:*\=%",
    echo     "description": "AI-powered coding with VS Code Copilot",
    echo     "stack": "!DETECTED_STACK!",
    echo     "frameworks": ["!FRAMEWORKS!"],
    echo     "testFramework": "!DETECTED_TEST_FRAMEWORK!",
    echo     "cicdSystem": "!CI_CD_SYSTEM!",
    echo     "database": "!DATABASE_TYPE!"
    echo   },
    echo   "mcp": {
    echo     "enabled": !MCP_AVAILABLE!,
    echo     "servers": {
    echo       "github": false,
    echo       "filesystem": true,
    echo       "cli": true
    echo     }
    echo   },
    echo   "agents": {
    echo     "enabled": true,
    echo     "defaultAgent": "orchestrator",
    echo     "availableAgents": [
    echo       "orchestrator",
    echo       "frontend_expert",
    echo       "backend_architect",
    echo       "devops_lead",
    echo       "qa_specialist"
    echo     ]
    echo   },
    echo   "testing": {
    echo     "framework": "!DETECTED_TEST_FRAMEWORK!",
    echo     "minCoverage": 80,
    echo     "autoRun": true
    echo   },
    echo   "preProductionGates": {
    echo     "enabled": true,
    echo     "requireTests": true,
    echo     "requireCoverage": true,
    echo     "requiredCoverage": 80
    echo   },
    echo   "safety": {
    echo     "antiHallucination": true,
    echo     "mandatoryExploration": true,
    echo     "noPIIExposure": true
    echo   }
    echo }
) > .copilot\settings.json

echo.

REM ========================================================================
REM FINAL SUMMARY
REM ========================================================================

echo.
echo ======================================================================
echo  Setup Complete!
echo ======================================================================
echo.
echo Files created:
echo   [+] .env.example
echo   [+] .copilot\settings.json
echo.
echo Next steps:
echo   1. Copy .env.example to .env and fill in real values
echo   2. Add .env to .gitignore: type .env ^>^> .gitignore
echo   3. Run tests with your framework's test command
echo   4. Open VS Code and start using agents in Copilot Chat
echo.
echo Configuration Summary:
echo   Stack:       !DETECTED_STACK!
echo   Frameworks:  !FRAMEWORKS!
echo   Tests:       !DETECTED_TEST_FRAMEWORK!
echo   CI/CD:       !CI_CD_SYSTEM!
echo   Database:    !DATABASE_TYPE!
echo   MCP:         !MCP_AVAILABLE!
echo.
echo Happy coding! 🚀
echo.

pause
