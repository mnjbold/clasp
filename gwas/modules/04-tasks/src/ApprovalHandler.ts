/**
 * Handles incoming task-creation approvals from Google Chat.
 *
 * When a user clicks Approve/Reject on a Chat approval card, the card's
 * button opens a URL pointing to this module's web app deployment.
 * The doGet() handler processes the approval and responds.
 *
 * Deploy this script as a Web App (Execute as: Me, Access: Anyone with link)
 * and store the deployment URL in the APPROVAL_CALLBACK_URL script property.
 */

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.HTML.HtmlOutput {
  if (!e || !e.parameter) {
    return HtmlService.createHtmlOutput('<h2>This page must be accessed via an approval link.</h2>');
  }
  const approvalId = e.parameter['approvalId'];
  const action = e.parameter['action'] as 'approve' | 'reject';

  if (!approvalId || !action) {
    return HtmlService.createHtmlOutput('<h2>Invalid request.</h2>');
  }

  const approval = GWAS.getApproval(approvalId);
  if (!approval) {
    return HtmlService.createHtmlOutput('<h2>Approval not found or already processed.</h2>');
  }

  if (approval.status !== 'pending') {
    return HtmlService.createHtmlOutput(
      `<h2>This approval has already been ${approval.status}.</h2>`
    );
  }

  // Verify that the caller is the intended approver.
  const callerEmail = Session.getActiveUser().getEmail();
  if (!callerEmail || callerEmail !== approval.assignedTo) {
    return HtmlService.createHtmlOutput(
      '<h2>Access denied.</h2><p>This approval is not assigned to you.</p>'
    );
  }

  if (action === 'approve') {
    _executeApprovedAction(approval);
    GWAS.updateApprovalStatus(approvalId, 'approved');
    _notifyApprovalResult(approval, 'approved');
    return HtmlService.createHtmlOutput(
      `<h2>✅ Approved!</h2><p>The action has been executed. You can close this tab.</p>`
    );
  } else {
    GWAS.updateApprovalStatus(approvalId, 'rejected');
    _notifyApprovalResult(approval, 'rejected');
    return HtmlService.createHtmlOutput(
      `<h2>❌ Rejected.</h2><p>The action has been cancelled. You can close this tab.</p>`
    );
  }
}

function _executeApprovedAction(approval: PendingApproval): void {
  const payload = JSON.parse(approval.payload);

  switch (approval.actionType) {
    case 'CREATE_TASK': {
      const taskId = createTask({
        title: payload.title,
        description: payload.description,
        owner: payload.owner,
        projectId: payload.projectId,
        priority: payload.priority,
        dueDate: payload.dueDate,
        source: payload.source ?? 'meeting',
        sourceRef: payload.sourceRef,
      });
      GWAS.gwasLog('Tasks', 'INFO', `Approval ${approval.approvalId} → task ${taskId} created.`);
      break;
    }
    default:
      GWAS.gwasLog('Tasks', 'WARN', `Unknown action type in approval: ${approval.actionType}`);
  }
}

function _notifyApprovalResult(approval: PendingApproval, result: 'approved' | 'rejected'): void {
  const member = GWAS.getMemberByEmail(approval.assignedTo);
  if (!member) return;

  const payload = JSON.parse(approval.payload);
  const emoji = result === 'approved' ? '✅' : '❌';
  const verb = result === 'approved' ? 'approved and created' : 'rejected';

  GWAS.sendDirectMessage(
    member,
    `${emoji} Task "${payload.title}" has been ${verb}.`
  );
}

/**
 * Requests approval to create a task. Sends an interactive Chat card to the
 * assignee and stores the pending approval record.
 *
 * Called by Module 03 (Meeting Notes) and Module 07 (KB) when they extract
 * action items from content.
 */
function requestTaskCreationApproval(params: {
  title: string;
  description: string;
  suggestedOwner: string;
  suggestedDueDate: string;
  priority: TaskPriority;
  source: TaskSource;
  sourceRef: string;
  approverEmail: string;
}): void {
  const approver = GWAS.getMemberByEmail(params.approverEmail);
  if (!approver) {
    // No approver found — create task directly without approval.
    GWAS.gwasLog('Tasks', 'WARN', `No approver found for ${params.approverEmail} — creating task directly.`);
    createTask({
      title: params.title,
      description: params.description,
      owner: params.suggestedOwner,
      priority: params.priority,
      dueDate: params.suggestedDueDate,
      source: params.source,
      sourceRef: params.sourceRef,
    });
    return;
  }

  const callbackUrl = GWAS.getConfigOptional('APPROVAL_CALLBACK_URL') ?? '';
  const payload = {
    title: params.title,
    description: params.description,
    owner: params.suggestedOwner,
    priority: params.priority,
    dueDate: params.suggestedDueDate,
    source: params.source,
    sourceRef: params.sourceRef,
  };

  // Send the approval card first to get the message ID.
  const tempApprovalId = GWAS.generateId();
  const msgName = GWAS.sendApprovalCard({
    member: approver,
    approvalId: tempApprovalId,
    actionType: 'CREATE_TASK',
    title: `New task: ${params.title}`,
    summary: params.description || 'No description provided.',
    details: [
      { label: 'Suggested Owner', value: params.suggestedOwner || 'Unassigned' },
      { label: 'Priority', value: params.priority },
      { label: 'Due Date', value: params.suggestedDueDate || 'Not set' },
      { label: 'Source', value: `${params.source} — ${params.sourceRef}` },
    ],
    callbackBaseUrl: callbackUrl,
  });

  // Persist the approval record using the same ID that was embedded in the card URL.
  GWAS.createApproval({
    approvalId: tempApprovalId,
    actionType: 'CREATE_TASK',
    payload,
    requestedBy: 'module-03-meeting-notes',
    assignedTo: params.approverEmail,
    chatSpaceId: approver.chatDmSpaceId,
    chatMessageId: msgName,
  });

  GWAS.gwasLog('Tasks', 'INFO', `Task approval card sent to ${params.approverEmail}: "${params.title}"`);
}
