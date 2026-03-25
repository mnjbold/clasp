/**
 * Shared type definitions used across all GWAS modules.
 * This file is part of the shared Apps Script library.
 */

// ─── Team ────────────────────────────────────────────────────────────────────

interface TeamMember {
  email: string;
  name: string;
  chatUserId: string;   // Google Chat user ID (e.g. "users/123456789")
  chatDmSpaceId: string; // Pre-created DM space ID for direct messages
  role: 'lead' | 'member' | 'admin';
  timezone: string;     // IANA timezone, e.g. "America/New_York"
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
type TaskPriority = 'P1' | 'P2' | 'P3';
type TaskSource = 'manual' | 'meeting' | 'chat' | 'email' | 'project';

interface Task {
  taskId: string;
  title: string;
  description: string;
  owner: string;          // email
  projectId: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;        // ISO date string YYYY-MM-DD
  created: string;        // ISO datetime
  source: TaskSource;
  sourceRef: string;      // URL or ID of the source (meeting doc, email thread, etc.)
  tasksApiId: string;     // Google Tasks API task ID
  approvalMessageId: string; // Chat message ID of the pending approval card
}

// ─── Projects ────────────────────────────────────────────────────────────────

type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed';

interface Project {
  projectId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  owner: string;          // email
  team: string[];         // emails
  startDate: string;
  targetDate: string;
  specDocUrl: string;
  driveFolderUrl: string;
  progressPct: number;
  lastUpdated: string;
  tasksListId?: string;   // Google Tasks tasklist ID, set during project setup
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
  payload: string;        // JSON-serialized action payload
  requestedBy: string;    // module name that requested the approval
  assignedTo: string;     // email of the approver
  chatSpaceId: string;
  chatMessageId: string;
  createdAt: string;      // ISO datetime
  expiresAt: string;      // ISO datetime (24h after creation)
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
  suggestedOwner: string;   // name or email extracted from text
  suggestedDueDate: string; // natural language or ISO date
  priority: TaskPriority;
  sourceText: string;       // verbatim excerpt that triggered this
}

interface ExtractedCalendarEvent {
  title: string;
  description: string;
  suggestedDate: string;    // natural language or ISO datetime
  suggestedDuration: number; // minutes
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
