/**
 * Calendar & Meeting Automation module.
 *
 * Handles: weekly standup creation, pre-meeting doc setup,
 * event color coding, conflict detection, and focus time blocking.
 */

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupCalendarAutomation(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Sunday 6 PM — create next week's standups.
  ScriptApp.newTrigger('createWeeklyStandups')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(18).create();

  // Every 15 minutes — check for upcoming meetings needing prep docs.
  ScriptApp.newTrigger('checkUpcomingMeetings')
    .timeBased().everyMinutes(15).create();

  // Sunday 7 PM — block focus time for the week.
  ScriptApp.newTrigger('blockWeeklyFocusTime')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).create();

  // Calendar event updated — color coding + conflict detection.
  ScriptApp.newTrigger('onCalendarEventUpdated')
    .forUserCalendar(Session.getEffectiveUser().getEmail())
    .onEventUpdated().create();

  GWAS.gwasLog('Calendar', 'INFO', 'Calendar automation triggers installed.');
  Logger.log('✅ Calendar automation setup complete.');
}

// ─── Weekly standup creator ───────────────────────────────────────────────────

/**
 * Creates daily standup events for the coming week (Mon–Fri).
 * Runs every Sunday at 6 PM.
 */
function createWeeklyStandups(): void {
  GWAS.gwasLog('Calendar', 'INFO', 'Creating weekly standup events...');

  const standup = _getStandupConfig();
  const cal = CalendarApp.getDefaultCalendar();
  const members = GWAS.getTeamMembers();
  const guestEmails = members.map(m => m.email).join(',');

  // Find next Monday.
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);

  let created = 0;
  for (let d = 0; d < 5; d++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + d);

    // Check if a standup already exists for this day.
    const dayEnd = new Date(day.getTime() + 86400000);
    const existing = cal.getEvents(day, dayEnd).filter(e =>
      e.getTitle().includes('Daily Standup') || e.getTitle().includes('Stand-up')
    );
    if (existing.length > 0) continue;

    const start = new Date(day);
    start.setHours(standup.hour, standup.minute, 0, 0);
    const end = new Date(start.getTime() + standup.durationMinutes * 60000);

    const description = `📋 Daily Standup — ${GWAS.toIsoDate(day)}

Agenda:
• What did you accomplish yesterday?
• What are you working on today?
• Any blockers?

---
Auto-created by GWAS Calendar Automation`;

    const event = cal.createEvent(`☀️ Daily Standup`, start, end, {
      description,
      guests: guestEmails,
      sendInvites: false,
    });

    event.setColor(CalendarApp.EventColor.GREEN);
    created++;
  }

  GWAS.gwasLog('Calendar', 'INFO', `Created ${created} standup events for the week of ${GWAS.toIsoDate(monday)}.`);
}

const _getStandupConfig = () => ({
  hour: 9,
  minute: 30,
  durationMinutes: 15,
});

// ─── Pre-meeting doc setup ────────────────────────────────────────────────────

/**
 * Polls for meetings starting in the next 30–45 minutes that don't yet
 * have a notes doc linked. Creates the doc and updates the event.
 * Runs every 15 minutes.
 */
function checkUpcomingMeetings(): void {
  const cal = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const windowStart = new Date(now.getTime() + 25 * 60000);  // 25 min from now
  const windowEnd = new Date(now.getTime() + 50 * 60000);    // 50 min from now

  const events = cal.getEvents(windowStart, windowEnd);

  events.forEach(event => {
    // Only process events with at least 1 guest (real meetings).
    if (event.getGuestList().length === 0) return;

    // Skip all-day events.
    if (event.isAllDayEvent()) return;

    // Skip if notes doc already linked.
    const desc = event.getDescription() ?? '';
    if (desc.includes('docs.google.com/document')) return;

    // Skip standups (they have their own template).
    if (event.getTitle().includes('Daily Standup')) return;

    try {
      _setupPreMeetingDoc(event);
    } catch (e) {
      GWAS.gwasLog('Calendar', 'ERROR', `Pre-meeting setup failed for "${event.getTitle()}": ${(e as Error).message}`);
    }
  });
}

function _setupPreMeetingDoc(event: GoogleAppsScript.Calendar.CalendarEvent): void {
  const title = event.getTitle();
  const dateStr = GWAS.toIsoDate(event.getStartTime());
  const docTitle = `${dateStr} — ${title} — Meeting Notes`;

  // Create the notes doc in the Team Drive.
  const teamFolderId = GWAS.getConfig('TEAM_DRIVE_FOLDER_ID');
  const teamFolder = DriveApp.getFolderById(teamFolderId);

  // Find or create a "Meeting Notes" subfolder.
  const notesFolders = teamFolder.getFoldersByName('Meeting Notes');
  const notesFolder = notesFolders.hasNext() ? notesFolders.next() : teamFolder.createFolder('Meeting Notes');

  const doc = DocumentApp.create(docTitle);
  DriveApp.getFileById(doc.getId()).moveTo(notesFolder);

  const body = doc.getBody();
  body.clear();

  body.appendParagraph(title).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph(`${event.getStartTime().toLocaleString()} — ${event.getEndTime().toLocaleString()}`)
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  // Attendees.
  const guests = event.getGuestList().map(g => g.getEmail());
  body.appendParagraph('Attendees').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(guests.join(', ') || 'See calendar event');

  // Meet link.
  const meetLink = event.getConferenceData()?.getEntryPoints()?.[0]?.getUri() ?? '';
  if (meetLink) {
    body.appendParagraph('Meeting Link').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(meetLink);
  }

  // Agenda from event description.
  const eventDesc = event.getDescription() ?? '';
  body.appendParagraph('Agenda').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(eventDesc || '1. \n2. \n3. ');

  body.appendParagraph('Notes').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('');

  body.appendParagraph('Action Items').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('• [ ] ');

  body.appendParagraph('Decisions').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('• ');

  body.appendParagraph('---\nAuto-created by GWAS · Post-meeting AI summary will be added automatically.')
    .setFontColor('#80868b').setFontStyle('italic');

  doc.saveAndClose();

  // Update the calendar event description with the doc link.
  const updatedDesc = `📝 Meeting Notes: ${doc.getUrl()}\n\n${eventDesc}`;
  event.setDescription(updatedDesc);

  // Notify attendees via Chat.
  const teamSpaceId = GWAS.getConfig('TEAM_CHAT_SPACE_ID');
  GWAS.sendChatMessage(
    teamSpaceId,
    `📝 Meeting notes doc ready for *${title}* (starting ${event.getStartTime().toLocaleTimeString()}):\n${doc.getUrl()}`
  );

  GWAS.gwasLog('Calendar', 'INFO', `Pre-meeting doc created for "${title}": ${doc.getUrl()}`);
}

// ─── Event color coding ───────────────────────────────────────────────────────

/**
 * Fires when a calendar event is created or updated.
 * Applies color coding based on event type.
 */
function onCalendarEventUpdated(): void {
  // The onEventUpdated trigger doesn't provide the event directly.
  // We scan events in the next 30 days and apply colors.
  const cal = CalendarApp.getDefaultCalendar();
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400000);
  const events = cal.getEvents(now, future);

  events.forEach(event => {
    const color = _getEventColor(event);
    if (color && event.getColor() !== color) {
      event.setColor(color);
    }
  });
}

function _getEventColor(event: GoogleAppsScript.Calendar.CalendarEvent): string | null {
  const title = event.getTitle().toLowerCase();
  const guestCount = event.getGuestList().length;

  if (title.includes('standup') || title.includes('stand-up') || title.includes('daily')) {
    return CalendarApp.EventColor.GREEN;
  }
  if (title.includes('1:1') || title.includes('1-1') || title.includes('one on one') || guestCount === 1) {
    return CalendarApp.EventColor.BLUE;
  }
  if (title.includes('deadline') || title.includes('due') || title.includes('🏁')) {
    return CalendarApp.EventColor.RED;
  }
  if (title.includes('review') || title.includes('retro') || title.includes('planning')) {
    return CalendarApp.EventColor.YELLOW;
  }
  if (title.includes('focus') || title.includes('deep work') || title.includes('blocked')) {
    return CalendarApp.EventColor.GRAPHITE;
  }
  if (title.includes('interview') || title.includes('external') || title.includes('client')) {
    return CalendarApp.EventColor.RED;
  }
  return null;
}

// ─── Focus time blocker ───────────────────────────────────────────────────────

/**
 * Blocks 2-hour focus windows for each team member based on their availability.
 * Runs every Sunday at 7 PM for the coming week.
 */
function blockWeeklyFocusTime(): void {
  GWAS.gwasLog('Calendar', 'INFO', 'Blocking weekly focus time...');
  const cal = CalendarApp.getDefaultCalendar();
  const members = GWAS.getTeamMembers();

  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);
  monday.setHours(0, 0, 0, 0);

  let blocked = 0;
  for (let d = 0; d < 5; d++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + d);

    // Try to find a 2-hour window between 10 AM and 4 PM with no meetings.
    const dayStart = new Date(day); dayStart.setHours(10, 0, 0, 0);
    const dayEnd = new Date(day); dayEnd.setHours(16, 0, 0, 0);
    const existingEvents = cal.getEvents(dayStart, dayEnd);

    // Find first 2-hour gap.
    const focusStart = _findFocusWindow(existingEvents, dayStart, dayEnd);
    if (!focusStart) continue;

    const focusEnd = new Date(focusStart.getTime() + 2 * 60 * 60000);

    // Check if focus block already exists.
    const alreadyBlocked = existingEvents.some(e => e.getTitle().includes('🎯 Focus Time'));
    if (alreadyBlocked) continue;

    const event = cal.createEvent('🎯 Focus Time — Deep Work', focusStart, focusEnd, {
      description: 'Blocked for focused work. Auto-created by GWAS.',
    });
    event.setColor(CalendarApp.EventColor.GRAPHITE);
    blocked++;
  }

  GWAS.gwasLog('Calendar', 'INFO', `Blocked ${blocked} focus time windows for the week.`);
}

function _findFocusWindow(
  events: GoogleAppsScript.Calendar.CalendarEvent[],
  windowStart: Date,
  windowEnd: Date
): Date | null {
  const busySlots = events.map(e => ({
    start: e.getStartTime().getTime(),
    end: e.getEndTime().getTime(),
  })).sort((a, b) => a.start - b.start);

  const needed = 2 * 60 * 60000; // 2 hours in ms
  let cursor = windowStart.getTime();

  for (const slot of busySlots) {
    if (slot.start - cursor >= needed) {
      return new Date(cursor);
    }
    cursor = Math.max(cursor, slot.end);
  }

  if (windowEnd.getTime() - cursor >= needed) {
    return new Date(cursor);
  }

  return null;
}

// ─── Calendar event suggestion approval ──────────────────────────────────────

/**
 * Sends an approval card to a user asking them to confirm a suggested
 * calendar event (extracted from meeting notes, email, or chat).
 */
function requestCalendarEventApproval(params: {
  suggestion: ExtractedCalendarEvent;
  approverEmail: string;
  sourceRef: string;
}): void {
  const approver = GWAS.getMemberByEmail(params.approverEmail);
  if (!approver) {
    GWAS.gwasLog('Calendar', 'WARN', `No approver found for ${params.approverEmail}`);
    return;
  }

  const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
  const approvalId = GWAS.generateId();

  GWAS.sendApprovalCard({
    member: approver,
    approvalId,
    actionType: 'CREATE_CALENDAR_EVENT',
    title: `New meeting: ${params.suggestion.title}`,
    summary: params.suggestion.description || 'Suggested from recent content.',
    details: [
      { label: 'Suggested Date', value: params.suggestion.suggestedDate || 'Not specified' },
      { label: 'Duration', value: `${params.suggestion.suggestedDuration} minutes` },
      { label: 'Attendees', value: params.suggestion.suggestedAttendees.join(', ') || 'TBD' },
      { label: 'Source', value: params.sourceRef },
    ],
    callbackBaseUrl: callbackUrl,
  });

  GWAS.createApproval({
    actionType: 'CREATE_CALENDAR_EVENT',
    payload: params.suggestion,
    requestedBy: 'module-03-meeting-notes',
    assignedTo: params.approverEmail,
    chatSpaceId: approver.chatDmSpaceId,
    chatMessageId: '',
  });

  GWAS.gwasLog('Calendar', 'INFO', `Calendar event approval sent to ${params.approverEmail}: "${params.suggestion.title}"`);
}
