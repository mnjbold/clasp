/**
 * Sets all required Script Properties on the GWAS Shared Library via
 * the Apps Script REST API, using the OAuth token stored by clasp.
 *
 * Run:  node gwas/tools/set-properties.mjs
 */
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const SCRIPT_ID = '1lqCse5yiXgmC3T05YfYCaHgkpRoo5zLepeTRrMwlek2L7ILgrMaLNBP0';
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  console.error('Missing GEMINI_API_KEY environment variable. Set it in your shell before running this script.');
  process.exit(1);
}

// All non-secret values are sourced from the GWAS resource inventory.
const PROPERTIES = {
  GEMINI_API_KEY:                 geminiApiKey,
  TEAM_REGISTRY_SPREADSHEET_ID:   '1CTOaK7Kt2s6nF4ljVNejDC_LKkNjCqZQum2zQCTAU5U',
  DASHBOARD_SPREADSHEET_ID:       '1UoY81SPitbN7y2yYuP5g5cy6bJS1xltfU2PAXMiTwgI',
  TASKS_SPREADSHEET_ID:           '12Y7EoiSgTa-G8MUHIWwvTf2ZnBGI7sjaYRcVIdsnAL4',
  PROJECTS_SPREADSHEET_ID:        '1e8fwRlrh8VaHvZruuzArB5HY77vG_uss8u6M4mpTJT8',
  KB_SPREADSHEET_ID:              '1wEceEo7zaEzf7kvKUuUlGLHtmXfeZKOVBacMy5jKE40',
  LOG_SPREADSHEET_ID:             '1zJaUAn5ahpr4-lMfBUrzNM4jlOtdD8uzrDK7NHQYbZQ',
  TEAM_CHAT_SPACE_ID:             'AAQAN9ONUtA',
  APPROVALS_CHAT_SPACE_ID:        'AAQAsgmMlkc',
  TEAM_DRIVE_FOLDER_ID:           '1SXJKH0RZF-wgKCKgh4yg7rluZP-5gQLz',
  PROJECTS_DRIVE_FOLDER_ID:       '19DQUYItP1LHSIxe6e3JmQNxfgB60DkPS',
};

// Load access_token from clasp's credential store.
const clasprc = JSON.parse(readFileSync(join(homedir(), '.clasprc.json'), 'utf8'));
const token = clasprc?.tokens?.default?.access_token;
if (!token) {
  console.error('No access_token found in ~/.clasprc.json. Run: clasp login');
  process.exit(1);
}

const url = `https://script.googleapis.com/v1/scripts/${SCRIPT_ID}/properties`;

// The Apps Script API doesn't have a direct "set properties" endpoint.
// We use the process.properties endpoint through the execution API.
// Instead we use the Google Apps Script API — updateContent is not right.
// The correct approach: use the script.run endpoint to call setConfig() for each key,
// OR use the Properties API via the scripts.properties.replace method.
// Actually the AppScript REST API v1 has: scripts/{scriptId}/properties
// but only through advanced service. The actual approach is to call the function.

// Use the Apps Script Execution API to run a bulk-set function.
const execUrl = `https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`;

// We'll call setAllProperties which we'll infer should be available, or we call
// setConfig per key. Since the library exposes setConfig() publicly, we call it per key.
let ok = 0;
let fail = 0;

for (const [key, value] of Object.entries(PROPERTIES)) {
  const body = JSON.stringify({
    function: 'setConfig',
    parameters: [key, value],
    devMode: true,
  });

  try {
    const res = await fetch(execUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const msg = data.error?.message ?? data.error?.status ?? JSON.stringify(data.error);
      console.error(`❌  ${key} — ${msg}`);
      fail++;
    } else {
      console.log(`✅  ${key}`);
      ok++;
    }
  } catch (err) {
    console.error(`❌  ${key} — ${err.message}`);
    fail++;
  }
}

console.log(`\nScript Properties: ${ok} set, ${fail} failed`);
if (fail > 0) {
  console.log('\nIf you see PERMISSION_DENIED errors, the Apps Script Execution API');
  console.log('must be enabled in Google Cloud Console for the library project,');
  console.log('and you must run: clasp open (to trigger OAuth consent for execution scope).');
}
