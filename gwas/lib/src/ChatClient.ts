/**
 * Google Chat API client.
 *
 * Sends messages and interactive approval cards to Chat spaces and DMs.
 * Uses the Chat REST API v1 via UrlFetchApp with the script's OAuth token.
 *
 * The Chat app must be configured in Google Cloud Console and added to
 * the relevant spaces before messages can be sent.
 */

const CHAT_API_BASE = 'https://chat.googleapis.com/v1';

// ─── Core send ───────────────────────────────────────────────────────────────

/**
 * Posts a plain text message to a Chat space.
 */
function sendChatMessage(spaceId: string, text: string): string {
  return _chatPost(`spaces/${spaceId}/messages`, { text });
}

/**
 * Posts a rich card message to a Chat space.
 * Returns the message resource name (used to update/delete the message).
 */
function sendChatCard(spaceId: string, card: object, fallbackText?: string): string {
  const body: Record<string, unknown> = { cardsV2: [{ cardId: generateId(), card }] };
  if (fallbackText) body.text = fallbackText;
  return _chatPost(`spaces/${spaceId}/messages`, body);
}

/**
 * Sends a direct message to a specific user via their DM space.
 */
function sendDirectMessage(member: TeamMember, text: string): void {
  if (!member.chatDmSpaceId) {
    Logger.log(`[ChatClient] No DM space configured for ${member.email} — skipping DM.`);
    return;
  }
  sendChatMessage(member.chatDmSpaceId, text);
}

/**
 * Sends a rich card DM to a specific user.
 */
function sendDirectCard(member: TeamMember, card: object, fallbackText?: string): string {
  if (!member.chatDmSpaceId) {
    Logger.log(`[ChatClient] No DM space configured for ${member.email} — skipping card DM.`);
    return '';
  }
  return sendChatCard(member.chatDmSpaceId, card, fallbackText);
}

// ─── Approval cards ──────────────────────────────────────────────────────────

/**
 * Sends an interactive approval card to a user's DM space.
 * The card shows context, the proposed action, and Approve/Reject buttons.
 *
 * The callback URL must point to a deployed Apps Script web app endpoint
 * that handles the approval response (see ApprovalHandler.ts in module 03).
 *
 * Returns the Chat message resource name for tracking.
 */
function sendApprovalCard(params: {
  member: TeamMember;
  approvalId: string;
  actionType: ApprovalActionType;
  title: string;
  summary: string;
  details: Array<{ label: string; value: string }>;
  callbackBaseUrl: string;
}): string {
  const { member, approvalId, actionType, title, summary, details, callbackBaseUrl } = params;

  const detailWidgets = details.map(d => ({
    decoratedText: {
      topLabel: d.label,
      text: d.value,
    },
  }));

  const card = {
    header: {
      title,
      subtitle: `Action required · ${actionType.replace(/_/g, ' ')}`,
      imageUrl: 'https://fonts.gstatic.com/s/i/googlematerialicons/task_alt/v1/24px.svg',
      imageType: 'CIRCLE',
    },
    sections: [
      {
        header: 'Summary',
        widgets: [{ textParagraph: { text: summary } }],
      },
      ...(details.length > 0
        ? [{ header: 'Details', widgets: detailWidgets }]
        : []),
      {
        widgets: [
          {
            buttonList: {
              buttons: [
                {
                  text: '✅ Approve',
                  color: { red: 0.13, green: 0.69, blue: 0.30, alpha: 1 },
                  onClick: {
                    openLink: {
                      url: `${callbackBaseUrl}?approvalId=${approvalId}&action=approve`,
                    },
                  },
                },
                {
                  text: '❌ Reject',
                  color: { red: 0.83, green: 0.18, blue: 0.18, alpha: 1 },
                  onClick: {
                    openLink: {
                      url: `${callbackBaseUrl}?approvalId=${approvalId}&action=reject`,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
      {
        widgets: [
          {
            textParagraph: {
              text: `<i>This approval expires in 24 hours. Requested by GWAS · ${new Date().toLocaleString()}</i>`,
            },
          },
        ],
      },
    ],
  };

  return sendDirectCard(member, card, `Action required: ${title}`);
}

/**
 * Sends an urgent alert card to a user's DM and optionally the team space.
 */
function sendUrgentAlert(params: {
  member: TeamMember;
  title: string;
  message: string;
  sourceUrl?: string;
  alsoPostToTeamSpace?: boolean;
}): void {
  const { member, title, message, sourceUrl, alsoPostToTeamSpace } = params;

  const card = {
    header: {
      title: `🚨 ${title}`,
      subtitle: 'Urgent alert from GWAS',
      imageType: 'CIRCLE',
    },
    sections: [
      {
        widgets: [{ textParagraph: { text: message } }],
      },
      ...(sourceUrl
        ? [{
            widgets: [{
              buttonList: {
                buttons: [{
                  text: 'View Source',
                  onClick: { openLink: { url: sourceUrl } },
                }],
              },
            }],
          }]
        : []),
    ],
  };

  sendDirectCard(member, card, `🚨 Urgent: ${title}`);

  if (alsoPostToTeamSpace) {
    const teamSpaceId = getConfig('TEAM_CHAT_SPACE_ID');
    sendChatCard(teamSpaceId, card, `🚨 Urgent: ${title}`);
  }
}

/**
 * Posts a digest card to a user's DM space.
 */
function sendDigestCard(member: TeamMember, digestType: DigestType, sections: object[]): void {
  const titles: Record<DigestType, string> = {
    am: '☀️ Good morning — your day ahead',
    pm: '🌙 End of day wrap-up',
    weekly: '📊 Weekly team digest',
  };

  const card = {
    header: {
      title: titles[digestType],
      subtitle: new Date().toDateString(),
    },
    sections,
  };

  sendDirectCard(member, card, titles[digestType]);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _chatPost(path: string, body: object): string {
  const token = ScriptApp.getOAuthToken();
  const url = `${CHAT_API_BASE}/${path}`;

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`[ChatClient] Chat API error ${statusCode}: ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText()) as { name?: string };
  return data.name ?? '';
}
