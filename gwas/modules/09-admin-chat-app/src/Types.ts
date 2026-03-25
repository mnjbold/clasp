/**
 * Google Chat event and response type definitions for Apps Script.
 * These mirror the Chat API event schema.
 */

interface ChatEvent {
  type: 'MESSAGE' | 'CARD_CLICKED' | 'ADDED_TO_SPACE' | 'REMOVED_FROM_SPACE';
  isDialogEvent?: boolean;
  dialogEventType?: 'REQUEST_DIALOG' | 'SUBMIT_DIALOG' | 'CANCEL_DIALOG';
  message?: {
    text?: string;
    slashCommand?: { commandId: number; commandName: string };
    sender?: { email: string; displayName: string; name: string };
  };
  user?: {
    email: string;
    displayName: string;
    name: string;
  };
  space?: {
    name: string;
    displayName: string;
    type: 'ROOM' | 'DM';
  };
  action?: {
    actionMethodName: string;
    parameters?: Array<{ key: string; value: string }>;
  };
  common?: {
    invokedFunction?: string;
    parameters?: Array<{ key: string; value: string }>;
    formInputs?: Record<string, {
      stringInputs?: { value: string[] };
      dateTimeInput?: { msSinceEpoch: string; hasDate: boolean; hasTime: boolean };
    }>;
  };
}

interface ChatResponse {
  text?: string;
  cardsV2?: Array<{
    cardId: string;
    card: { sections: object[]; header?: object };
  }>;
  actionResponse?: {
    type: 'NEW_MESSAGE' | 'UPDATE_MESSAGE' | 'UPDATE_USER_MESSAGE_CARDS' | 'REQUEST_CONFIG' | 'DIALOG';
    dialogAction?: {
      dialog?: { body: object };
      actionStatus?: { statusCode: string; userFacingMessage?: string };
    };
  };
}
