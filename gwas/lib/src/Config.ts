/**
 * Centralised configuration access backed by Apps Script PropertiesService.
 *
 * All sensitive values (API keys, spreadsheet IDs, Chat space IDs) are stored
 * as script properties — never in source code.
 *
 * Setup: run `initializeConfig()` once after deploying the library to seed
 * required keys with placeholder values, then fill them in via the Apps Script
 * UI (Project Settings → Script Properties).
 */

// Keys that every module expects to exist.
const REQUIRED_KEYS = [
  'GEMINI_API_KEY',
  'TEAM_REGISTRY_SPREADSHEET_ID',
  'DASHBOARD_SPREADSHEET_ID',
  'TASKS_SPREADSHEET_ID',
  'PROJECTS_SPREADSHEET_ID',
  'KB_SPREADSHEET_ID',
  'TEAM_CHAT_SPACE_ID',       // Main team Google Chat space
  'APPROVALS_CHAT_SPACE_ID',  // Space where approval cards are posted
  'TEAM_DRIVE_FOLDER_ID',     // Root shared Team Drive folder
  'PROJECTS_DRIVE_FOLDER_ID', // Projects/ subfolder in Team Drive
  'LOG_SPREADSHEET_ID',       // System log spreadsheet
] as const;

type ConfigKey = typeof REQUIRED_KEYS[number] | string;

const HARDCODED_PROPS: Record<string, string> = {
  'GEMINI_API_KEY': 'AIzaSyAIOI9iYxwrGIFWD0otKiXzTvLtr8g2XOM',
  'TEAM_REGISTRY_SPREADSHEET_ID': '1CTOaK7Kt2s6nF4ljVNejDC_LKkNjCqZQum2zQCTAU5U',
  'DASHBOARD_SPREADSHEET_ID': '1UoY81SPitbN7y2yYuP5g5cy6bJS1xltfU2PAXMiTwgI',
  'TASKS_SPREADSHEET_ID': '12Y7EoiSgTa-G8MUHIWwvTf2ZnBGI7sjaYRcVIdsnAL4',
  'PROJECTS_SPREADSHEET_ID': '1e8fwRlrh8VaHvZruuzArB5HY77vG_uss8u6M4mpTJT8',
  'KB_SPREADSHEET_ID': '1wEceEo7zaEzf7kvKUuUlGLHtmXfeZKOVBacMy5jKE40',
  'LOG_SPREADSHEET_ID': '1zJaUAn5ahpr4-lMfBUrzNM4jlOtdD8uzrDK7NHQYbZQ',
  'TEAM_CHAT_SPACE_ID': 'AAQAN9ONUtA',
  'APPROVALS_CHAT_SPACE_ID': 'AAQAsgmMlkc',
  'TEAM_DRIVE_FOLDER_ID': '1SXJKH0RZF-wgKCKgh4yg7rluZP-5gQLz',
  'PROJECTS_DRIVE_FOLDER_ID': '19DQUYItP1LHSIxe6e3JmQNxfgB60DkPS',
};

/**
 * Reads a script property. Throws if the key is missing or empty.
 */
function getConfig(key: ConfigKey): string {
  const value = PropertiesService.getScriptProperties().getProperty(key) || HARDCODED_PROPS[key];
  if (!value) {
    throw new Error(`[Config] Missing required script property: "${key}". Set it in Project Settings → Script Properties.`);
  }
  return value;
}

/**
 * Reads a script property, returning null if absent (non-critical config).
 */
function getConfigOptional(key: ConfigKey): string | null {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Writes a script property.
 */
function setConfig(key: ConfigKey, value: string): void {
  PropertiesService.getScriptProperties().setProperty(key, value);
}

/**
 * Deletes a script property.
 */
function deleteConfig(key: ConfigKey): void {
  PropertiesService.getScriptProperties().deleteProperty(key);
}

/**
 * Seeds all required keys with empty placeholder values so the operator
 * knows exactly what to fill in. Safe to run multiple times — skips keys
 * that already have values.
 */
function initializeConfig(): void {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperties();
  const missing: string[] = [];

  REQUIRED_KEYS.forEach(key => {
    if (!existing[key]) {
      props.setProperty(key, '');
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    Logger.log(`[Config] Seeded ${missing.length} empty properties. Fill these in Script Properties:\n${missing.join('\n')}`);
  } else {
    Logger.log('[Config] All required properties already set.');
  }
}

/**
 * Returns all config keys and whether they are populated (values masked).
 * Useful for a health-check run.
 */
function auditConfig(): Record<string, boolean> {
  const props = PropertiesService.getScriptProperties().getProperties();
  const result: Record<string, boolean> = {};
  REQUIRED_KEYS.forEach(key => {
    result[key] = !!(props[key] && props[key].length > 0);
  });
  return result;
}
