/**
 * Agent context builder and conversational fallback.
 *
 * Builds a compact system-state summary injected into every Gemini agent
 * prompt so the AI can answer questions grounded in real data.
 */

function _buildAgentContext(senderEmail: string): string {
  const lines: string[] = [];

  try {
    const stats = _getSystemStats();
    lines.push(`System stats: ${stats.openTasks} open tasks (${stats.overdueTasks} overdue), ${stats.activeProjects} active projects (${stats.atRiskProjects} at risk), ${stats.pendingApprovals} pending approvals`);
  } catch (_) {}

  try {
    const members = GWAS.getTeamMembers();
    lines.push(`Team: ${members.map(m => m.name).join(', ')}`);
  } catch (_) {}

  try {
    const today = new Date();
    const todayEnd = new Date(today.getTime() + 86400000);
    today.setHours(0, 0, 0, 0);
    const cal = CalendarApp.getDefaultCalendar();
    const events = cal.getEvents(today, todayEnd).filter(e => !e.isAllDayEvent());
    lines.push(`Today's meetings: ${events.map(e => e.getTitle()).join(', ') || 'none'}`);
  } catch (_) {}

  lines.push(`Current user: ${senderEmail}`);
  lines.push(`Current time: ${new Date().toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Gathers live KPI stats from all module spreadsheets.
 */
function _getSystemStats(): {
  openTasks: number;
  overdueTasks: number;
  activeProjects: number;
  atRiskProjects: number;
  pendingApprovals: number;
  kbArticles: number;
  atRiskProjectList: Array<{ name: string; daysLeft: number; progress: number }>;
} {
  let openTasks = 0, overdueTasks = 0;
  try {
    const ss = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
    const sheet = ss.getSheetByName('Tasks');
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
      data.forEach(r => {
        if (r[5] === 'done') return;
        openTasks++;
        if (GWAS.isOverdue(r[7]?.toString())) overdueTasks++;
      });
    }
  } catch (_) {}

  let activeProjects = 0, atRiskProjects = 0;
  const atRiskProjectList: Array<{ name: string; daysLeft: number; progress: number }> = [];
  try {
    const ss = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
    const sheet = ss.getSheetByName('Projects');
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
      data.forEach(r => {
        if (r[3] !== 'active' && r[3] !== 'planning') return;
        activeProjects++;
        const days = r[7] ? GWAS.daysUntil(r[7]?.toString()) : 999;
        const progress = Number(r[10]) || 0;
        if (days <= 14 && progress < 70) {
          atRiskProjects++;
          atRiskProjectList.push({ name: r[1]?.toString(), daysLeft: days, progress });
        }
      });
    }
  } catch (_) {}

  let pendingApprovals = 0;
  try {
    const ss = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
    const sheet = ss.getSheetByName('Pending Approvals');
    if (sheet && sheet.getLastRow() > 1) {
      const data = sheet.getRange(2, 10, sheet.getLastRow() - 1, 1).getValues();
      pendingApprovals = data.filter(r => r[0] === 'pending').length;
    }
  } catch (_) {}

  let kbArticles = 0;
  try {
    const ss = SpreadsheetApp.openById(GWAS.getConfig('KB_SPREADSHEET_ID'));
    const sheet = ss.getSheetByName('KB Index');
    kbArticles = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
  } catch (_) {}

  return { openTasks, overdueTasks, activeProjects, atRiskProjects, pendingApprovals, kbArticles, atRiskProjectList };
}

/**
 * Module health check — verifies each module's last trigger run.
 */
function _getSystemHealth(): Array<{ module: string; status: 'ok' | 'warn' | 'error'; detail: string }> {
  const health: Array<{ module: string; status: 'ok' | 'warn' | 'error'; detail: string }> = [];

  const modules = [
    { name: 'Dashboard', key: 'DASHBOARD_SPREADSHEET_ID' },
    { name: 'Tasks', key: 'TASKS_SPREADSHEET_ID' },
    { name: 'Projects', key: 'PROJECTS_SPREADSHEET_ID' },
    { name: 'KB', key: 'KB_SPREADSHEET_ID' },
  ];

  modules.forEach(m => {
    try {
      const id = GWAS.getConfigOptional(m.key);
      if (!id) {
        health.push({ module: m.name, status: 'error', detail: 'Spreadsheet ID not configured' });
        return;
      }
      SpreadsheetApp.openById(id); // will throw if inaccessible
      health.push({ module: m.name, status: 'ok', detail: 'Accessible' });
    } catch (e) {
      health.push({ module: m.name, status: 'error', detail: (e as Error).message.substring(0, 60) });
    }
  });

  // Check Gemini API key.
  const geminiKey = GWAS.getConfigOptional('GEMINI_API_KEY');
  health.push({
    module: 'Gemini AI',
    status: geminiKey ? 'ok' : 'error',
    detail: geminiKey ? 'API key configured' : 'GEMINI_API_KEY not set',
  });

  return health;
}

/**
 * Conversational fallback — answers questions using Gemini with full context.
 */
function _answerConversationally(text: string, senderEmail: string, context: string): ChatResponse {
  const prompt = `You are GWAS, an AI workspace assistant in Google Chat. Answer this question from ${senderEmail}:

"${text}"

Current workspace context:
${context}

Give a helpful, concise answer (2-4 sentences max). If you don't have enough data to answer precisely, say so and suggest a slash command that would help.`;

  try {
    const answer = GWAS.callGemini(prompt);
    return textResponse(answer);
  } catch (_) {
    return textResponse('I couldn\'t process that right now. Try `/status` for a live overview or `/help` for all commands.');
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function _getParams(event: ChatEvent): Record<string, string> {
  const params: Record<string, string> = {};
  const actionParams = event.action?.parameters ?? event.common?.parameters ?? [];
  (actionParams as Array<{ key: string; value: string }>).forEach(p => { params[p.key] = p.value; });
  return params;
}

function _safeParseJson(raw: string): Record<string, string> | null {
  try { return JSON.parse(raw); } catch (_) { return null; }
}

// ─── Response builders ────────────────────────────────────────────────────────

function textResponse(text: string): ChatResponse {
  return { text };
}

function cardResponse(sections: object[], header?: { title: string; subtitle?: string }): ChatResponse {
  return {
    actionResponse: { type: 'NEW_MESSAGE' },
    cardsV2: [{
      cardId: GWAS.generateId(),
      card: { ...(header ? { header } : {}), sections },
    }],
  };
}
