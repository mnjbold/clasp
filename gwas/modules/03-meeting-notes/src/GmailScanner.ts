/**
 * Gmail context scanner.
 *
 * Scans incoming email for actionable content: urgent items, tasks,
 * scheduling requests. Sends Chat approval cards for each extracted item.
 *
 * Scans threads that are:
 *   - Starred, OR
 *   - Labeled "gwas-scan", OR
 *   - Unread in inbox with keywords: urgent, action required, deadline, ASAP, follow up
 */

const GMAIL_SCAN_LABEL = 'gwas-scan';
const GMAIL_PROCESSED_KEY = 'gmail_processed_thread_ids';
const URGENT_KEYWORDS = ['urgent', 'asap', 'action required', 'deadline', 'follow up', 'follow-up', 'blocker', 'critical', 'immediately'];

/**
 * Scans Gmail for actionable content and dispatches Chat approval cards.
 * Runs every 30 minutes via time trigger.
 */
function scanGmailForContext(): void {
  GWAS.gwasLog('MeetingNotes', 'INFO', 'Scanning Gmail for actionable content...');

  const processed = _getGmailProcessedIds();
  const teamNames = GWAS.getTeamMemberNames();
  let scanned = 0;

  // 1. Starred threads.
  const starredThreads = GmailApp.getStarredThreads(0, 20);
  starredThreads.forEach(thread => {
    if (processed.has(thread.getId())) return;
    _processGmailThread(thread, 'starred', teamNames, processed);
    scanned++;
  });

  // 2. Threads with gwas-scan label.
  try {
    const label = GmailApp.getUserLabelByName(GMAIL_SCAN_LABEL);
    if (label) {
      label.getThreads(0, 20).forEach(thread => {
        if (processed.has(thread.getId())) return;
        _processGmailThread(thread, 'labeled', teamNames, processed);
        scanned++;
      });
    }
  } catch (_) { /* label may not exist */ }

  // 3. Unread inbox threads with urgent keywords.
  const urgentQuery = `is:unread in:inbox (${URGENT_KEYWORDS.map(k => `"${k}"`).join(' OR ')}) newer_than:1d`;
  const urgentThreads = GmailApp.search(urgentQuery, 0, 10);
  urgentThreads.forEach(thread => {
    if (processed.has(thread.getId())) return;
    _processGmailThread(thread, 'urgent_keyword', teamNames, processed);
    scanned++;
  });

  _saveGmailProcessedIds(processed);
  GWAS.gwasLog('MeetingNotes', 'INFO', `Gmail scan complete. Processed ${scanned} new threads.`);
}

function _processGmailThread(
  thread: GoogleAppsScript.Gmail.GmailThread,
  scanReason: string,
  teamNames: string[],
  processed: Set<string>
): void {
  const messages = thread.getMessages();
  const latestMessage = messages[messages.length - 1];
  const subject = thread.getFirstMessageSubject();
  const sender = latestMessage.getFrom();
  const body = latestMessage.getPlainBody().substring(0, 8000); // cap at 8k chars

  if (!body.trim()) return;

  const fullText = `Subject: ${subject}\nFrom: ${sender}\n\n${body}`;

  let extracted: GeminiExtractedContext;
  try {
    extracted = GWAS.extractContextFromText(fullText, 'email', teamNames);
  } catch (e) {
    GWAS.gwasLog('MeetingNotes', 'WARN', `Gemini extraction failed for email "${subject}": ${(e as Error).message}`);
    return;
  }

  const sourceRef = `Gmail: ${subject}`;
  const threadUrl = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;
  const currentUser = Session.getEffectiveUser().getEmail();

  // Dispatch task approvals.
  if (extracted.actionItems.length > 0) {
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
        title: `Task from email: ${item.title}`,
        summary: item.description || item.sourceText,
        details: [
          { label: 'Email Subject', value: subject },
          { label: 'From', value: sender },
          { label: 'Priority', value: item.priority },
          { label: 'Due Date', value: item.suggestedDueDate || 'Not specified' },
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
          source: 'email' as TaskSource,
          sourceRef: threadUrl,
        },
        requestedBy: 'module-03-gmail-scanner',
        assignedTo: ownerEmail,
        chatSpaceId: approver.chatDmSpaceId,
        chatMessageId: msgName,
      });
    });
  }

  // Dispatch urgent alerts immediately — no approval needed.
  if (extracted.urgentAlerts.length > 0 || scanReason === 'urgent_keyword') {
    const leads = GWAS.getTeamLeads();
    const recipient = GWAS.getMemberByEmail(currentUser) ?? leads[0];
    if (recipient) {
      const alertText = extracted.urgentAlerts.length > 0
        ? extracted.urgentAlerts.join('\n')
        : `Urgent email received: "${subject}" from ${sender}`;

      GWAS.sendUrgentAlert({
        member: recipient,
        title: `Urgent email: ${subject}`,
        message: alertText,
        sourceUrl: threadUrl,
        alsoPostToTeamSpace: false,
      });
    }
  }

  // Dispatch calendar event approvals.
  if (extracted.calendarSuggestions.length > 0) {
    const approver = GWAS.getMemberByEmail(currentUser);
    if (approver) {
      extracted.calendarSuggestions.forEach(suggestion => {
        const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
        const approvalId = GWAS.generateId();

        const msgName = GWAS.sendApprovalCard({
          member: approver,
          approvalId,
          actionType: 'CREATE_CALENDAR_EVENT',
          title: `Schedule: ${suggestion.title}`,
          summary: suggestion.description || 'Suggested from email.',
          details: [
            { label: 'Email', value: subject },
            { label: 'Suggested Date', value: suggestion.suggestedDate || 'Not specified' },
            { label: 'Duration', value: `${suggestion.suggestedDuration} min` },
            { label: 'Attendees', value: suggestion.suggestedAttendees.join(', ') || 'TBD' },
          ],
          callbackBaseUrl: callbackUrl,
        });

        GWAS.createApproval({
          actionType: 'CREATE_CALENDAR_EVENT',
          payload: suggestion,
          requestedBy: 'module-03-gmail-scanner',
          assignedTo: currentUser,
          chatSpaceId: approver.chatDmSpaceId,
          chatMessageId: msgName,
        });
      });
    }
  }

  processed.add(thread.getId());
  GWAS.gwasLog('MeetingNotes', 'INFO', `Gmail thread processed: "${subject}" (${scanReason}). Tasks: ${extracted.actionItems.length}, Urgent: ${extracted.urgentAlerts.length}`);
}

function _getGmailProcessedIds(): Set<string> {
  const raw = PropertiesService.getScriptProperties().getProperty(GMAIL_PROCESSED_KEY);
  if (!raw) return new Set();
  try { return new Set(JSON.parse(raw) as string[]); } catch (_) { return new Set(); }
}

function _saveGmailProcessedIds(ids: Set<string>): void {
  const arr = Array.from(ids).slice(-500);
  PropertiesService.getScriptProperties().setProperty(GMAIL_PROCESSED_KEY, JSON.stringify(arr));
}

// _resolveOwnerEmailFromName is defined in ChatScanner.ts (same GAS global scope).
