#!/usr/bin/env node
/**
 * GWAS Module Creation Script
 *
 * Creates remote Apps Script projects for all 9 GWAS modules using clasp,
 * then wires the resulting script IDs into each module's .clasp.json.
 *
 * Bound modules (sheets type) are attached to the correct spreadsheet
 * via --parentId.  Standalone modules create independent scripts.
 *
 * Run ONCE before the first `clasp push` for any module.
 * Requires: clasp authenticated (`clasp show-authorized-user --json` works)
 *
 * Usage:
 *   node gwas/tools/create-module-scripts.mjs
 *   node gwas/tools/create-module-scripts.mjs 04-tasks   # single module
 */

import { execSync } from 'child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const gwasRoot = resolve(__dir, '..');
const scratchBase = resolve(gwasRoot, '.scratch', 'module-create');

// Known spreadsheet IDs from resources
const SHEET_IDS = {
  dashboard: '1UoY81SPitbN7y2yYuP5g5cy6bJS1xltfU2PAXMiTwgI',
  tasks: '12Y7EoiSgTa-G8MUHIWwvTf2ZnBGI7sjaYRcVIdsnAL4',
  projects: '1e8fwRlrh8VaHvZruuzArB5HY77vG_uss8u6M4mpTJT8',
  kb: '1wEceEo7zaEzf7kvKUuUlGLHtmXfeZKOVBacMy5jKE40',
};

const MODULES = [
  {
    dir: '01-dashboard',
    title: 'GWAS Dashboard',
    type: 'sheets',
    parentId: SHEET_IDS.dashboard,
    placeholder: 'REPLACE_WITH_DASHBOARD_SCRIPT_ID',
  },
  {
    dir: '02-calendar',
    title: 'GWAS Calendar Automation',
    type: 'standalone',
    placeholder: 'REPLACE_WITH_CALENDAR_SCRIPT_ID',
  },
  {
    dir: '03-meeting-notes',
    title: 'GWAS Meeting Notes',
    type: 'standalone',
    placeholder: 'REPLACE_WITH_MEETING_NOTES_SCRIPT_ID',
  },
  {
    dir: '04-tasks',
    title: 'GWAS Task Tracker',
    type: 'sheets',
    parentId: SHEET_IDS.tasks,
    placeholder: 'REPLACE_WITH_TASKS_SCRIPT_ID',
  },
  {
    dir: '05-projects',
    title: 'GWAS Projects',
    type: 'sheets',
    parentId: SHEET_IDS.projects,
    placeholder: 'REPLACE_WITH_PROJECTS_SCRIPT_ID',
  },
  {
    dir: '06-digest',
    title: 'GWAS Daily Digest',
    type: 'standalone',
    placeholder: 'REPLACE_WITH_DIGEST_SCRIPT_ID',
  },
  {
    dir: '07-knowledge-base',
    title: 'GWAS Knowledge Base',
    type: 'sheets',
    parentId: SHEET_IDS.kb,
    placeholder: 'REPLACE_WITH_KB_SCRIPT_ID',
  },
  {
    dir: '08-reporting',
    title: 'GWAS Reporting',
    type: 'standalone',
    placeholder: 'REPLACE_WITH_REPORTING_SCRIPT_ID',
  },
  {
    dir: '09-admin-chat-app',
    title: 'GWAS Admin Chat App',
    type: 'standalone',
    placeholder: 'REPLACE_WITH_ADMIN_CHAT_APP_SCRIPT_ID',
  },
];

// Optional: single module filter via CLI arg
const filterDir = process.argv[2];
const targets = filterDir
  ? MODULES.filter((m) => m.dir === filterDir || m.dir.endsWith(`-${filterDir}`))
  : MODULES;

if (targets.length === 0) {
  console.error(`No module matching "${filterDir}". Valid dirs: ${MODULES.map((m) => m.dir).join(', ')}`);
  process.exit(1);
}

let ok = 0;
let skip = 0;
let fail = 0;

console.log(`\nGWAS Module Creation — ${targets.length} module(s)\n${'─'.repeat(55)}`);
mkdirSync(scratchBase, { recursive: true });

for (const mod of targets) {
  const claspJsonPath = resolve(gwasRoot, 'modules', mod.dir, '.clasp.json');
  const existing = JSON.parse(readFileSync(claspJsonPath, 'utf8'));

  // Skip if already has a real ID
  if (existing.scriptId && !existing.scriptId.startsWith('REPLACE_WITH_')) {
    console.log(`⏭  ${mod.dir} — already has scriptId ${existing.scriptId.slice(0, 20)}…`);
    skip++;
    continue;
  }

  const scratchDir = resolve(scratchBase, mod.dir);
  mkdirSync(scratchDir, { recursive: true });

  console.log(`\n▶  Creating ${mod.title}...`);

  try {
    // Build the clasp create-script command
    const args = ['clasp', 'create-script', '--type', mod.type, '--title', `"${mod.title}"`];
    if (mod.parentId) {
      args.push('--parentId', mod.parentId);
    }
    const cmd = args.join(' ');

    execSync(cmd, { cwd: scratchDir, stdio: 'inherit', shell: true });

    // Read the script ID from the newly created .clasp.json in scratch dir
    const scratchConfig = JSON.parse(readFileSync(resolve(scratchDir, '.clasp.json'), 'utf8'));
    const scriptId = scratchConfig.scriptId;

    if (!scriptId) {
      throw new Error('clasp did not write a scriptId into .clasp.json');
    }

    // Update the module's .clasp.json with the real ID
    existing.scriptId = scriptId;
    writeFileSync(claspJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');

    console.log(`✅  ${mod.dir} → ${scriptId}`);
    ok++;

    // Clean up scratch dir
    rmSync(scratchDir, { recursive: true, force: true });
  } catch (err) {
    console.error(`❌  ${mod.dir} — FAILED: ${err.message}`);
    fail++;
  }
}

// Clean up scratch base if empty
try {
  rmSync(scratchBase, { recursive: true, force: true });
} catch {}

console.log(`\n${'─'.repeat(55)}`);
console.log(`Module creation: ${ok} created, ${skip} already set, ${fail} failed`);

if (fail > 0) {
  console.error('\nFix failures above, then re-run this script or set scriptIds manually.');
  process.exit(1);
}

console.log('\nNext step: node gwas/tools/build.mjs  →  clasp push from each module dir');
