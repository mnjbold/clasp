/**
 * Runs the one-time setup function in each GWAS module via clasp run.
 *
 * Prerequisites:
 *   1. All 9 modules have been pushed (done).
 *   2. Script Properties set on the lib (done via setAllProperties).
 *   3. Apps Script Execution API enabled per module (may require first
 *      manual run in each editor to grant consent).
 *
 * Run: node gwas/tools/run-setup.mjs
 */
import { spawnSync } from 'child_process';
import { chdir } from 'process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const gwasRoot = join(__dir, '..');

const SETUP_MAP = {
  'lib':                 'setupLibrary',
  'modules/01-dashboard': 'setupDashboard',
  'modules/02-calendar':  'setupCalendarAutomation',
  'modules/03-meeting-notes': 'setupMeetingNotes',
  'modules/04-tasks':     'setupTaskTracker',
  'modules/05-projects':  'setupProjectsSheet',
  'modules/06-digest':    'setupDigest',
  'modules/07-knowledge-base': 'setupKnowledgeBase',
  'modules/08-reporting': 'setupReporting',
};

let ok = 0;
let fail = 0;
const manual = [];

for (const [relPath, fn] of Object.entries(SETUP_MAP)) {
  const dir = join(gwasRoot, relPath);
  chdir(dir);

  console.log(`\nRunning ${fn} in ${relPath}...`);
  const result = spawnSync('clasp', ['run', fn], {
    encoding: 'utf8',
    shell: true,
  });

  const output = (result.stdout + result.stderr).trim();

  if (result.status === 0 && !output.includes('Error')) {
    console.log(`  ✅  Done`);
    if (output) console.log(`  ${output}`);
    ok++;
  } else {
    console.log(`  ⚠  Could not run automatically: ${output.split('\n')[0]}`);
    console.log(`     → Open in browser and run ${fn}() manually`);
    manual.push({ relPath, fn });
    fail++;
  }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Setup: ${ok} ran automatically, ${fail} need manual run`);

if (manual.length > 0) {
  console.log('\nManual steps required — open each URL and run the function:');
  for (const { relPath, fn } of manual) {
    const claspJson = JSON.parse(readFileSync(join(gwasRoot, relPath, '.clasp.json'), 'utf8'));
    const scriptId = claspJson.scriptId;
    console.log(`  ${fn}()`);
    console.log(`  → https://script.google.com/d/${scriptId}/edit`);
    console.log();
  }
}
