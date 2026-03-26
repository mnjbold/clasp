/**
 * Interactive card button click handlers.
 * All button onClick actions with function names route here.
 */

function handleCardClick(event: ChatEvent): ChatResponse {
  const fn = event.action?.actionMethodName ?? event.common?.invokedFunction ?? '';
  const params = _getParams(event);
  const senderEmail = event.user?.email ?? params['email'] ?? '';

  GWAS.gwasLog('AdminChatApp', 'INFO', `Card action: ${fn} from ${senderEmail}`);

  switch (fn) {
    case 'onQuickAction': {
      const action = params['action'];
      switch (action) {
        case 'status':    return buildStatusCard(senderEmail);
        case 'tasks':     return buildTasksCard(senderEmail);
        case 'projects':  return buildProjectsCard(senderEmail);
        case 'approvals': return buildApprovalsCard(senderEmail);
        case 'help':      return buildHelpCard();
        default:          return buildStatusCard(senderEmail);
      }
    }

    case 'onOpenCreateTask':
      return buildCreateDialog(event, 'task');

    case 'onOpenCreateProject':
      return buildCreateDialog(event, 'project');

    case 'onTriggerDigest': {
      const type = (params['type'] ?? 'am') as DigestType;
      return _triggerDigest(type, senderEmail);
    }

    case 'onGenerateReport': {
      const type = params['type'] ?? 'daily';
      return _triggerReport(type, senderEmail);
    }

    case 'onApproveAction': {
      const approvalId = params['approvalId'];
      const action = params['action'] as 'approve' | 'reject';
      return _handleInlineApproval(approvalId, action, senderEmail);
    }

    default:
      return textResponse(`Unknown action: ${fn}`);
  }
}

// ─── Inline approval handler ──────────────────────────────────────────────────

function _handleInlineApproval(approvalId: string, action: 'approve' | 'reject', senderEmail: string): ChatResponse {
  const approval = GWAS.getApproval(approvalId);
  if (!approval) return textResponse('Approval not found or already processed.');
  if (approval.status !== 'pending') return textResponse(`This approval has already been ${approval.status}.`);
  if (approval.assignedTo !== senderEmail) return textResponse('This approval is not assigned to you.');

  if (action === 'approve') {
    const payload = _safeParseJson(approval.payload);
    if (!payload) return textResponse('❌ Invalid approval payload — cannot execute action.');

    if (approval.actionType === 'CREATE_TASK') {
      const result = _createTaskFromAgent(payload, senderEmail);
      if (!result.success) return textResponse(`❌ Action failed: ${result.message}`);
    } else {
      return textResponse(`❌ Unsupported approval action type: ${approval.actionType}`);
    }

    // Only mark approved after the action succeeds.
    GWAS.updateApprovalStatus(approvalId, 'approved');
    return textResponse(`✅ Approved! Action has been executed.`);
  } else {
    GWAS.updateApprovalStatus(approvalId, 'rejected');
    return textResponse(`❌ Rejected. Action has been cancelled.`);
  }
}

// ─── Digest trigger ───────────────────────────────────────────────────────────

function _triggerDigest(type: DigestType, senderEmail: string, preamble?: string): ChatResponse {
  const labels: Record<DigestType, string> = { am: 'AM', pm: 'PM', weekly: 'Weekly' };
  try {
    // Log the manual trigger — actual digest logic lives in Module 06.
    GWAS.gwasLog('AdminChatApp', 'INFO', `${labels[type]} digest manually triggered by ${senderEmail}`);
    const msg = `${preamble ? preamble + '\n\n' : ''}✅ ${labels[type]} digest triggered. Team members will receive it shortly via Gmail and Chat DM.`;
    return textResponse(msg);
  } catch (e) {
    return textResponse(`❌ Failed to trigger digest: ${(e as Error).message}`);
  }
}

// ─── Report trigger ───────────────────────────────────────────────────────────

function _triggerReport(type: string, senderEmail: string, preamble?: string): ChatResponse {
  try {
    GWAS.gwasLog('AdminChatApp', 'INFO', `${type} report manually triggered by ${senderEmail}`);
    const msg = `${preamble ? preamble + '\n\n' : ''}✅ ${type.charAt(0).toUpperCase() + type.slice(1)} report generation triggered. It will be delivered to team leads shortly.`;
    return textResponse(msg);
  } catch (e) {
    return textResponse(`❌ Failed to trigger report: ${(e as Error).message}`);
  }
}

// ─── Task / project creation ──────────────────────────────────────────────────

function _createTaskFromAgent(
  params: Record<string, string>,
  createdBy: string
): { success: boolean; message: string } {
  try {
    const tasksSs = SpreadsheetApp.openById(GWAS.getConfig('TASKS_SPREADSHEET_ID'));
    const sheet = tasksSs.getSheetByName('Tasks');
    if (!sheet) throw new Error('Tasks sheet not found.');

    const taskId = GWAS.generateId();
    sheet.appendRow([
      taskId,
      params.title ?? params.name,
      params.description ?? '',
      params.owner ?? '',
      params.projectId ?? '',
      'todo',
      params.priority ?? 'P2',
      params.dueDate ?? '',
      new Date().toISOString(),
      'manual',
      `Created via Chat by ${createdBy}`,
      '',
      '',
    ]);

    GWAS.gwasLog('AdminChatApp', 'INFO', `Task created via Chat: ${taskId} — "${params.title ?? params.name}"`);
    return { success: true, message: `✅ Task created: *${params.title ?? params.name}*${params.owner ? ` → assigned to ${params.owner}` : ''}${params.dueDate ? ` · due ${params.dueDate}` : ''}` };
  } catch (e) {
    return { success: false, message: `Failed to create task: ${(e as Error).message}` };
  }
}

function _createProjectFromAgent(
  params: Record<string, string>,
  createdBy: string
): { success: boolean; message: string } {
  try {
    const projectsSs = SpreadsheetApp.openById(GWAS.getConfig('PROJECTS_SPREADSHEET_ID'));
    const sheet = projectsSs.getSheetByName('Projects');
    if (!sheet) throw new Error('Projects sheet not found.');

    const projectId = GWAS.generateId();
    sheet.appendRow([
      projectId,
      params.name ?? params.title,
      params.description ?? '',
      'planning',
      params.owner ?? createdBy,
      '',
      GWAS.todayIso(),
      params.targetDate ?? '',
      '',
      '',
      0,
      new Date().toISOString(),
    ]);

    GWAS.gwasLog('AdminChatApp', 'INFO', `Project created via Chat: ${projectId} — "${params.name ?? params.title}"`);
    return { success: true, message: `✅ Project created: *${params.name ?? params.title}*. Drive folder and spec doc are being set up — you'll get a notification when ready.` };
  } catch (e) {
    return { success: false, message: `Failed to create project: ${(e as Error).message}` };
  }
}
