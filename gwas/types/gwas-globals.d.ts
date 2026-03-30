/**
 * gwas-globals.d.ts
 *
 * Global type declarations for all GWAS modules.
 *
 * In Google Apps Script, the shared library is accessed via its userSymbol
 * ("GWAS") as a global object.  TypeScript cannot see that symbol unless
 * we declare it here.  All types defined in lib/src/Types.ts are also
 * declared here so module source files can use them without imports.
 *
 * This file is referenced explicitly in every module tsconfig.json via the
 * "files" array so it is available to all module source files.
 */

// ─── Library symbol ──────────────────────────────────────────────────────────
// At runtime GAS injects the library as a global named by the userSymbol.
// eslint-disable-next-line no-var
declare const GWAS: {
  // Config
  getConfig(key: string): string;
  setConfig(key: string, value: string): void;
  getConfigOptional(key: string): string | null;
  initializeConfig(): void;
  auditConfig(): Record<string, boolean>;

  // Gemini
  callGemini(prompt: string, systemInstruction?: string): string;
  callGeminiStructured<T>(prompt: string, schema?: object): T;
  getEmbedding(text: string): number[];
  cosineSimilarity(a: number[], b: number[]): number;
  extractContextFromText(
    text: string,
    source?: 'chat' | 'gmail' | 'document' | 'meeting' | string,
    teamNames?: string[],
  ): GeminiExtractedContext;

  // Team Registry
  getTeamMembers(): TeamMember[];
  getMemberByEmail(email: string): TeamMember | null;
  getTeamLeads(): TeamMember[];
  getTeamEmails(): string[];
  getTeamMemberNames(): string[];

  // Chat Client
  sendChatMessage(spaceId: string, text: string): void;
  sendChatCard(spaceId: string, card: object, fallbackText?: string): void;
  sendDirectMessage(member: TeamMember, text: string): void;
  sendDirectCard(member: TeamMember, card: object, fallbackText?: string): void;
  sendApprovalCard(options: {
    member: TeamMember;
    approvalId: string;
    actionType: ApprovalActionType;
    title: string;
    summary: string;
    details?: Array<{ label: string; value: string }>;
    callbackBaseUrl?: string;
    [key: string]: unknown;
  }): string;
  sendUrgentAlert(options: {
    member: TeamMember;
    title?: string;
    message: string;
    sourceUrl?: string;
    alsoPostToTeamSpace?: boolean;
    [key: string]: unknown;
  }): void;
  sendDigestCard(member: TeamMember, digestType: DigestType, sections: object[]): void;

  // Approvals Store
  createApproval(options: object): string;
  getApproval(approvalId: string): PendingApproval | null;
  updateApprovalStatus(approvalId: string, status: ApprovalStatus): void;
  expireOldApprovals(): number;

  // Utils
  generateId(): string;
  todayIso(): string;
  toIsoDate(date: Date | GoogleAppsScript.Base.Date): string;
  toIsoDateTime(date: Date | GoogleAppsScript.Base.Date): string;
  parseIsoDate(iso: string): Date;
  isOverdue(dueDateIso: string | null | undefined): boolean;
  isDueToday(dueDateIso: string | null | undefined): boolean;
  daysUntil(dueDateIso: string): number;
  sendEmail(options: { to: string; subject: string; body?: string; htmlBody?: string }): void;
  gwasLog(module: string, level: 'INFO' | 'WARN' | 'ERROR', message: string): void;
  findRowByValue(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    col: number,
    value: string,
  ): number;
  getSheetHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[];
  rowToObject(
    headers: string[],
    row: unknown[],
  ): Record<string, unknown>;
  wrapHtmlEmail(title: string, body: string): string;
};

// ─── Team ────────────────────────────────────────────────────────────────────

interface TeamMember {
  email: string;
  name: string;
  chatUserId: string;
  chatDmSpaceId: string;
  role: 'lead' | 'member' | 'admin';
  timezone: string;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
type TaskPriority = 'P1' | 'P2' | 'P3';
type TaskSource = 'manual' | 'meeting' | 'chat' | 'email' | 'project';

interface Task {
  taskId: string;
  title: string;
  description: string;
  owner: string;
  projectId: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  created: string;
  source: TaskSource;
  sourceRef: string;
  tasksApiId: string;
  approvalMessageId: string;
}

// ─── Projects ────────────────────────────────────────────────────────────────

type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

interface Project {
  projectId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  owner: string;
  team: string[];
  startDate: string;
  targetDate: string;
  specDocUrl: string;
  driveFolderUrl: string;
  progressPct: number;
  lastUpdated: string;
  tasksListId?: string;
}

// ─── Approvals ───────────────────────────────────────────────────────────────

type ApprovalActionType =
  | 'CREATE_TASK'
  | 'CREATE_CALENDAR_EVENT'
  | 'ASSIGN_TASK'
  | 'CREATE_PROJECT'
  | 'SEND_DIGEST';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

interface PendingApproval {
  approvalId: string;
  actionType: ApprovalActionType;
  payload: string;
  requestedBy: string;
  assignedTo: string;
  chatSpaceId: string;
  chatMessageId: string;
  createdAt: string;
  expiresAt: string;
  status: ApprovalStatus;
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

interface GeminiExtractedContext {
  actionItems: ExtractedActionItem[];
  calendarSuggestions: ExtractedCalendarEvent[];
  decisions: string[];
  openQuestions: string[];
  urgentAlerts: string[];
  summary: string;
}

interface ExtractedActionItem {
  title: string;
  description: string;
  suggestedOwner: string;
  suggestedDueDate: string;
  priority: TaskPriority;
  sourceText: string;
}

interface ExtractedCalendarEvent {
  title: string;
  description: string;
  suggestedDate: string;
  suggestedDuration: number;
  suggestedAttendees: string[];
  sourceText: string;
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

type KBSource = 'drive' | 'gmail' | 'calendar' | 'meeting_notes' | 'chat';

interface KBEntry {
  kbId: string;
  title: string;
  source: KBSource;
  url: string;
  summary: string;
  tags: string[];
  embedding: number[];
  created: string;
  lastIndexed: string;
}

// ─── Digest ──────────────────────────────────────────────────────────────────

type DigestType = 'am' | 'pm' | 'weekly';

interface DigestData {
  member: TeamMember;
  digestType: DigestType;
  date: string;
  calendarEvents: CalendarEventSummary[];
  tasksDueToday: Task[];
  tasksOverdue: Task[];
  tasksCompletedToday: Task[];
  activeProjects: Project[];
  meetingsToday: CalendarEventSummary[];
  meetingNotesLinks: Array<{ title: string; url: string }>;
  newTasksFromMeetings: Task[];
  geminiInsight: string;
}

interface CalendarEventSummary {
  title: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  notesDocUrl: string;
  attendeeCount: number;
}

// ─── GoogleAppsScript.Base.Date compatibility ─────────────────────────────────
// GAS's Date type does not include the locale overloads added in ES2015+.
// Augmenting the namespace here lets `getStartTime().toLocaleTimeString(...)` compile.

declare namespace GoogleAppsScript {
  namespace Base {
    interface Date {
      toLocaleTimeString(
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ): string;
      toLocaleDateString(
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ): string;
      toLocaleString(
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
      ): string;
      // GAS Date is structurally compatible with JS Date at runtime;
      // the [Symbol.toPrimitive] overloads are typed here to satisfy strict checking.
      [Symbol.toPrimitive](hint: 'default'): string;
      [Symbol.toPrimitive](hint: 'string'): string;
      [Symbol.toPrimitive](hint: 'number'): number;
      [Symbol.toPrimitive](hint: string): string | number;
    }
  }
  namespace Calendar {
    interface CalendarEvent {
      /** Returns conference-call data attached to this event, or null. */
      getConferenceData(): {
        getEntryPoints(): Array<{
          getEntryPointType(): string;
          getUri(): string;
        }>;
      } | null;
      /** GAS accepts EventColor enum values in setColor() — augmenting the overload. */
      setColor(color: string | GoogleAppsScript.Calendar.EventColor): GoogleAppsScript.Calendar.CalendarEvent;
    }
    namespace EventColor {
      /** Graphite/grey event color (GAS runtime value: string). */
      const GRAPHITE: string;
    }
  }
  namespace Document {
    interface Paragraph {
      setFontColor(color: string): GoogleAppsScript.Document.Paragraph;
      setFontStyle(style: string): GoogleAppsScript.Document.Paragraph;
      setBold(bold: boolean): GoogleAppsScript.Document.Paragraph;
    }
  }
}
