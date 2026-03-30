import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolsDir, '..');
const configPath = fs.existsSync(path.join(repoRoot, 'resources.local.json'))
  ? path.join(repoRoot, 'resources.local.json')
  : path.join(repoRoot, 'resources.local.example.json');

const placeholderPatterns = [/REPLACE_WITH_/, /^\s*$/, /^YOUR_ACTUAL_/];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPlaceholder(value) {
  if (typeof value !== 'string') return false;
  return placeholderPatterns.some((pattern) => pattern.test(value));
}

function addIssue(issues, severity, scope, message) {
  issues.push({ severity, scope, message });
}

function validateChecklist(issues, checklist) {
  const workspace = checklist.workspace ?? {};
  const deployment = checklist.deployment ?? {};
  const scripts = checklist.scripts ?? {};

  const requiredWorkspace = [
    'teamRegistrySpreadsheetId',
    'dashboardSpreadsheetId',
    'tasksSpreadsheetId',
    'projectsSpreadsheetId',
    'kbSpreadsheetId',
    'logSpreadsheetId',
    'teamDriveFolderId',
    'projectsDriveFolderId',
    'teamChatSpaceId',
    'approvalsChatSpaceId',
  ];

  for (const key of requiredWorkspace) {
    if (!workspace[key]) addIssue(issues, 'error', 'resources', `Missing workspace value: ${key}`);
  }

  if (!deployment.libraryScriptId) addIssue(issues, 'warn', 'deployment', 'Library Script ID is not set yet.');
  if (!deployment.module03ApprovalCallbackUrl) addIssue(issues, 'warn', 'deployment', 'Module 03 approval callback URL is not set yet.');
  if (!deployment.module09DeploymentId) addIssue(issues, 'warn', 'deployment', 'Module 09 deployment ID is not set yet.');

  for (const [moduleName, scriptId] of Object.entries(scripts)) {
    if (!scriptId) addIssue(issues, 'warn', 'scripts', `Script ID missing in checklist for ${moduleName}.`);
  }
}

function validateClaspFiles(issues, checklist) {
  const expectedScripts = checklist.scripts ?? {};
  const claspFiles = [
    ['lib', path.join(repoRoot, 'lib', '.clasp.json')],
    ['01-dashboard', path.join(repoRoot, 'modules', '01-dashboard', '.clasp.json')],
    ['02-calendar', path.join(repoRoot, 'modules', '02-calendar', '.clasp.json')],
    ['03-meeting-notes', path.join(repoRoot, 'modules', '03-meeting-notes', '.clasp.json')],
    ['04-tasks', path.join(repoRoot, 'modules', '04-tasks', '.clasp.json')],
    ['05-projects', path.join(repoRoot, 'modules', '05-projects', '.clasp.json')],
    ['06-digest', path.join(repoRoot, 'modules', '06-digest', '.clasp.json')],
    ['07-knowledge-base', path.join(repoRoot, 'modules', '07-knowledge-base', '.clasp.json')],
    ['08-reporting', path.join(repoRoot, 'modules', '08-reporting', '.clasp.json')],
    ['09-admin-chat-app', path.join(repoRoot, 'modules', '09-admin-chat-app', '.clasp.json')],
  ];

  for (const [moduleName, filePath] of claspFiles) {
    const json = readJson(filePath);
    if (isPlaceholder(json.scriptId)) {
      addIssue(issues, 'error', moduleName, `${path.relative(repoRoot, filePath)} still contains a placeholder scriptId.`);
      continue;
    }
    if (expectedScripts[moduleName] && expectedScripts[moduleName] !== json.scriptId) {
      addIssue(issues, 'warn', moduleName, `${moduleName} scriptId does not match resources.local.json.`);
    }
  }
}

function validateLibraryReferences(issues, checklist) {
  const moduleDirs = [
    '01-dashboard',
    '02-calendar',
    '03-meeting-notes',
    '04-tasks',
    '05-projects',
    '06-digest',
    '07-knowledge-base',
    '08-reporting',
    '09-admin-chat-app',
  ];

  for (const moduleName of moduleDirs) {
    const manifestPath = path.join(repoRoot, 'modules', moduleName, 'appsscript.json');
    const manifest = readJson(manifestPath);
    const library = manifest.dependencies?.libraries?.[0];
    if (!library) {
      addIssue(issues, 'error', moduleName, `${moduleName} is missing its shared library dependency.`);
      continue;
    }
    if (isPlaceholder(library.scriptId)) {
      addIssue(issues, 'error', moduleName, `${moduleName} manifest still contains a placeholder library scriptId.`);
    } else if (checklist.deployment?.libraryScriptId && library.scriptId !== checklist.deployment.libraryScriptId) {
      addIssue(issues, 'warn', moduleName, `${moduleName} manifest library scriptId does not match resources.local.json.`);
    }
  }
}

function printResults(issues) {
  const grouped = {
    error: issues.filter((issue) => issue.severity === 'error'),
    warn: issues.filter((issue) => issue.severity === 'warn'),
  };

  console.log(`Using checklist file: ${path.relative(process.cwd(), configPath)}`);
  console.log('');

  if (grouped.error.length === 0 && grouped.warn.length === 0) {
    console.log('Preflight passed. No issues detected.');
    return;
  }

  for (const severity of ['error', 'warn']) {
    if (grouped[severity].length === 0) continue;
    console.log(`${severity.toUpperCase()}S (${grouped[severity].length})`);
    for (const issue of grouped[severity]) {
      console.log(`- [${issue.scope}] ${issue.message}`);
    }
    console.log('');
  }

  if (grouped.error.length > 0) {
    console.log('Next action: resolve the errors before running any deployment step.');
    process.exitCode = 1;
    return;
  }

  console.log('Next action: warnings remain, but you can continue once you accept or resolve them.');
}

const checklist = readJson(configPath);
const issues = [];

validateChecklist(issues, checklist);
validateClaspFiles(issues, checklist);
validateLibraryReferences(issues, checklist);
printResults(issues);