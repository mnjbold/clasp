/**
 * One-time setup for Module 03 — Meeting Notes & Context Extraction.
 */

function setupMeetingNotes(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Every 15 min — post-meeting transcript check.
  ScriptApp.newTrigger('checkRecentlyEndedMeetings')
    .timeBased().everyMinutes(15).create();

  // Every 30 min — scan Gmail for urgent/actionable emails.
  ScriptApp.newTrigger('scanGmailForContext')
    .timeBased().everyMinutes(30).create();

  // Every 60 min — scan monitored Chat spaces for action items.
  ScriptApp.newTrigger('scanChatForContext')
    .timeBased().everyMinutes(60).create();

  // Daily 6 AM — index yesterday's meeting notes into KB.
  ScriptApp.newTrigger('indexYesterdaysMeetingNotes')
    .timeBased().everyDays(1).atHour(6).create();

  GWAS.gwasLog('MeetingNotes', 'INFO', 'Meeting Notes triggers installed.');
  Logger.log('✅ Module 03 setup complete.');
}
