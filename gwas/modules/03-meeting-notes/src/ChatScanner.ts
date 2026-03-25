/**
 * Google Chat context scanner.
 *
 * Reads messages from monitored Chat spaces and extracts action items,
 * tasks, and scheduling suggestions via Gemini. Sends approval cards
 * back to Chat for confirmation before creating tasks or events.
 *
 * Monitored spaces are stored in script property MONITORED_CHAT_SPACE_IDS
 * as a comma-separated list of space IDs (e.g. "spaces/ABC,spaces/XYZ").
 *
 * Note: Reading Chat messages requires the Chat API and the
 * chat.messages.readonly scope. The Chat app must be a member of each
 * monitored space.
 */

const CHAT_PROCESSED_KEY = 'chat_processed_message_ids';
const CHAT_API_BASE_URL = 'https://chat.googleapis.com/v1';

/**
 * Scans monitored Chat spaces for actionable messages.
 * Runs every 60 minutes via time trigger.
 */
function scanChatForContext(): void {
  const spaceIdsRaw = GWAS.getConfigOptional('MONITORED_CHAT_SPACE_IDS');
  if (!spaceIdsRaw) {
    GWAS.gwasLog('MeetingNotes', 'INFO', 'No MONITORED_CHAT_SPACE_IDS configured — skipping Chat scan.');
    return;
  }

  const spaceIds = spaceIdsRaw.split(',').map(s => s.trim()).filter(Boolean);
  const processed = _getChatProcessedIds();
  const teamNames = GWAS.getTeamMemberNames();
  let totalScanned = 0;

  spaceIds.forEach(spaceId => {
    try {
      const count = _scanSpace(spaceId, processed, teamNames);
      totalScanned += count;
    } catch (e) {
      GWAS.gwasLog('MeetingNotes', 'ERROR', `Chat scan failed for space ${spaceId}: ${(e as Error).message}`);
    }
  });

  _saveChatProcessedIds(processed);
  GWAS.gwasLog('MeetingNotes', 'INFO', `Chat scan complete. Processed ${totalScanned} new messages.`);
}

function _scanSpace(spaceId: string, processed: Set<string>, teamNames: string[]): number {
  const token = ScriptApp.getOAuthToken();
  const since = new Date(Date.now() - 65 * 60000).toISOString(); // last 65 min

  const url = `${CHAT_API_BASE_URL}/${spaceId}/messages?filter=createTime>"${since}"&pageSize=50`;
  const resp = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) return 0;

  const data = JSON.parse(resp.getContentText()) as {
    messages?: Array<{
      name: string;
      text?: string;
      sender?: { displayName: string; name: string };
      createTime: string;
    }>;
  };

  if (!data.messages?.length) return 0;

  // Filter out bot messages and already-processed messages.
  const newMessages = data.messages.filter(m =>
    m.text &&
    !processed.has(m.name) &&
    !m.sender?.name?.includes('bot')
  );

  if (newMessages.length === 0) return 0;

  // Batch messages into a single context block for Gemini (more efficient).
  const batchText = newMessages
    .map(m => `[${m.sender?.displayName ?? 'Unknown'}]: ${m.text}`)
    .join('\n');

  let extracted: GeminiExtractedContext;
  try {
    extracted = GWAS.extractContextFromText(batchText, 'chat', teamNames);
  } catch (e) {
    GWAS.gwasLog('MeetingNotes', 'WARN', `Gemini extraction failed for Chat space ${spaceId}: ${(e as Error).message}`);
    newMessages.forEach(m => processed.add(m.name));
    return newMessages.length;
  }

  const currentUser = Session.getEffectiveUser().getEmail();
  const spaceUrl = `https://chat.google.com/room/${spaceId.replace('spaces/', '')}`;

  // Dispatch task approvals.
  extracted.actionItems.forEach(item => {
    const ownerEmail = _resolveOwnerEmailFromName(item.suggestedOwner) || currentUser;
    const approver = GWAS.getMemberByEmail(ownerEmail);
    if (!approver) return;

    const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
    const approvalId = GWAS.generateId();

    const msgName = GWAS.sendApprovalCard({
      member: approver,
      approvalId,
      actionType: 'CREATE_TASK',
      title: `Task from Chat: ${item.title}`,
      summary: item.description || item.sourceText,
      details: [
        { label: 'Space', value: spaceId },
        { label: 'Suggested Owner', value: item.suggestedOwner || 'Unassigned' },
        { label: 'Priority', value: item.priority },
        { label: 'Due Date', value: item.suggestedDueDate || 'Not specified' },
        { label: 'From message', value: item.sourceText.substring(0, 100) + '…' },
      ],
      callbackBaseUrl: callbackUrl,
    });

    GWAS.createApproval({
      actionType: 'CREATE_TASK',
      payload: {
        title: item.title,
        description: item.description,
        owner: ownerEmail,
        priority: item.priority,
        dueDate: item.suggestedDueDate,
        source: 'chat' as TaskSource,
        sourceRef: spaceUrl,
      },
      requestedBy: 'module-03-chat-scanner',
      assignedTo: ownerEmail,
      chatSpaceId: approver.chatDmSpaceId,
      chatMessageId: msgName,
    });
  });

  // Dispatch urgent alerts immediately.
  if (extracted.urgentAlerts.length > 0) {
    const leads = GWAS.getTeamLeads();
    const recipient = GWAS.getMemberByEmail(currentUser) ?? leads[0];
    if (recipient) {
      extracted.urgentAlerts.forEach(alert => {
        GWAS.sendUrgentAlert({
          member: recipient,
          title: `Urgent item in Chat`,
          message: alert,
          sourceUrl: spaceUrl,
          alsoPostToTeamSpace: false,
        });
      });
    }
  }

  // Dispatch calendar event approvals.
  extracted.calendarSuggestions.forEach(suggestion => {
    const approver = GWAS.getMemberByEmail(currentUser);
    if (!approver) return;

    const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
    const approvalId = GWAS.generateId();

    const msgName = GWAS.sendApprovalCard({
      member: approver,
      approvalId,
      actionType: 'CREATE_CALENDAR_EVENT',
      title: `Schedule: ${suggestion.title}`,
      summary: suggestion.description || 'Suggested from Chat discussion.',
      details: [
        { label: 'Suggested Date', value: suggestion.suggestedDate || 'Not specified' },
        { label: 'Duration', value: `${suggestion.suggestedDuration} min` },
        { label: 'Attendees', value: suggestion.suggestedAttendees.join(', ') || 'TBD' },
      ],
      callbackBaseUrl: callbackUrl,
    });

    GWAS.createApproval({
      actionType: 'CREATE_CALENDAR_EVENT',
      payload: suggestion,
      requestedBy: 'module-03-chat-scanner',
      assignedTo: currentUser,
      chatSpaceId: approver.chatDmSpaceId,
      chatMessageId: msgName,
    });
  });

  newMessages.forEach(m => processed.add(m.name));
  return newMessages.length;
}

function _getChatProcessedIds(): Set<string> {
  const raw = PropertiesService.getScriptProperties().getProperty(CHAT_PROCESSED_KEY);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw) as string[]); } catch (_) { return new Set(); }
}

function _saveChatProcessedIds(ids: Set<string>): void {
  const arr = Array.from(ids).slice(-1000);
  PropertiesService.getScriptProperties().setProperty(CHAT_PROCESSED_KEY, JSON.stringify(arr));
}

function _resolveOwnerEmailFromName(nameOrEmail: string): string {
  if (!nameOrEmail) return '';
  if (nameOrEmail.includes('@')) return nameOrEmail;
  const members = GWAS.getTeamMembers();
  const match = members.find(m =>
    m.name.toLowerCase().includes(nameOrEmail.toLowerCase()) ||
    nameOrEmail.toLowerCase().includes(m.name.toLowerCase().split(' ')[0])
  );
  return match?.email ?? '';
}

/**
 * Indexes yesterday's meeting notes docs into the KB spreadsheet.
 * Called daily at 6 AM.
 */
function indexYesterdaysMeetingNotes(): void {
  const yesterday = new Date(Date.now() - 86400000);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday.getTime() + 86400000);

  const teamFolderId = GWAS.getConfig('TEAM_DRIVE_FOLDER_ID');
  const teamFolder = DriveApp.getFolderById(teamFolderId);

  const notesFolders = teamFolder.getFoldersByName('Meeting Notes');
  if (!notesFolders.hasNext()) return;

  const notesFolder = notesFolders.next();
  const files = notesFolder.getFiles();
  let indexed = 0;

  while (files.hasNext()) {
    const file = files.next();
    const created = file.getDateCreated();
    if (created < yesterday || created >= yesterdayEnd) continue;
    if (file.getMimeType() !== MimeType.GOOGLE_DOCS) continue;

    try {
      _indexDocToKb(file);
      indexed++;
    } catch (e) {
      GWAS.gwasLog('MeetingNotes', 'WARN', `KB indexing failed for ${file.getName()}: ${(e as Error).message}`);
    }
  }

  GWAS.gwasLog('MeetingNotes', 'INFO', `Indexed ${indexed} meeting notes docs into KB.`);
}

function _indexDocToKb(file: GoogleAppsScript.Drive.File): void {
  const kbSsId = GWAS.getConfig('KB_SPREADSHEET_ID');
  const kbSs = SpreadsheetApp.openById(kbSsId);
  let kbSheet = kbSs.getSheetByName('KB Index');
  if (!kbSheet) {
    kbSheet = kbSs.insertSheet('KB Index');
    const headers = ['KB ID', 'Title', 'Source', 'URL', 'Summary', 'Tags', 'Embedding', 'Created', 'Last Indexed'];
    kbSheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }

  // Check if already indexed.
  const existingRow = GWAS.findRowByValue(kbSheet, 4, file.getUrl());
  if (existingRow > 0) return;

  const doc = DocumentApp.openById(file.getId());
  const text = doc.getBody().getText().substring(0, 10000);
  if (text.trim().length < 100) return;

  const summary = GWAS.callGemini(`Summarize this meeting notes document in 2-3 sentences:\n\n${text.substring(0, 3000)}`);
  const tagsRaw = GWAS.callGemini(`Extract 5-8 keyword tags from this text as a comma-separated list. Only the tags, nothing else:\n\n${text.substring(0, 2000)}`);
  const embedding = GWAS.getEmbedding(text.substring(0, 2000));

  kbSheet.appendRow([
    GWAS.generateId(),
    file.getName(),
    'meeting_notes',
    file.getUrl(),
    summary,
    tagsRaw.trim(),
    JSON.stringify(embedding),
    file.getDateCreated().toISOString(),
    new Date().toISOString(),
  ]);
}
