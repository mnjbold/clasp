/**
 * Persistent store for pending approval records.
 *
 * Approvals are written to a "Pending Approvals" sheet in the Dashboard
 * spreadsheet. Each module that requests an approval writes a row here;
 * the approval callback handler reads and updates it.
 *
 * Columns: Approval ID | Action Type | Payload (JSON) | Requested By |
 *          Assigned To | Chat Space ID | Chat Message ID | Created At |
 *          Expires At | Status
 */

const APPROVALS_SHEET_NAME = 'Pending Approvals';

// Column indices (1-based)
const COL = {
  APPROVAL_ID: 1,
  ACTION_TYPE: 2,
  PAYLOAD: 3,
  REQUESTED_BY: 4,
  ASSIGNED_TO: 5,
  CHAT_SPACE_ID: 6,
  CHAT_MESSAGE_ID: 7,
  CREATED_AT: 8,
  EXPIRES_AT: 9,
  STATUS: 10,
} as const;

function _getApprovalsSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ssId = getConfig('DASHBOARD_SPREADSHEET_ID');
  const ss = SpreadsheetApp.openById(ssId);
  let sheet = ss.getSheetByName(APPROVALS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(APPROVALS_SHEET_NAME);
    const headers = [
      'Approval ID', 'Action Type', 'Payload (JSON)', 'Requested By',
      'Assigned To', 'Chat Space ID', 'Chat Message ID',
      'Created At', 'Expires At', 'Status',
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#fff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Creates a new pending approval record and returns the approvalId.
 */
function createApproval(params: {
  actionType: ApprovalActionType;
  payload: object;
  requestedBy: string;
  assignedTo: string;
  chatSpaceId: string;
  chatMessageId: string;
}): string {
  const approvalId = generateId();
  const now = new Date();
  const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

  const sheet = _getApprovalsSheet();
  sheet.appendRow([
    approvalId,
    params.actionType,
    JSON.stringify(params.payload),
    params.requestedBy,
    params.assignedTo,
    params.chatSpaceId,
    params.chatMessageId,
    now.toISOString(),
    expires.toISOString(),
    'pending',
  ]);

  return approvalId;
}

/**
 * Retrieves a pending approval by ID. Returns null if not found.
 */
function getApproval(approvalId: string): PendingApproval | null {
  const sheet = _getApprovalsSheet();
  const row = findRowByValue(sheet, COL.APPROVAL_ID, approvalId);
  if (row === -1) return null;

  const data = sheet.getRange(row, 1, 1, 10).getValues()[0] as string[];
  return {
    approvalId: data[0],
    actionType: data[1] as ApprovalActionType,
    payload: data[2],
    requestedBy: data[3],
    assignedTo: data[4],
    chatSpaceId: data[5],
    chatMessageId: data[6],
    createdAt: data[7],
    expiresAt: data[8],
    status: data[9] as ApprovalStatus,
  };
}

/**
 * Updates the status of an approval record.
 */
function updateApprovalStatus(approvalId: string, status: ApprovalStatus): void {
  const sheet = _getApprovalsSheet();
  const row = findRowByValue(sheet, COL.APPROVAL_ID, approvalId);
  if (row === -1) {
    gwasLog('ApprovalsStore', 'WARN', `Approval ${approvalId} not found for status update.`);
    return;
  }
  sheet.getRange(row, COL.STATUS).setValue(status);
}

/**
 * Expires all pending approvals older than 24 hours.
 * Run via a daily time-based trigger.
 */
function expireOldApprovals(): void {
  const sheet = _getApprovalsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const now = new Date();
  const data = sheet.getRange(2, 1, lastRow - 1, 10).getValues() as string[][];

  data.forEach((row, i) => {
    if (row[COL.STATUS - 1] !== 'pending') return;
    const expires = new Date(row[COL.EXPIRES_AT - 1]);
    if (now > expires) {
      sheet.getRange(i + 2, COL.STATUS).setValue('expired');
      gwasLog('ApprovalsStore', 'INFO', `Approval ${row[0]} expired.`);
    }
  });
}
