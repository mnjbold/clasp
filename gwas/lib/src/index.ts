/**
 * GWAS Shared Library — entry point.
 *
 * Apps Script libraries do not use ES module exports. Every function and
 * interface declared at the top level of any file in this project is
 * automatically available to scripts that add this project as a library.
 *
 * This file exists only to document the public surface and to provide a
 * single place to run the one-time setup sequence.
 *
 * Public API (callable as GWAS.<function> from any module):
 *
 *   Config:         getConfig, setConfig, getConfigOptional, initializeConfig, auditConfig
 *   GeminiClient:   callGemini, callGeminiStructured, getEmbedding, cosineSimilarity, extractContextFromText
 *   TeamRegistry:   getTeamMembers, getMemberByEmail, getTeamLeads, getTeamEmails, getTeamMemberNames
 *   ChatClient:     sendChatMessage, sendChatCard, sendDirectMessage, sendDirectCard,
 *                   sendApprovalCard, sendUrgentAlert, sendDigestCard
 *   ApprovalsStore: createApproval, getApproval, updateApprovalStatus, expireOldApprovals
 *   Utils:          generateId, todayIso, toIsoDate, toIsoDateTime, parseIsoDate,
 *                   isOverdue, isDueToday, daysUntil, sendEmail, gwasLog,
 *                   findRowByValue, getSheetHeaders, rowToObject, wrapHtmlEmail
 */

/**
 * One-time setup: seeds config keys, creates the Team registry sheet.
 * Run this manually from the Apps Script editor after deploying the library.
 */
function setupLibrary(): void {
  initializeConfig();
  setupTeamRegistrySheet();
  Logger.log('[GWAS Lib] Setup complete. Fill in Script Properties and the Team sheet before deploying modules.');
}

/**
 * Health check: logs which config keys are set and which are missing.
 */
function healthCheck(): void {
  const audit = auditConfig();
  const missing = Object.entries(audit).filter(([, v]) => !v).map(([k]) => k);
  const set = Object.entries(audit).filter(([, v]) => v).map(([k]) => k);

  Logger.log(`[GWAS Lib] Health Check\n✅ Set (${set.length}): ${set.join(', ')}\n❌ Missing (${missing.length}): ${missing.join(', ') || 'none'}`);

  const members = getTeamMembers();
  Logger.log(`[GWAS Lib] Team members loaded: ${members.length}`);
}
