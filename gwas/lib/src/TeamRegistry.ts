/**
 * Team member registry backed by a Google Sheet.
 *
 * The registry sheet lives in the spreadsheet identified by
 * TEAM_REGISTRY_SPREADSHEET_ID. It has a tab named "Team" with columns:
 *   A: Email | B: Name | C: Chat User ID | D: Chat DM Space ID | E: Role | F: Timezone
 *
 * Results are cached for 5 minutes to avoid repeated Sheets reads.
 */

const TEAM_SHEET_NAME = 'Team';
const TEAM_CACHE_KEY = 'team_registry_v1';
const TEAM_CACHE_TTL = 300; // 5 minutes

/**
 * Returns all active team members from the registry sheet.
 */
function getTeamMembers(): TeamMember[] {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(TEAM_CACHE_KEY);
  if (cached) return JSON.parse(cached) as TeamMember[];

  const ssId = getConfig('TEAM_REGISTRY_SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(TEAM_SHEET_NAME);
  if (!sheet) throw new Error(`[TeamRegistry] Sheet "${TEAM_SHEET_NAME}" not found in registry spreadsheet.`);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // header only

  const data = sheet.getRange(2, 1, lastRow - 1, 6).getValues() as string[][];

  const members: TeamMember[] = data
    .filter(row => row[0] && row[0].toString().includes('@')) // skip blank rows
    .map(row => ({
      email: row[0].toString().trim(),
      name: row[1].toString().trim(),
      chatUserId: row[2].toString().trim(),
      chatDmSpaceId: row[3].toString().trim(),
      role: (row[4].toString().trim() || 'member') as TeamMember['role'],
      timezone: row[5].toString().trim() || 'America/New_York',
    }));

  cache.put(TEAM_CACHE_KEY, JSON.stringify(members), TEAM_CACHE_TTL);
  return members;
}

/**
 * Returns a single team member by email, or null if not found.
 */
function getMemberByEmail(email: string): TeamMember | null {
  const members = getTeamMembers();
  return members.find(m => m.email.toLowerCase() === email.toLowerCase()) ?? null;
}

/**
 * Returns all team leads.
 */
function getTeamLeads(): TeamMember[] {
  return getTeamMembers().filter(m => m.role === 'lead' || m.role === 'admin');
}

/**
 * Returns all team member email addresses.
 */
function getTeamEmails(): string[] {
  return getTeamMembers().map(m => m.email);
}

/**
 * Returns all team member names (for Gemini prompts).
 */
function getTeamMemberNames(): string[] {
  return getTeamMembers().map(m => m.name);
}

/**
 * Invalidates the team registry cache. Call after editing the Team sheet.
 */
function invalidateTeamCache(): void {
  CacheService.getScriptCache().remove(TEAM_CACHE_KEY);
}

/**
 * Creates the Team registry sheet with headers if it doesn't exist.
 * Run once during initial setup.
 */
function setupTeamRegistrySheet(): void {
  const ssId = getConfig('TEAM_REGISTRY_SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);

  let sheet = ss.getSheetByName(TEAM_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(TEAM_SHEET_NAME);
  }

  // Write headers if the sheet is empty.
  if (sheet.getLastRow() === 0) {
    const headers = ['Email', 'Name', 'Chat User ID', 'Chat DM Space ID', 'Role', 'Timezone'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#4285F4')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    // Add a sample row to guide setup.
    sheet.getRange(2, 1, 1, 6).setValues([[
      'user@company.com',
      'Full Name',
      'users/CHAT_USER_ID',
      'spaces/CHAT_DM_SPACE_ID',
      'member',
      'America/New_York',
    ]]);
    sheet.getRange(2, 1, 1, 6).setFontColor('#999999').setFontStyle('italic');
  }

  Logger.log('[TeamRegistry] Team sheet ready. Fill in your team members and remove the sample row.');
}
