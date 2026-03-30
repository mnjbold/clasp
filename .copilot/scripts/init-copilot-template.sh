#!/bin/bash

##############################################################################
# VS Code Copilot AI Agent Template - Interactive Setup Script
# 
# This script detects your project's tech stack, asks about available tools,
# and auto-generates the complete `.copilot/` configuration for your project.
#
# Usage: bash scripts/init-copilot-template.sh
##############################################################################

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global variables
PROJECT_ROOT="."
DETECTED_STACK=""
DETECTED_FRAMEWORKS=()
DETECTED_TEST_FRAMEWORK=""
MCP_AVAILABLE=false
CI_CD_SYSTEM=""
DATABASE_TYPE=""

##############################################################################
# UTILITY FUNCTIONS
##############################################################################

print_header() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}  $1"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅  $1${NC}"
}

print_error() {
    echo -e "${RED}❌  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️   $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️   $1${NC}"
}

prompt_yes_no() {
    local prompt="$1"
    local response
    while true; do
        read -p "$(echo -e '${CYAN}'"$prompt"' (y/n): ${NC}')" -r response
        case "$response" in
            [yY][eE][sS]|[yY])
                return 0
                ;;
            [nN][oO]|[nN])
                return 1
                ;;
            *)
                echo "Please answer y or n."
                ;;
        esac
    done
}

prompt_choice() {
    local prompt="$1"
    shift
    local options=("$@")
    local choice
    
    echo -e "${CYAN}$prompt${NC}"
    for i in "${!options[@]}"; do
        echo "  $((i + 1)). ${options[$i]}"
    done
    
    while true; do
        read -p "$(echo -e '${CYAN}Enter choice (1-'${#options[@]}'): ${NC}')" choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
            echo "${options[$((choice - 1))]}"
            return 0
        else
            echo "Invalid choice. Please enter a number between 1 and ${#options[@]}."
        fi
    done
}

##############################################################################
# TECH STACK DETECTION
##############################################################################

detect_node_project() {
    if [[ -f "package.json" ]]; then
        print_success "Detected Node.js project (package.json found)"
        DETECTED_STACK="node"
        DETECTED_FRAMEWORKS+=("Node.js")
        
        # Check for frameworks
        if grep -q '"next"' package.json; then
            DETECTED_FRAMEWORKS+=("Next.js")
        fi
        if grep -q '"react"' package.json; then
            DETECTED_FRAMEWORKS+=("React")
        fi
        if grep -q '"express"' package.json; then
            DETECTED_FRAMEWORKS+=("Express")
        fi
        if grep -q '"nestjs"' package.json; then
            DETECTED_FRAMEWORKS+=("NestJS")
        fi
        
        # Detect test framework
        if grep -q '"jest"' package.json; then
            DETECTED_TEST_FRAMEWORK="jest"
        elif grep -q '"vitest"' package.json; then
            DETECTED_TEST_FRAMEWORK="vitest"
        elif grep -q '"mocha"' package.json; then
            DETECTED_TEST_FRAMEWORK="mocha"
        fi
        
        return 0
    fi
    return 1
}

detect_python_project() {
    if [[ -f "requirements.txt" || -f "Pipfile" || -f "pyproject.toml" || -f "setup.py" ]]; then
        print_success "Detected Python project"
        DETECTED_STACK="python"
        DETECTED_FRAMEWORKS+=("Python")
        
        # Check for frameworks
        if grep -q "django" requirements.txt 2>/dev/null || grep -q "Django" Pipfile 2>/dev/null; then
            DETECTED_FRAMEWORKS+=("Django")
        fi
        if grep -q "fastapi" requirements.txt 2>/dev/null || grep -q "fastapi" Pipfile 2>/dev/null; then
            DETECTED_FRAMEWORKS+=("FastAPI")
        fi
        if grep -q "flask" requirements.txt 2>/dev/null || grep -q "Flask" Pipfile 2>/dev/null; then
            DETECTED_FRAMEWORKS+=("Flask")
        fi
        
        # Detect test framework
        DETECTED_TEST_FRAMEWORK="pytest"
        
        return 0
    fi
    return 1
}

detect_go_project() {
    if [[ -f "go.mod" ]]; then
        print_success "Detected Go project (go.mod found)"
        DETECTED_STACK="go"
        DETECTED_FRAMEWORKS+=("Go")
        DETECTED_TEST_FRAMEWORK="go-test"
        return 0
    fi
    return 1
}

detect_java_project() {
    if [[ -f "pom.xml" || -f "build.gradle" ]]; then
        print_success "Detected Java project"
        DETECTED_STACK="java"
        DETECTED_FRAMEWORKS+=("Java")
        
        if [[ -f "pom.xml" ]]; then
            DETECTED_TEST_FRAMEWORK="junit"
        else
            DETECTED_TEST_FRAMEWORK="gradle-test"
        fi
        return 0
    fi
    return 1
}

detect_dotnet_project() {
    if [[ -f "*.csproj" || -f "*.vbproj" ]]; then
        print_success "Detected .NET project"
        DETECTED_STACK="dotnet"
        DETECTED_FRAMEWORKS+=(".NET")
        DETECTED_TEST_FRAMEWORK="nunit"
        return 0
    fi
    return 1
}

detect_tech_stack() {
    print_header "🔍 Detecting Tech Stack"
    
    detect_node_project || \
    detect_python_project || \
    detect_go_project || \
    detect_java_project || \
    detect_dotnet_project
    
    if [[ -z "$DETECTED_STACK" ]]; then
        print_warning "Could not auto-detect tech stack"
        print_info "Please select your primary tech stack:"
        
        local choice
        choice=$(prompt_choice "Which tech stack are you using?" \
            "Node.js (JavaScript/TypeScript)" \
            "Python" \
            "Go" \
            "Java" \
            ".NET (C#)" \
            "Ruby" \
            "Other")
        
        case "$choice" in
            "Node.js (JavaScript/TypeScript)")
                DETECTED_STACK="node"
                DETECTED_FRAMEWORKS+=("Node.js")
                DETECTED_TEST_FRAMEWORK="jest"
                ;;
            "Python")
                DETECTED_STACK="python"
                DETECTED_FRAMEWORKS+=("Python")
                DETECTED_TEST_FRAMEWORK="pytest"
                ;;
            "Go")
                DETECTED_STACK="go"
                DETECTED_FRAMEWORKS+=("Go")
                DETECTED_TEST_FRAMEWORK="go-test"
                ;;
            "Java")
                DETECTED_STACK="java"
                DETECTED_FRAMEWORKS+=("Java")
                DETECTED_TEST_FRAMEWORK="junit"
                ;;
            ".NET (C#)")
                DETECTED_STACK="dotnet"
                DETECTED_FRAMEWORKS+=(".NET")
                DETECTED_TEST_FRAMEWORK="nunit"
                ;;
            "Ruby")
                DETECTED_STACK="ruby"
                DETECTED_FRAMEWORKS+=("Ruby")
                DETECTED_TEST_FRAMEWORK="rspec"
                ;;
            *)
                DETECTED_STACK="other"
                print_warning "Unknown stack - will use generic configuration"
                ;;
        esac
    fi
    
    print_success "Primary tech stack: ${DETECTED_FRAMEWORKS[0]}"
    if [[ ${#DETECTED_FRAMEWORKS[@]} -gt 1 ]]; then
        print_info "Additional frameworks detected: ${DETECTED_FRAMEWORKS[@]:1}"
    fi
}

##############################################################################
# MCP SERVER DETECTION & CONFIGURATION
##############################################################################

detect_mcp_availability() {
    print_header "🔗 MCP Server Availability"
    print_info "MCP (Model Context Protocol) servers enable super-fast context gathering."
    print_info "Do you have access to any MCP servers?\n"
    
    # GitHub MCP
    if prompt_yes_no "Do you have GitHub API access (GitHub MCP)?"; then
        MCP_AVAILABLE=true
        print_success "GitHub MCP enabled"
    fi
    
    # Check for Docker (CLI MCP)
    if command -v docker &> /dev/null; then
        print_success "Docker detected (CLI MCP can use Docker)"
        if prompt_yes_no "Enable Docker CLI MCP support?"; then
            MCP_AVAILABLE=true
            print_success "Docker CLI MCP enabled"
        fi
    fi
    
    if [[ "$MCP_AVAILABLE" == false ]]; then
        print_warning "No MCP servers detected - will use standard tools with slightly slower context"
    fi
}

##############################################################################
# TESTING & CI/CD CONFIGURATION
##############################################################################

configure_testing() {
    print_header "🧪 Testing Framework Configuration"
    
    if [[ -z "$DETECTED_TEST_FRAMEWORK" ]]; then
        print_warning "Could not auto-detect testing framework"
        DETECTED_TEST_FRAMEWORK=$(prompt_choice "Which testing framework do you use?" \
            "Jest (Node.js/TypeScript)" \
            "Vitest (Vite projects)" \
            "Pytest (Python)" \
            "Go Test (Go)" \
            "JUnit (Java)" \
            "NUnit (.NET)" \
            "RSpec (Ruby)" \
            "Mocha (Node.js)" \
            "None/Other")
    else
        print_success "Auto-detected test framework: $DETECTED_TEST_FRAMEWORK"
        if ! prompt_yes_no "Is this correct?"; then
            DETECTED_TEST_FRAMEWORK=$(prompt_choice "Please select the correct testing framework:" \
                "Jest (Node.js/TypeScript)" \
                "Vitest (Vite projects)" \
                "Pytest (Python)" \
                "Go Test (Go)" \
                "JUnit (Java)" \
                "NUnit (.NET)" \
                "RSpec (Ruby)" \
                "Mocha (Node.js)" \
                "None/Other")
        fi
    fi
}

configure_ci_cd() {
    print_header "🚀 CI/CD System Configuration"
    print_info "Which CI/CD system does your project use?\n"
    
    CI_CD_SYSTEM=$(prompt_choice "Select your CI/CD system:" \
        "GitHub Actions" \
        "GitLab CI" \
        "Jenkins" \
        "Circle CI" \
        "Travis CI" \
        "Azure Pipelines" \
        "None/Other")
    
    print_success "CI/CD system: $CI_CD_SYSTEM"
}

configure_database() {
    print_header "💾 Database Configuration"
    print_info "What type of database does your project use?\n"
    
    DATABASE_TYPE=$(prompt_choice "Select your database type:" \
        "PostgreSQL" \
        "MongoDB" \
        "MySQL" \
        "SQLite" \
        "DynamoDB (AWS)" \
        "Firestore (Google)" \
        "Redis" \
        "None/Other")
    
    print_success "Database type: $DATABASE_TYPE"
}

##############################################################################
# FILE GENERATION
##############################################################################

generate_env_file() {
    print_header "📝 Generating .env.example"
    
    local env_file=".env.example"
    
    cat > "$env_file" << 'EOF'
# ============================================================================
# DO NOT COMMIT REAL SECRETS - THIS FILE IS FOR EXAMPLES ONLY
# Copy this to .env and fill in real values (which should NOT be in git)
# ============================================================================

# General Configuration
NODE_ENV=development
DEBUG=true

EOF

    # Add stack-specific variables
    case "$DETECTED_STACK" in
        node)
            cat >> "$env_file" << 'EOF'
# Node.js / Next.js
PORT=3000
API_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000

# Database (if using)
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

EOF
            ;;
        python)
            cat >> "$env_file" << 'EOF'
# Python / FastAPI / Django
FASTAPI_PORT=8000
DJANGO_SECRET_KEY=your-secret-key-here
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
SQLALCHEMY_DATABASE_URL=postgresql://user:password@localhost:5432/mydb

EOF
            ;;
        go)
            cat >> "$env_file" << 'EOF'
# Go / Microservice
SERVICE_PORT=8080
SERVICE_NAME=my-service
DATABASE_CONNECTION_STRING=postgresql://user:password@localhost:5432/mydb

EOF
            ;;
        java)
            cat >> "$env_file" << 'EOF'
# Java / Spring Boot
SERVER_PORT=8080
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/mydb
SPRING_DATASOURCE_USERNAME=user
SPRING_DATASOURCE_PASSWORD=password

EOF
            ;;
        dotnet)
            cat >> "$env_file" << 'EOF'
# .NET / C#
ASPNETCORE_ENVIRONMENT=Development
ASPNETCORE_URLS=http://localhost:5000
ConnectionStrings__DefaultConnection=Server=localhost;Database=mydb;User Id=sa;Password=password;

EOF
            ;;
    esac
    
    # Add MCP-related variables if available
    if [[ "$MCP_AVAILABLE" == true ]]; then
        cat >> "$env_file" << 'EOF'
# MCP Server Configuration (if available)
GITHUB_TOKEN=ghp_your_token_here
GITHUB_MCP_ENABLED=true

EOF
    fi
    
    # Add general API/external service variables
    cat >> "$env_file" << 'EOF'
# External Services (if using)
# STRIPE_API_KEY=sk_test_...
# SENDGRID_API_KEY=SG.your_key_here
# AWS_ACCESS_KEY_ID=your_key
# AWS_SECRET_ACCESS_KEY=your_secret

# Copilot Agent Configuration
COPILOT_AGENT_TIMEOUT=30000
COPILOT_MAX_CONTEXT=8000
COPILOT_ENABLE_MCP=true

EOF

    print_success "Generated $env_file"
    print_info "⚠️  IMPORTANT: Add .env to .gitignore and NEVER commit real secrets!"
}

generate_copilot_settings() {
    print_header "⚙️  Generating Copilot Settings"
    
    # Create .copilot/settings.json
    mkdir -p .copilot
    
    local settings_file=".copilot/settings.json"
    
    cat > "$settings_file" << EOF
{
  "project": {
    "name": "$(basename $(pwd))",
    "description": "AI-powered coding with VS Code Copilot",
    "stack": "$DETECTED_STACK",
    "frameworks": [$(printf '"%s",' "${DETECTED_FRAMEWORKS[@]}" | sed 's/,$//')],
    "testFramework": "$DETECTED_TEST_FRAMEWORK",
    "cicdSystem": "$CI_CD_SYSTEM",
    "database": "$DATABASE_TYPE"
  },
  "mcp": {
    "enabled": $([ "$MCP_AVAILABLE" = true ] && echo "true" || echo "false"),
    "servers": {
      "github": false,
      "filesystem": true,
      "cli": true
    }
  },
  "agents": {
    "enabled": true,
    "defaultAgent": "orchestrator",
    "availableAgents": [
      "orchestrator",
      "frontend_expert",
      "backend_architect",
      "devops_lead",
      "qa_specialist"
    ]
  },
  "testing": {
    "framework": "$DETECTED_TEST_FRAMEWORK",
    "minCoverage": 80,
    "autoRun": true,
    "commands": {
      "test": "npm test",
      "testWatch": "npm run test:watch",
      "coverage": "npm run coverage"
    }
  },
  "preProductionGates": {
    "enabled": true,
    "requireTests": true,
    "requireCoverage": true,
    "requireLinting": true,
    "requireTypeCheck": true,
    "requiredCoverage": 80
  },
  "safety": {
    "antiHallucination": true,
    "mandatoryExploration": true,
    "noPIIExposure": true,
    "noSecretsInCode": true
  }
}
EOF

    print_success "Generated $settings_file"
}

generate_stack_specific_rules() {
    print_header "📋 Generating Stack-Specific Instructions"
    
    mkdir -p .copilot/instructions
    
    local rules_file=".copilot/instructions/03_${DETECTED_STACK}_specific.instructions.md"
    
    case "$DETECTED_STACK" in
        node)
            cat > "$rules_file" << 'EOF'
---
name: "Node.js/TypeScript Specific Rules"
description: "Stack-specific best practices for Node.js and TypeScript projects"
applyTo: "*.ts,*.tsx,*.js,*.jsx"
---

# Node.js / TypeScript AI Agent Rules

## Project Structure Conventions

- **Source code**: `src/` directory
- **Tests**: `*.test.ts` or `*.spec.ts` files in same directory
- **Configuration**: Root level (`tsconfig.json`, `.eslintrc`, etc.)
- **Environment**: `.env` files (NEVER commit, use `.env.example`)

## Package Manager Detection

Auto-detect and use:
1. Check for `package-lock.json` → Use `npm`
2. Check for `pnpm-lock.yaml` → Use `pnpm`
3. Check for `yarn.lock` → Use `yarn`
4. Default to `npm`

## Testing Framework Commands

**Jest** (most common):
```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run coverage           # Coverage report
```

**Vitest** (Vite projects):
```bash
npm run test               # Run tests
npm run test:watch        # Watch mode
npm run coverage          # Coverage report
```

**Mocha** (legacy):
```bash
npm test
```

## TypeScript Rules

1. Always enable `strict` mode in `tsconfig.json`
2. Use top-level type exports: `export type MyType = { ... }`
3. Avoid `any` - use proper types or `unknown` + type guards
4. Use exhaustive checks for discriminated unions
5. Leverage type inference when obvious; explicit otherwise

## Code Style

- Use `const` by default, `let` when reassignment needed
- Prefer async/await over Promise chains
- Use arrow functions for simple callbacks
- Comment why, not what (code shows what)
- Use meaningful variable names (no `temp`, `x`, `val`)

## Pre-commit Hooks

Run before suggesting code:
1. Lint: `npm run lint` (ESLint)
2. Type check: `npm run type-check` (TypeScript)
3. Format check: `npm run format:check` (Prettier)
4. Test affected files: `npm test -- [changed files]`

## MCP Integration

When available, use these commands for context:
- `mcp fs:read src/` → Explore project structure
- `mcp fs:grep exports` → Find exports
- `mcp cli:run npm run build` → Validate builds

## Error Handling

Always follow this pattern:
```typescript
try {
  const result = await risky();
} catch (error) {
  if (error instanceof CustomError) {
    // Handle specific case
  }
  throw new Error(`Context: ${message}`, { cause: error });
}
```

## Testing Requirements

Every code change MUST include:
- Unit tests for new functions
- Integration tests for API changes
- Coverage report (min 80%)
- All tests passing before shipping

EOF
            ;;
        python)
            cat > "$rules_file" << 'EOF'
---
name: "Python Specific Rules"
description: "Stack-specific best practices for Python projects"
applyTo: "*.py"
---

# Python AI Agent Rules

## Project Structure Conventions

- **Source code**: `src/` or project root
- **Tests**: `tests/` directory with `test_*.py` pattern
- **Configuration**: `pyproject.toml` or `setup.cfg` (preferred over `setup.py`)
- **Environment**: `.env` files (NEVER commit, use `.env.example`)

## Package Manager Detection

Auto-detect and use:
1. Check for `Poetry` → Use `poetry`
2. Check for `pipenv` → Use `pipenv`
3. Check for `pip` → Use `pip` with virtual env
4. Default to `pip venv`

## Testing Framework Commands

**Pytest** (recommended):
```bash
pytest                      # Run all tests
pytest -v                  # Verbose
pytest --cov              # Coverage report
pytest -k pattern         # Run matching tests
pytest --lf               # Run last failed
```

## Python Style Guide (PEP 8)

1. Line length: 88 characters (Black formatter)
2. Use type hints: `def func(name: str) -> int:`
3. Use `f-strings` for formatting
4. Docstrings for all public functions/classes
5. NEVER use wildcard imports: `from module import *`

## Code Style

- Use `snake_case` for functions and variables
- Use `PascalCase` for classes
- Use `SCREAMING_SNAKE_CASE` for constants
- Prefer List comprehensions over loops
- Use context managers (`with` statements) for resources

## Pre-commit Hooks

Run before suggesting code:
1. Format: `black .` (code formatter)
2. Lint: `pylint src/` or `flake8 src/`
3. Type check: `mypy src/` (if enabled)
4. Test: `pytest` (all tests must pass)

## MCP Integration

When available, use these commands for context:
- `mcp fs:read src/` → Explore project structure
- `mcp fs:grep def ` → Find function definitions
- `mcp cli:run pytest -v` → Run tests

## Error Handling

Always follow this pattern:
```python
try:
    result = risky_operation()
except SpecificError as e:
    logger.error(f"Specific context: {e}")
    raise
except Exception as e:
    logger.error(f"Unexpected error: {e}")
    raise RuntimeError(f"Context about what failed") from e
```

## Testing Requirements

Every code change MUST include:
- Unit tests in `tests/test_*.py`
- Docstring with examples in doctest format
- Coverage report (min 80%)
- All tests passing: `pytest --cov`

EOF
            ;;
        go)
            cat > "$rules_file" << 'EOF'
---
name: "Go Specific Rules"
description: "Stack-specific best practices for Go projects"
applyTo: "*.go"
---

# Go AI Agent Rules

## Project Structure Conventions

- **Source code**: `cmd/` for binaries, `pkg/` for libraries
- **Tests**: `*_test.go` files in same directory as code
- **Modules**: `go.mod` defines module path and dependencies
- **Environment**: `.env` or environment variables (use `godotenv` if needed)

## Go Testing

**Go Test** (built-in):
```bash
go test ./...           # Run all tests
go test -v ./...        # Verbose
go test -cover ./...    # Coverage report
go test -race ./...     # Race detector
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out
```

## Code Style (Effective Go)

1. Use `gofmt` for formatting (enforced by Go)
2. Use `CamelCase` for exported symbols (capital first letter)
3. Use `camelCase` for unexported symbols (lowercase first letter)
4. Error handling: Always check errors immediately after calls
5. Use interfaces for abstraction

## Error Handling Pattern

```go
if err != nil {
    return fmt.Errorf("context about what failed: %w", err)
}
```

**IMPORTANT**: Wrap errors with `%w` verb for error chain inspection.

## Pre-commit Hooks

Run before suggesting code:
1. Format: `gofmt -s -w .` (built-in)
2. Lint: `golangci-lint run ./...` (recommended)
3. Vet: `go vet ./...` (catches common mistakes)
4. Test: `go test -race -cover ./...`

## MCP Integration

When available, use these commands for context:
- `mcp fs:read pkg/` → Explore module structure
- `mcp fs:grep func ` → Find function definitions
- `mcp cli:run go test ./...` → Run tests

## Concurrency

When using goroutines:
1. Always use channels or `sync.WaitGroup` for coordination
2. Use `context.Context` for cancellation
3. Test with `-race` flag to detect race conditions
4. Document goroutine lifecycle clearly

## Testing Requirements

Every code change MUST include:
- Unit tests in `*_test.go` files
- Table-driven tests for multiple cases
- Coverage report (min 80%)
- Race detector passes: `go test -race ./...`

EOF
            ;;
        java)
            cat > "$rules_file" << 'EOF'
---
name: "Java Specific Rules"
description: "Stack-specific best practices for Java projects"
applyTo: "*.java"
---

# Java AI Agent Rules

## Project Structure Conventions

- **Maven**: `src/main/java/` and `src/test/java/`
- **Gradle**: Same structure with `build.gradle`
- **Package naming**: `com.company.project.module`
- **Tests**: Mirror source structure in test directory
- **Resources**: `src/main/resources/` and `src/test/resources/`

## Build System

**Maven** (if `pom.xml` exists):
```bash
mvn clean compile         # Compile
mvn test                  # Run tests
mvn clean package        # Build package
mvn clean install        # Install locally
```

**Gradle** (if `build.gradle` exists):
```bash
./gradlew clean build    # Build
./gradlew test           # Run tests
./gradlew build -x test  # Build without tests
```

## Java Code Style

1. Follow Google Java Style Guide
2. Use `PascalCase` for classes
3. Use `camelCase` for methods and variables
4. Use `SCREAMING_SNAKE_CASE` for constants
5. Maximum 100 characters per line

## Testing Framework

**JUnit 4/5** (common):
```java
@Test
public void shouldDoSomething() {
    // Arrange
    String input = "test";
    
    // Act
    String result = processInput(input);
    
    // Assert
    assertEquals("expected", result);
}
```

Test command: `mvn test` or `./gradlew test`

## Pre-commit Hooks

Run before suggesting code:
1. Compile: `mvn clean compile` or `./gradlew build`
2. Test: `mvn test` or `./gradlew test`
3. Coverage: `mvn jacoco:report`
4. Lint: SonarQube analysis (if configured)

## Error Handling

```java
try {
    result = riskyOperation();
} catch (SpecificException e) {
    log.error("Context about error", e);
    throw new RuntimeException("Human-friendly message", e);
}
```

## Testing Requirements

Every code change MUST include:
- Unit tests mirroring class structure
- Test coverage (min 80%)
- Integration tests for complex logic
- All tests passing: `mvn test`

EOF
            ;;
        dotnet)
            cat > "$rules_file" << 'EOF'
---
name: ".NET/C# Specific Rules"
description: "Stack-specific best practices for .NET projects"
applyTo: "*.cs"
---

# .NET / C# AI Agent Rules

## Project Structure Conventions

- **Source code**: Project folders in `src/`
- **Tests**: Separate `*.Tests` project per module
- **Solution file**: `.sln` file at root
- **Project files**: Use SDK-style `.csproj`
- **NuGet packages**: Listed in `.csproj`

## Build & Test Commands

```bash
dotnet build               # Build solution
dotnet test                # Run all tests
dotnet test --collect:"XPlat Code Coverage"  # With coverage
dotnet run                 # Run application
dotnet publish -c Release  # Publish release build
```

## C# Code Style

1. Follow Microsoft C# Coding Conventions
2. Use `PascalCase` for classes, methods, properties
3. Use `camelCase` for local variables, parameters
4. Use `SCREAMING_SNAKE_CASE` for constants
5. Prefer properties over public fields: `public string Name { get; set; }`

## Testing Framework

**NUnit** (common):
```csharp
[TestFixture]
public class MyServiceTests
{
    [Test]
    public void ShouldDoSomething()
    {
        // Arrange
        var service = new MyService();
        
        // Act
        var result = service.DoSomething();
        
        // Assert
        Assert.That(result, Is.EqualTo("expected"));
    }
}
```

**xUnit** (modern alternative):
```csharp
public class MyServiceTests
{
    [Fact]
    public void ShouldDoSomething()
    {
        var service = new MyService();
        var result = service.DoSomething();
        Assert.Equal("expected", result);
    }
}
```

## Pre-commit Hooks

Run before suggesting code:
1. Build: `dotnet build`
2. Test: `dotnet test`
3. Lint: StyleCop (if configured)
4. Format: `dotnet format` (if configured)

## Error Handling

```csharp
try
{
    result = await RiskyOperation();
}
catch (OperationFailedException ex) when (ex.Code == ErrorCode.NotFound)
{
    _logger.LogError(ex, "Resource not found");
    throw new InvalidOperationException("User-friendly message", ex);
}
```

## Testing Requirements

Every code change MUST include:
- Unit tests in corresponding `*.Tests` project
- Test coverage (min 80%)
- All tests passing: `dotnet test`
- No compiler warnings: `dotnet build -warnAsError`

EOF
            ;;
    esac
    
    print_success "Generated $rules_file"
}

generate_instructions_summary() {
    print_header "📚 Generating Instructions Summary"
    
    mkdir -p .copilot/instructions
    
    local summary_file=".copilot/instructions/_STACK_SUMMARY.md"
    
    cat > "$summary_file" << EOF
# Stack Configuration Summary

**Generated at**: $(date)

## Detected Configuration

- **Primary Stack**: $DETECTED_STACK
- **Frameworks**: ${DETECTED_FRAMEWORKS[*]}
- **Test Framework**: $DETECTED_TEST_FRAMEWORK
- **CI/CD System**: $CI_CD_SYSTEM
- **Database**: $DATABASE_TYPE
- **MCP Available**: $MCP_AVAILABLE

## Quick Start

### 1. Review Settings
- Open \`.copilot/settings.json\` to see detected configuration
- Open \`.env.example\` and create \`.env\` with your actual values
- **DO NOT COMMIT .env - add to .gitignore**

### 2. Test Your Setup
Run the appropriate test command for your framework:
- Node.js: \`npm test\`
- Python: \`pytest\`
- Go: \`go test ./...\`
- Java: \`mvn test\`
- .NET: \`dotnet test\`

### 3. Start Using Agents
1. Open VS Code
2. Open Copilot Chat
3. Pick an agent: Orchestrator, Frontend Expert, Backend Architect, DevOps Lead, QA Specialist
4. Ask for a feature

Example:
\`\`\`
"Backend Architect, create a new API endpoint for user authentication"
\`\`\`

## Instruction Files

Your stack-specific instruction files:

### Required (Always Used)
- \`.copilot/instructions/00_global_anti_hallucination.instructions.md\` - Core rules
- \`.copilot/instructions/01_vscode_copilot_optimization.instructions.md\` - Tool mastery
- \`.copilot/instructions/02_cli_autonomous_orchestration.instructions.md\` - Execution flow

### Stack-Specific
- \`.copilot/instructions/03_${DETECTED_STACK}_specific.instructions.md\` - Your stack's rules

### Skills
- \`.copilot/skills/pre_production_gates/SKILL.md\` - Auto-validation

## Pre-Production Gate Requirements

ALL code changes MUST:
✅ Pass syntax/type checking  
✅ Pass linting  
✅ Pass tests (80%+ coverage)  
✅ Include test coverage proof  
✅ Generate PASS/FAIL matrix  

## MCP Integration

$([ "$MCP_AVAILABLE" = true ] && echo "✅ MCP Enabled - Agents can use super-fast context gathering" || echo "❌ MCP Disabled - Agents will use standard tools (slightly slower)")

## Environment Setup

1. Copy \`.env.example\` to \`.env\`
2. Fill in real values:
   - Database credentials
   - API keys
   - Service endpoints
3. **NEVER commit .env to git**
4. Add to .gitignore: \`echo ".env" >> .gitignore\`

## Next Steps

1. ✅ Stack detected and configured
2. ⭐ Use the agents to start building
3. 🧪 Run tests with \`npm test\` (or your framework's test command)
4. 🚀 Deploy when PASS/FAIL matrix says ✅

## Troubleshooting

**Tests not running?**
- Check \`package.json\` or \`.csproj\` has test dependencies
- Run: ${DETECTED_TEST_FRAMEWORK% *} --version

**Can't find .env values?**
- Check \`.env\` file exists (copy from \`.env.example\`)
- Ensure .env is in .gitignore

**Agents not responding?**
- Make sure .copilot/settings.json exists
- Verify VS Code Copilot extension is installed
- Try reloading VS Code

## Support

- 📖 Read \`docs/HOW_TO_USE_FOR_HUMANS.md\`
- 📚 Check \`.copilot/BEGINNER_GLOSSARY.md\`
- 🔧 Review \`.copilot/instructions/\` files

---

**Your project is ready to use AI agents! 🚀**

EOF

    print_success "Generated $summary_file"
}

##############################################################################
# MAIN EXECUTION
##############################################################################

main() {
    clear
    
    echo -e "${BLUE}"
    cat << 'EOF'
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🤖  VS Code Copilot AI Agent Template - Setup Wizard 🤖    ║
║                                                                ║
║   This script will configure your project for automated       ║
║   AI-powered code generation with zero hallucinations.        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}\n"
    
    print_info "Starting interactive setup..."
    sleep 1
    
    # Run detection and configuration
    detect_tech_stack
    detect_mcp_availability
    configure_testing
    configure_ci_cd
    configure_database
    
    # Generate files
    generate_env_file
    generate_copilot_settings
    generate_stack_specific_rules
    generate_instructions_summary
    
    # Final summary
    print_header "🎉 Setup Complete!"
    
    echo -e "${GREEN}Your project is now configured with AI agents!${NC}\n"
    
    echo "Files created:"
    echo -e "  ${GREEN}✅${NC} .env.example"
    echo -e "  ${GREEN}✅${NC} .copilot/settings.json"
    echo -e "  ${GREEN}✅${NC} .copilot/instructions/03_${DETECTED_STACK}_specific.instructions.md"
    echo -e "  ${GREEN}✅${NC} .copilot/instructions/_STACK_SUMMARY.md"
    echo ""
    
    echo "Next steps:"
    echo "  1. Copy .env.example to .env and fill in real values"
    echo "  2. Add .env to .gitignore: echo '.env' >> .gitignore"
    echo "  3. Run tests: ${DETECTED_TEST_FRAMEWORK% *} test (or your framework's test command)"
    echo "  4. Open VS Code and start using agents in Copilot Chat"
    echo ""
    
    print_success "Setup wizard completed successfully!"
    print_info "Read .copilot/instructions/_STACK_SUMMARY.md for detailed configuration info"
    
    echo -e "\n${CYAN}Happy coding! 🚀${NC}\n"
}

# Run main function
main "$@"
