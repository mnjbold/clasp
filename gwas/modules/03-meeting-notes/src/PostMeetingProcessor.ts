/**
 * Post-meeting processing: fetches Meet transcripts, runs Gemini extraction,
 * appends AI summary to the notes doc, creates task approval cards in Chat,
 * and sends summary emails.
 */

// Tracks processed meeting IDs to avoid double-processing.
const PROCESSED_KEY = 'processed_conference_ids';

/**
 * Polls for calendar events that ended in the last 15 minutes and
 * triggers post-meeting processing for each.
 * Runs every 15 minutes via time trigger.
 */
function checkRecentlyEndedMeetings(): void {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 20 * 60000); // 20 min ago
  const windowEnd = new Date(now.getTime() - 2 * 60000);    // 2 min ago (buffer)

  const cal = CalendarApp.getDefaultCalendar();
  const events = cal.getEvents(windowStart, windowEnd);

  const processed = _getProcessedIds();

  events.forEach(event => {
    if (event.getGuestList().length === 0) return;
    if (event.isAllDayEvent()) return;

    const eventId = event.getId();
    if (processed.has(eventId)) return;

    try {
      processPostMeeting(event);
      processed.add(eventId);
    } catch (e) {
      GWAS.gwasLog('MeetingNotes', 'ERROR', `Post-meeting processing failed for "${event.getTitle()}": ${(e as Error).message}`);
    }
  });

  _saveProcessedIds(processed);
}

function _getProcessedIds(): Set<string> {
  const raw = PropertiesService.getScriptProperties().getProperty(PROCESSED_KEY);
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch (_) {
    return new Set();
  }
}

function _saveProcessedIds(ids: Set<string>): void {
  // Keep only the last 200 IDs to avoid property size limits.
  const arr = Array.from(ids).slice(-200);
  PropertiesService.getScriptProperties().setProperty(PROCESSED_KEY, JSON.stringify(arr));
}

/**
 * Full post-meeting processing pipeline for a single calendar event.
 */
function processPostMeeting(event: GoogleAppsScript.Calendar.CalendarEvent): void {
  const title = event.getTitle();
  GWAS.gwasLog('MeetingNotes', 'INFO', `Processing post-meeting: "${title}"`);

  // 1. Find the notes doc linked in the event description.
  const desc = event.getDescription() ?? '';
  const docUrlMatch = desc.match(/https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  const docId = docUrlMatch ? docUrlMatch[1] : null;

  // 2. Fetch transcript from Meet API (if available).
  const transcript = _fetchMeetTranscript(event);

  // 3. Get doc content as fallback if no transcript.
  let sourceText = transcript;
  if (!sourceText && docId) {
    try {
      const doc = DocumentApp.openById(docId);
      sourceText = doc.getBody().getText();
    } catch (_) {}
  }

  if (!sourceText || sourceText.trim().length < 50) {
    GWAS.gwasLog('MeetingNotes', 'INFO', `No usable content for "${title}" — skipping AI processing.`);
    return;
  }

  // 4. Run Gemini extraction.
  const teamNames = GWAS.getTeamMemberNames();
  const extracted = GWAS.extractContextFromText(sourceText, 'meeting_transcript', teamNames);

  // 5. Append AI summary to the notes doc.
  if (docId) {
    _appendAiSummaryToDoc(docId, extracted, title);
  }

  // 6. Send task creation approval cards to Chat for each action item.
  _dispatchTaskApprovals(extracted, event, docId ? `https://docs.google.com/document/d/${docId}` : '');

  // 7. Send calendar event approval cards for scheduling suggestions.
  _dispatchCalendarApprovals(extracted, event);

  // 8. Post summary card to team Chat space.
  _postMeetingSummaryToChat(event, extracted, docId);

  // 9. Send summary email to all attendees.
  _sendMeetingSummaryEmail(event, extracted, docId);

  // 10. Alert on urgent items.
  if (extracted.urgentAlerts.length > 0) {
    _dispatchUrgentAlerts(extracted.urgentAlerts, event);
  }

  GWAS.gwasLog('MeetingNotes', 'INFO', `Post-meeting processing complete for "${title}". Actions: ${extracted.actionItems.length}, Calendar: ${extracted.calendarSuggestions.length}`);
}

// ─── Meet transcript fetch ────────────────────────────────────────────────────

function _fetchMeetTranscript(event: GoogleAppsScript.Calendar.CalendarEvent): string {
  // Meet REST API: list conference records, find matching one, get transcript entries.
  const token = ScriptApp.getOAuthToken();
  const headers = { Authorization: `Bearer ${token}` };

  try {
    // List recent conference records (last 2 hours).
    const since = new Date(Date.now() - 2 * 60 * 60000).toISOString();
    const listUrl = `https://meet.googleapis.com/v2/conferenceRecords?filter=start_time>="${since}"`;

    const listResp = UrlFetchApp.fetch(listUrl, {
      headers,
      muteHttpExceptions: true,
    });

    if (listResp.getResponseCode() !== 200) return '';

    const records = JSON.parse(listResp.getContentText()) as {
      conferenceRecords?: Array<{ name: string; space: { name: string } }>;
    };

    if (!records.conferenceRecords?.length) return '';

    // Match by event title heuristic (Meet doesn't expose calendar event ID directly).
    const eventTitle = event.getTitle().toLowerCase();
    const record = records.conferenceRecords[0]; // Use most recent as best guess.

    // Fetch transcript entries.
    const transcriptListUrl = `https://meet.googleapis.com/v2/${record.name}/transcripts`;
    const tListResp = UrlFetchApp.fetch(transcriptListUrl, { headers, muteHttpExceptions: true });
    if (tListResp.getResponseCode() !== 200) return '';

    const transcripts = JSON.parse(tListResp.getContentText()) as {
      transcripts?: Array<{ name: string }>;
    };
    if (!transcripts.transcripts?.length) return '';

    const transcriptName = transcripts.transcripts[0].name;
    const entriesUrl = `https://meet.googleapis.com/v2/${transcriptName}/entries?pageSize=500`;
    const entriesResp = UrlFetchApp.fetch(entriesUrl, { headers, muteHttpExceptions: true });
    if (entriesResp.getResponseCode() !== 200) return '';

    const entries = JSON.parse(entriesResp.getContentText()) as {
      transcriptEntries?: Array<{ participant: { signedinUser?: { displayName: string } }; text: string }>;
    };

    if (!entries.transcriptEntries?.length) return '';

    return entries.transcriptEntries
      .map(e => `${e.participant?.signedinUser?.displayName ?? 'Unknown'}: ${e.text}`)
      .join('\n');

  } catch (e) {
    GWAS.gwasLog('MeetingNotes', 'WARN', `Meet transcript fetch failed: ${(e as Error).message}`);
    return '';
  }
}

// ─── Doc update ───────────────────────────────────────────────────────────────

function _appendAiSummaryToDoc(
  docId: string,
  extracted: GeminiExtractedContext,
  meetingTitle: string
): void {
  try {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();

    body.appendParagraph('─────────────────────────────────────').setFontColor('#dadce0');
    body.appendParagraph('🤖 AI-Generated Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('Generated by GWAS · Gemini').setFontColor('#80868b').setFontStyle('italic');

    body.appendParagraph('Summary').setHeading(DocumentApp.ParagraphHeading.HEADING2);
    body.appendParagraph(extracted.summary || 'No summary generated.');

    if (extracted.decisions.length > 0) {
      body.appendParagraph('Decisions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      extracted.decisions.forEach(d => body.appendParagraph(`✅ ${d}`));
    }

    if (extracted.actionItems.length > 0) {
      body.appendParagraph('Action Items').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      extracted.actionItems.forEach(item => {
        const line = `☐ ${item.title}${item.suggestedOwner ? ` → ${item.suggestedOwner}` : ''}${item.suggestedDueDate ? ` (due ${item.suggestedDueDate})` : ''} [${item.priority}]`;
        body.appendParagraph(line);
      });
    }

    if (extracted.openQuestions.length > 0) {
      body.appendParagraph('Open Questions').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      extracted.openQuestions.forEach(q => body.appendParagraph(`❓ ${q}`));
    }

    if (extracted.urgentAlerts.length > 0) {
      body.appendParagraph('⚠️ Urgent Items').setHeading(DocumentApp.ParagraphHeading.HEADING2);
      extracted.urgentAlerts.forEach(a => body.appendParagraph(`🚨 ${a}`));
    }

    doc.saveAndClose();
    GWAS.gwasLog('MeetingNotes', 'INFO', `AI summary appended to doc ${docId}`);
  } catch (e) {
    GWAS.gwasLog('MeetingNotes', 'ERROR', `Failed to append AI summary to doc ${docId}: ${(e as Error).message}`);
  }
}

// ─── Task approval dispatch ───────────────────────────────────────────────────

function _dispatchTaskApprovals(
  extracted: GeminiExtractedContext,
  event: GoogleAppsScript.Calendar.CalendarEvent,
  sourceRef: string
): void {
  const organizer = event.getCreators()[0] ?? GWAS.getTeamMembers()[0]?.email ?? '';

  extracted.actionItems.forEach(item => {
    // Resolve owner email from name.
    const ownerEmail = _resolveOwnerEmail(item.suggestedOwner);
    // Approval goes to the suggested owner if found, otherwise to the meeting organizer.
    const approverEmail = ownerEmail || organizer;

    if (!approverEmail) return;

    const approver = GWAS.getMemberByEmail(approverEmail);
    if (!approver) return;

    const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';

    const approvalId = GWAS.generateId();
    const payload = {
      title: item.title,
      description: item.description,
      owner: ownerEmail,
      priority: item.priority,
      dueDate: item.suggestedDueDate,
      source: 'meeting' as TaskSource,
      sourceRef,
    };

    const msgName = GWAS.sendApprovalCard({
      member: approver,
      approvalId,
      actionType: 'CREATE_TASK',
      title: `New task from meeting: ${item.title}`,
      summary: item.description || item.sourceText,
      details: [
        { label: 'Meeting', value: event.getTitle() },
        { label: 'Suggested Owner', value: item.suggestedOwner || 'Unassigned' },
        { label: 'Priority', value: item.priority },
        { label: 'Due Date', value: item.suggestedDueDate || 'Not specified' },
        { label: 'From transcript', value: item.sourceText.substring(0, 120) + (item.sourceText.length > 120 ? '…' : '') },
      ],
      callbackBaseUrl: callbackUrl,
    });

    GWAS.createApproval({
      actionType: 'CREATE_TASK',
      payload,
      requestedBy: 'module-03-meeting-notes',
      assignedTo: approverEmail,
      chatSpaceId: approver.chatDmSpaceId,
      chatMessageId: msgName,
    });
  });
}

// ─── Calendar approval dispatch ───────────────────────────────────────────────

function _dispatchCalendarApprovals(
  extracted: GeminiExtractedContext,
  event: GoogleAppsScript.Calendar.CalendarEvent
): void {
  const organizer = event.getCreators()[0] ?? '';
  if (!organizer) return;

  extracted.calendarSuggestions.forEach(suggestion => {
    const approver = GWAS.getMemberByEmail(organizer);
    if (!approver) return;

    const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
    const approvalId = GWAS.generateId();

    const msgName = GWAS.sendApprovalCard({
      member: approver,
      approvalId,
      actionType: 'CREATE_CALENDAR_EVENT',
      title: `Schedule meeting: ${suggestion.title}`,
      summary: suggestion.description || 'Suggested from meeting discussion.',
      details: [
        { label: 'Suggested Date', value: suggestion.suggestedDate || 'Not specified' },
        { label: 'Duration', value: `${suggestion.suggestedDuration} min` },
        { label: 'Attendees', value: suggestion.suggestedAttendees.join(', ') || 'TBD' },
        { label: 'From', value: `"${event.getTitle()}"` },
      ],
      callbackBaseUrl: callbackUrl,
    });

    GWAS.createApproval({
      actionType: 'CREATE_CALENDAR_EVENT',
      payload: suggestion,
      requestedBy: 'module-03-meeting-notes',
      assignedTo: organizer,
      chatSpaceId: approver.chatDmSpaceId,
      chatMessageId: msgName,
    });
  });
}

// ─── Chat summary card ────────────────────────────────────────────────────────

function _postMeetingSummaryToChat(
  event: GoogleAppsScript.Calendar.CalendarEvent,
  extracted: GeminiExtractedContext,
  docId: string | null
): void {
  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  const docUrl = docId ? `https://docs.google.com/document/d/${docId}` : '';

  const actionItemsText = extracted.actionItems.length > 0
    ? extracted.actionItems.slice(0, 5).map(i => `• ${i.title}${i.suggestedOwner ? ` → ${i.suggestedOwner}` : ''}`).join('\n')
    : 'None identified';

  const card = {
    header: {
      title: `📝 Meeting Summary: ${event.getTitle()}`,
      subtitle: event.getStartTime().toLocaleString(),
    },
    sections: [
      {
        header: 'Summary',
        widgets: [{ textParagraph: { text: extracted.summary || 'No summary available.' } }],
      },
      {
        header: `Action Items (${extracted.actionItems.length})`,
        widgets: [{ textParagraph: { text: actionItemsText } }],
      },
      ...(extracted.decisions.length > 0 ? [{
        header: `Decisions (${extracted.decisions.length})`,
        widgets: [{ textParagraph: { text: extracted.decisions.slice(0, 3).map(d => `• ${d}`).join('\n') } }],
      }] : []),
      ...(docUrl ? [{
        widgets: [{
          buttonList: {
            buttons: [{ text: '📄 Full Notes', onClick: { openLink: { url: docUrl } } }],
          },
        }],
      }] : []),
    ],
  };

  GWAS.sendChatCard(teamSpaceId, card, `📝 Meeting summary: ${event.getTitle()}`);
}

// ─── Summary email ────────────────────────────────────────────────────────────

function _sendMeetingSummaryEmail(
  event: GoogleAppsScript.Calendar.CalendarEvent,
  extracted: GeminiExtractedContext,
  docId: string | null
): void {
  const guests = event.getGuestList().map(g => g.getEmail());
  const docUrl = docId ? `https://docs.google.com/document/d/${docId}` : '';

  const actionItemsHtml = extracted.actionItems.length > 0
    ? extracted.actionItems.map(i =>
        `<div class="item">☐ <strong>${i.title}</strong>${i.suggestedOwner ? ` → ${i.suggestedOwner}` : ''} <span class="badge p${i.priority.slice(1).toLowerCase()}">${i.priority}</span>${i.suggestedDueDate ? ` <small>due ${i.suggestedDueDate}</small>` : ''}</div>`
      ).join('')
    : '<div class="item">None identified</div>';

  const decisionsHtml = extracted.decisions.length > 0
    ? extracted.decisions.map(d => `<div class="item">✅ ${d}</div>`).join('')
    : '<div class="item">None recorded</div>';

  const htmlBody = GWAS.wrapHtmlEmail(
    `📝 Meeting Summary: ${event.getTitle()}`,
    `<div class="section">
      <h2>Summary</h2>
      <p>${extracted.summary || 'No summary available.'}</p>
    </div>
    <div class="section">
      <h2>Action Items (${extracted.actionItems.length})</h2>
      ${actionItemsHtml}
    </div>
    <div class="section">
      <h2>Decisions (${extracted.decisions.length})</h2>
      ${decisionsHtml}
    </div>
    ${extracted.openQuestions.length > 0 ? `
    <div class="section">
      <h2>Open Questions</h2>
      ${extracted.openQuestions.map(q => `<div class="item">❓ ${q}</div>`).join('')}
    </div>` : ''}
    ${docUrl ? `<p><a href="${docUrl}">📄 View full meeting notes →</a></p>` : ''}`
  );

  guests.forEach(email => {
    GWAS.sendEmail({
      to: email,
      subject: `📝 Meeting Summary: ${event.getTitle()} — ${event.getStartTime().toDateString()}`,
      body: `Meeting summary for ${event.getTitle()}.\n\nSummary: ${extracted.summary}\n\nAction items: ${extracted.actionItems.length}\n\nFull notes: ${docUrl}`,
      htmlBody,
    });
  });
}

// ─── Urgent alert dispatch ────────────────────────────────────────────────────

function _dispatchUrgentAlerts(alerts: string[], event: GoogleAppsScript.Calendar.CalendarEvent): void {
  const organizer = event.getCreators()[0] ?? '';
  const member = organizer ? GWAS.getMemberByEmail(organizer) : GWAS.getTeamLeads()[0];
  if (!member) return;

  alerts.forEach(alert => {
    GWAS.sendUrgentAlert({
      member,
      title: `Urgent item from "${event.getTitle()}"`,
      message: alert,
      alsoPostToTeamSpace: true,
    });
  });
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function _resolveOwnerEmail(nameOrEmail: string): string {
  if (!nameOrEmail) return '';
  if (nameOrEmail.includes('@')) return nameOrEmail;

  // Try to match by name.
  const members = GWAS.getTeamMembers();
  const match = members.find(m =>
    m.name.toLowerCase().includes(nameOrEmail.toLowerCase()) ||
    nameOrEmail.toLowerCase().includes(m.name.toLowerCase().split(' ')[0])
  );
  return match?.email ?? '';
}
