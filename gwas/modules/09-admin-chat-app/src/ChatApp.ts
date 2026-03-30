/**
 * GWAS Admin Chat App — entry point.
 *
 * Google Chat calls onMessage() for every event directed at this app:
 * - Direct messages to the bot
 * - @mentions in spaces
 * - Slash command invocations
 * - Interactive card button clicks (ACTION_RESPONSE)
 * - Dialog submissions
 *
 * The app acts as a conversational AI agent: natural language messages
 * are routed to the Gemini agent which decides what action to take and
 * returns a structured response. Slash commands provide fast-path access
 * to common operations without needing to type natural language.
 *
 * Slash commands (configured in Google Cloud Console → Chat API):
 *   /status      — System health + live KPI dashboard card
 *   /tasks       — Your open tasks + team overdue summary
 *   /projects    — Active projects status
 *   /digest      — Trigger AM or PM digest now
 *   /create      — Create task or project via dialog
 *   /search      — Search the knowledge base
 *   /report      — Generate and send a report now
 *   /approve     — List pending approvals
 *   /help        — Show all commands
 */

// Slash command IDs — must match what's configured in Google Cloud Console.
const CMD = {
  STATUS:   1,
  TASKS:    2,
  PROJECTS: 3,
  DIGEST:   4,
  CREATE:   5,
  SEARCH:   6,
  REPORT:   7,
  APPROVE:  8,
  HELP:     9,
} as const;

/**
 * Main Chat App event handler.
 * Apps Script calls this function for every Chat event.
 */
function onMessage(event: ChatEvent): ChatResponse {
  try {
    const eventType = event.type;

    // Card button click / interactive callback.
    if (eventType === 'CARD_CLICKED') {
      return handleCardClick(event);
    }

    // Dialog submission.
    if (event.isDialogEvent && event.dialogEventType === 'SUBMIT_DIALOG') {
      return handleDialogSubmit(event);
    }

    // Slash command.
    if (event.message?.slashCommand) {
      return handleSlashCommand(event);
    }

    // Natural language message — route to AI agent.
    if (event.message?.text) {
      return handleNaturalLanguage(event);
    }

    // Bot added to a space.
    if (eventType === 'ADDED_TO_SPACE') {
      return buildWelcomeResponse(event);
    }

    return textResponse('I didn\'t understand that event type. Try `/help` to see what I can do.');
  } catch (e) {
    GWAS.gwasLog('AdminChatApp', 'ERROR', `Chat event handler error: ${(e as Error).message}`);
    return textResponse(`⚠️ Something went wrong: ${(e as Error).message}`);
  }
}

// ─── Slash command router ─────────────────────────────────────────────────────

function handleSlashCommand(event: ChatEvent): ChatResponse {
  const cmdId = event.message?.slashCommand?.commandId;
  const senderEmail = event.user?.email ?? '';
  const spaceId = event.space?.name?.replace('spaces/', '') ?? '';

  GWAS.gwasLog('AdminChatApp', 'INFO', `Slash command ${cmdId} from ${senderEmail}`);

  switch (cmdId) {
    case CMD.STATUS:   return buildStatusCard(senderEmail);
    case CMD.TASKS:    return buildTasksCard(senderEmail);
    case CMD.PROJECTS: return buildProjectsCard(senderEmail);
    case CMD.DIGEST:   return buildDigestTriggerCard(senderEmail);
    case CMD.CREATE:   return buildCreateDialog(event);
    case CMD.SEARCH:   return buildSearchDialog(event);
    case CMD.REPORT:   return buildReportCard(senderEmail);
    case CMD.APPROVE:  return buildApprovalsCard(senderEmail);
    case CMD.HELP:     return buildHelpCard();
    default:           return textResponse('Unknown command. Try `/help`.');
  }
}

// ─── Natural language AI agent ────────────────────────────────────────────────

/**
 * Routes free-text messages through Gemini to determine intent and
 * execute the appropriate action. This is the conversational agent core.
 */
function handleNaturalLanguage(event: ChatEvent): ChatResponse {
  const text = (event.message?.text ?? '').replace(/^@GWAS\s*/i, '').trim();
  const senderEmail = event.user?.email ?? '';
  const senderName = event.user?.displayName ?? senderEmail;

  if (!text) return buildHelpCard();

  GWAS.gwasLog('AdminChatApp', 'INFO', `NL message from ${senderEmail}: "${text.substring(0, 80)}"`);

  // Build agent context: current system state for grounding.
  const context = _buildAgentContext(senderEmail);

  const agentPrompt = `You are GWAS, an AI workspace assistant embedded in Google Chat.
The user "${senderName}" (${senderEmail}) sent you this message: "${text}"

Current system context:
${context}

Determine the user's intent and respond with a JSON object:
{
  "intent": one of: "show_status" | "show_tasks" | "show_projects" | "create_task" | "create_project" | "search_kb" | "trigger_digest" | "show_approvals" | "generate_report" | "answer_question" | "unknown",
  "parameters": {
    // For create_task: { "title": string, "owner": string, "priority": "P1"|"P2"|"P3", "dueDate": string, "description": string }
    // For create_project: { "name": string, "description": string, "owner": string, "targetDate": string }
    // For search_kb: { "query": string }
    // For trigger_digest: { "type": "am"|"pm"|"weekly" }
    // For generate_report: { "type": "daily"|"weekly"|"monthly" }
    // For answer_question: { "answer": string }
    // Others: {}
  },
  "reply": "A short, friendly 1-2 sentence reply to show the user what you're doing"
}`;

  let agentDecision: {
    intent: string;
    parameters: Record<string, string>;
    reply: string;
  };

  try {
    agentDecision = GWAS.callGeminiStructured(agentPrompt);
  } catch (e) {
    return textResponse(`I had trouble understanding that. Try a slash command like \`/help\` to see what I can do.`);
  }

  // Execute the intent.
  const { intent, parameters, reply } = agentDecision;

  switch (intent) {
    case 'show_status':
      return buildStatusCard(senderEmail, reply);

    case 'show_tasks':
      return buildTasksCard(senderEmail, reply);

    case 'show_projects':
      return buildProjectsCard(senderEmail, reply);

    case 'show_approvals':
      return buildApprovalsCard(senderEmail, reply);

    case 'create_task': {
      if (parameters.title) {
        const result = _createTaskFromAgent(parameters, senderEmail);
        return cardResponse(
          [{ widgets: [{ textParagraph: { text: result.message } }] }],
          { title: result.success ? '✅ Task Created' : '❌ Task Creation Failed' },
        );
      }
      // Not enough info — open dialog.
      return buildCreateDialog(event, 'task', parameters);
    }

    case 'create_project': {
      if (parameters.name && parameters.description) {
        const result = _createProjectFromAgent(parameters, senderEmail);
        return cardResponse(
          [{ widgets: [{ textParagraph: { text: result.message } }] }],
          { title: result.success ? '✅ Project Created' : '❌ Project Creation Failed' },
        );
      }
      return buildCreateDialog(event, 'project', parameters);
    }

    case 'search_kb': {
      if (parameters.query) {
        return buildKbSearchResults(parameters.query, reply);
      }
      return buildSearchDialog(event);
    }

    case 'trigger_digest':
      return _triggerDigest(parameters.type as DigestType ?? 'am', senderEmail, reply);

    case 'generate_report':
      return _triggerReport(parameters.type ?? 'daily', senderEmail, reply);

    case 'answer_question':
      return textResponse(parameters.answer || reply);

    default:
      // Fallback: answer conversationally using full context.
      return _answerConversationally(text, senderEmail, context);
  }
}

// ─── Card builders ────────────────────────────────────────────────────────────

function buildStatusCard(senderEmail: string, preamble?: string): ChatResponse {
  const stats = _getSystemStats();
  const health = _getSystemHealth();

  const sections: object[] = [];

  if (preamble) {
    sections.push({ widgets: [{ textParagraph: { text: `<i>${preamble}</i>` } }] });
  }

  // KPI row.
  sections.push({
    header: '📊 Live System Status',
    widgets: [
      { decoratedText: { topLabel: 'Open Tasks', text: String(stats.openTasks), bottomLabel: `${stats.overdueTasks} overdue` } },
      { decoratedText: { topLabel: 'Active Projects', text: String(stats.activeProjects), bottomLabel: `${stats.atRiskProjects} at risk` } },
      { decoratedText: { topLabel: 'Pending Approvals', text: String(stats.pendingApprovals), bottomLabel: 'awaiting action' } },
      { decoratedText: { topLabel: 'KB Articles', text: String(stats.kbArticles), bottomLabel: 'indexed' } },
    ],
  });

  // Health indicators.
  sections.push({
    header: '🩺 Module Health',
    widgets: health.map(h => ({
      decoratedText: {
        topLabel: h.module,
        text: h.status === 'ok' ? '✅ Operational' : h.status === 'warn' ? '⚠️ Warning' : '❌ Error',
        bottomLabel: h.detail,
      },
    })),
  });

  // At-risk projects.
  if (stats.atRiskProjectList.length > 0) {
    sections.push({
      header: '⚠️ At-Risk Projects',
      widgets: stats.atRiskProjectList.map(p => ({
        decoratedText: {
          topLabel: `${p.daysLeft}d left · ${p.progress}% done`,
          text: p.name,
        },
      })),
    });
  }

  // Quick actions.
  sections.push({
    widgets: [{
      buttonList: {
        buttons: [
          { text: '📋 Tasks', onClick: { action: { function: 'onQuickAction', parameters: [{ key: 'action', value: 'tasks' }, { key: 'email', value: senderEmail }] } } },
          { text: '🚀 Projects', onClick: { action: { function: 'onQuickAction', parameters: [{ key: 'action', value: 'projects' }, { key: 'email', value: senderEmail }] } } },
          { text: '⏳ Approvals', onClick: { action: { function: 'onQuickAction', parameters: [{ key: 'action', value: 'approvals' }, { key: 'email', value: senderEmail }] } } },
          { text: '🔄 Refresh', onClick: { action: { function: 'onQuickAction', parameters: [{ key: 'action', value: 'status' }, { key: 'email', value: senderEmail }] } } },
        ],
      },
    }],
  });

  return cardResponse(sections);
}

function buildTasksCard(senderEmail: string, preamble?: string): ChatResponse {
  const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
  const sheet = tasksSs.getSheetByName('Tasks');
  const today = GWAS.todayIso();

  const myTasks: Array<{ title: string; status: string; priority: string; due: string; project: string }> = [];
  const teamOverdue: Array<{ title: string; owner: string; due: string }> = [];

  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
    data.forEach(r => {
      if (!r[0]) return;
      const status = r[5]?.toString();
      const due = r[7]?.toString();
      const owner = r[3]?.toString();
      if (status === 'done') return;

      if (owner === senderEmail) {
        myTasks.push({ title: r[1]?.toString(), status, priority: r[6]?.toString(), due, project: r[4]?.toString() });
      }
      if (GWAS.isOverdue(due)) {
        teamOverdue.push({ title: r[1]?.toString(), owner, due });
      }
    });
  }

  const sections: object[] = [];
  if (preamble) sections.push({ widgets: [{ textParagraph: { text: `<i>${preamble}</i>` } }] });

  const overdue = myTasks.filter(t => GWAS.isOverdue(t.due));
  const dueToday = myTasks.filter(t => t.due === today);
  const rest = myTasks.filter(t => !GWAS.isOverdue(t.due) && t.due !== today);

  if (overdue.length > 0) {
    sections.push({
      header: `🔴 Your Overdue (${overdue.length})`,
      widgets: overdue.slice(0, 5).map(t => ({
        decoratedText: { topLabel: `${t.priority} · due ${t.due}`, text: t.title, bottomLabel: t.project || 'No project' },
      })),
    });
  }

  if (dueToday.length > 0) {
    sections.push({
      header: `🟡 Due Today (${dueToday.length})`,
      widgets: dueToday.slice(0, 5).map(t => ({
        decoratedText: { topLabel: t.priority, text: t.title },
      })),
    });
  }

  if (rest.length > 0) {
    sections.push({
      header: `📋 Upcoming (${rest.length})`,
      widgets: rest.slice(0, 4).map(t => ({
        decoratedText: { topLabel: `${t.priority} · due ${t.due || 'no date'}`, text: t.title },
      })),
    });
  }

  if (teamOverdue.length > 0) {
    sections.push({
      header: `⚠️ Team Overdue (${teamOverdue.length} total)`,
      widgets: teamOverdue.slice(0, 4).map(t => ({
        decoratedText: { topLabel: t.owner, text: t.title, bottomLabel: `due ${t.due}` },
      })),
    });
  }

  sections.push({
    widgets: [{
      buttonList: {
        buttons: [
          { text: '➕ New Task', onClick: { action: { function: 'onOpenCreateTask', parameters: [{ key: 'email', value: senderEmail }] } } },
          { text: '📊 Dashboard', onClick: { openLink: { url: `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('TASKS_SPREADSHEET_ID')}` } } },
        ],
      },
    }],
  });

  if (sections.length === (preamble ? 1 : 0)) {
    sections.push({ widgets: [{ textParagraph: { text: '🎉 No open tasks! You\'re all caught up.' } }] });
  }

  return cardResponse(sections);
}

function buildProjectsCard(senderEmail: string, preamble?: string): ChatResponse {
  const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
  const sheet = projectsSs.getSheetByName('Projects');
  const sections: object[] = [];

  if (preamble) sections.push({ widgets: [{ textParagraph: { text: `<i>${preamble}</i>` } }] });

  if (!sheet || sheet.getLastRow() < 2) {
    sections.push({ widgets: [{ textParagraph: { text: 'No projects found.' } }] });
    return cardResponse(sections);
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  const active = data.filter(r => r[3] === 'active' || r[3] === 'planning');
  const atRisk = active.filter(r => {
    const days = r[7] ? GWAS.daysUntil(r[7]?.toString()) : 999;
    return days <= 14 && Number(r[10]) < 70;
  });

  if (atRisk.length > 0) {
    sections.push({
      header: `🚨 At Risk (${atRisk.length})`,
      widgets: atRisk.map(r => ({
        decoratedText: {
          topLabel: `${GWAS.daysUntil(r[7]?.toString())}d left · ${r[10]}% done`,
          text: r[1]?.toString(),
          bottomLabel: `Owner: ${r[4]?.toString()}`,
          button: { text: 'Spec', onClick: { openLink: { url: r[8]?.toString() || '#' } } },
        },
      })),
    });
  }

  const onTrack = active.filter(r => !atRisk.includes(r));
  if (onTrack.length > 0) {
    sections.push({
      header: `✅ On Track (${onTrack.length})`,
      widgets: onTrack.slice(0, 6).map(r => ({
        decoratedText: {
          topLabel: `${r[3]} · ${r[10]}% done`,
          text: r[1]?.toString(),
          bottomLabel: r[7] ? `Target: ${r[7]}` : 'No deadline',
        },
      })),
    });
  }

  sections.push({
    widgets: [{
      buttonList: {
        buttons: [
          { text: '🚀 New Project', onClick: { action: { function: 'onOpenCreateProject', parameters: [{ key: 'email', value: senderEmail }] } } },
          { text: '📊 Projects Sheet', onClick: { openLink: { url: `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('PROJECTS_SPREADSHEET_ID')}` } } },
        ],
      },
    }],
  });

  return cardResponse(sections);
}

function buildApprovalsCard(senderEmail: string, preamble?: string): ChatResponse {
  const dashSs = SpreadsheetApp.openById(GWAS.getConfig('DASHBOARD_SPREADSHEET_ID'));
  const sheet = dashSs.getSheetByName('Pending Approvals');
  const sections: object[] = [];

  if (preamble) sections.push({ widgets: [{ textParagraph: { text: `<i>${preamble}</i>` } }] });

  if (!sheet || sheet.getLastRow() < 2) {
    sections.push({ widgets: [{ textParagraph: { text: '✅ No pending approvals.' } }] });
    return cardResponse(sections);
  }

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  const pending = data.filter(r => r[9] === 'pending' && r[4] === senderEmail);
  const allPending = data.filter(r => r[9] === 'pending');

  if (pending.length === 0 && allPending.length === 0) {
    sections.push({ widgets: [{ textParagraph: { text: '✅ No pending approvals.' } }] });
    return cardResponse(sections);
  }

  if (pending.length > 0) {
    sections.push({
      header: `⏳ Your Pending Approvals (${pending.length})`,
      widgets: pending.slice(0, 6).map(r => {
        const payload = _safeParseJson(r[2]?.toString());
        const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
        return {
          decoratedText: {
            topLabel: r[1]?.toString().replace(/_/g, ' '),
            text: payload?.title ?? r[0]?.toString(),
            bottomLabel: `Expires: ${new Date(r[8]?.toString()).toLocaleString()}`,
          },
          ...(callbackUrl ? {
            button: {
              text: 'Review',
              onClick: { openLink: { url: `${callbackUrl}?approvalId=${r[0]}` } },
            },
          } : {}),
        };
      }),
    });
  }

  if (allPending.length > pending.length) {
    sections.push({
      header: `📋 All Team Pending (${allPending.length})`,
      widgets: allPending.slice(0, 4).map(r => {
        const payload = _safeParseJson(r[2]?.toString());
        return {
          decoratedText: {
            topLabel: `${r[1]?.toString().replace(/_/g, ' ')} → ${r[4]}`,
            text: payload?.title ?? r[0]?.toString(),
          },
        };
      }),
    });
  }

  return cardResponse(sections);
}

function buildDigestTriggerCard(senderEmail: string): ChatResponse {
  return cardResponse([{
    widgets: [{
      buttonList: {
        buttons: [
          { text: '☀️ AM Digest', onClick: { action: { function: 'onTriggerDigest', parameters: [{ key: 'type', value: 'am' }, { key: 'email', value: senderEmail }] } } },
          { text: '🌙 PM Digest', onClick: { action: { function: 'onTriggerDigest', parameters: [{ key: 'type', value: 'pm' }, { key: 'email', value: senderEmail }] } } },
          { text: '📊 Weekly', onClick: { action: { function: 'onTriggerDigest', parameters: [{ key: 'type', value: 'weekly' }, { key: 'email', value: senderEmail }] } } },
        ],
      },
    }],
  }], { title: '📬 Trigger Digest', subtitle: 'Send a digest now' });
}

function buildReportCard(senderEmail: string): ChatResponse {
  return cardResponse([{
    widgets: [{
      buttonList: {
        buttons: [
          { text: '📅 Daily', onClick: { action: { function: 'onGenerateReport', parameters: [{ key: 'type', value: 'daily' }, { key: 'email', value: senderEmail }] } } },
          { text: '📋 Weekly', onClick: { action: { function: 'onGenerateReport', parameters: [{ key: 'type', value: 'weekly' }, { key: 'email', value: senderEmail }] } } },
          { text: '📊 Monthly', onClick: { action: { function: 'onGenerateReport', parameters: [{ key: 'type', value: 'monthly' }, { key: 'email', value: senderEmail }] } } },
        ],
      },
    }],
  }], { title: '📊 Generate Report', subtitle: 'Choose report type' });
}

function buildKbSearchResults(query: string, preamble?: string): ChatResponse {
  const kbSsId = GWAS.getConfig('KB_SPREADSHEET_ID');
  const kbSs = SpreadsheetApp.openById(kbSsId);
  const sheet = kbSs.getSheetByName('KB Index');
  const sections: object[] = [];

  if (preamble) sections.push({ widgets: [{ textParagraph: { text: `<i>${preamble}</i>` } }] });

  if (!sheet || sheet.getLastRow() < 2) {
    sections.push({ widgets: [{ textParagraph: { text: 'Knowledge base is empty. Run indexing first.' } }] });
    return cardResponse(sections);
  }

  const queryEmbedding = GWAS.getEmbedding(query);
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();

  const scored = data
    .filter(r => r[0] && r[6])
    .map(r => {
      let score = 0;
      try { score = GWAS.cosineSimilarity(queryEmbedding, JSON.parse(r[6]?.toString())); } catch (_) {}
      return { title: r[1]?.toString(), source: r[2]?.toString(), url: r[3]?.toString(), summary: r[4]?.toString(), score };
    })
    .filter(r => r.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (scored.length === 0) {
    sections.push({ widgets: [{ textParagraph: { text: `No results found for "${query}". Try different keywords.` } }] });
    return cardResponse(sections);
  }

  const sourceIcons: Record<string, string> = { drive: '📄', gmail: '📧', calendar: '📅', meeting_notes: '📝', chat: '💬' };

  sections.push({
    header: `🧠 KB Results for "${query}" (${scored.length})`,
    widgets: scored.map(r => ({
      decoratedText: {
        topLabel: `${sourceIcons[r.source] ?? '📌'} ${r.source} · ${Math.round(r.score * 100)}% match`,
        text: r.title,
        bottomLabel: r.summary.substring(0, 80) + '…',
        button: { text: 'Open', onClick: { openLink: { url: r.url } } },
      },
    })),
  });

  return cardResponse(sections);
}

function buildHelpCard(): ChatResponse {
  return cardResponse([
    {
      header: 'Slash Commands',
      widgets: [
        { decoratedText: { topLabel: '/status', text: 'Live system dashboard — KPIs, health, at-risk projects' } },
        { decoratedText: { topLabel: '/tasks', text: 'Your open tasks + team overdue summary' } },
        { decoratedText: { topLabel: '/projects', text: 'Active projects status + at-risk alerts' } },
        { decoratedText: { topLabel: '/approve', text: 'List and act on pending approvals' } },
        { decoratedText: { topLabel: '/create', text: 'Create a task or project via dialog' } },
        { decoratedText: { topLabel: '/search [query]', text: 'Semantic search across the knowledge base' } },
        { decoratedText: { topLabel: '/digest', text: 'Trigger AM, PM, or weekly digest now' } },
        { decoratedText: { topLabel: '/report', text: 'Generate daily, weekly, or monthly report' } },
      ],
    },
    {
      header: 'Natural Language',
      widgets: [{
        textParagraph: {
          text: 'Just talk to me naturally:\n\u2022 "Show me overdue tasks for Alice"\n\u2022 "Create a task: update API docs, owner Bob, due Friday"\n\u2022 "What projects are at risk?"\n\u2022 "Search for meeting notes about Q4 planning"\n\u2022 "Trigger the PM digest"\n\u2022 "How many tasks were completed this week?"',
        },
      }],
    },
    {
      widgets: [{
        buttonList: {
          buttons: [
            { text: '📊 Dashboard', onClick: { openLink: { url: `https://docs.google.com/spreadsheets/d/${GWAS.getConfig('DASHBOARD_SPREADSHEET_ID')}` } } },
          ],
        },
      }],
    },
  ], { title: '🤖 GWAS Admin Assistant', subtitle: 'Your AI workspace command center' });
}

function buildWelcomeResponse(event: ChatEvent): ChatResponse {
  const spaceName = event.space?.displayName ?? 'this space';
  return cardResponse([{
    widgets: [{
      textParagraph: {
        text: 'I\'m your AI workspace assistant. I can manage tasks, projects, approvals, digests, reports, and your knowledge base — all from Chat.\n\nType `/help` to see everything I can do, or just ask me anything naturally.',
      },
    }, {
      buttonList: {
        buttons: [
          { text: '📊 /status', onClick: { action: { function: 'onQuickAction', parameters: [{ key: 'action', value: 'status' }, { key: 'email', value: event.user?.email ?? '' }] } } },
          { text: '❓ /help', onClick: { action: { function: 'onQuickAction', parameters: [{ key: 'action', value: 'help' }, { key: 'email', value: event.user?.email ?? '' }] } } },
        ],
      },
    }],
  }], { title: '👋 GWAS is here!', subtitle: `Connected to ${spaceName}` });
}
