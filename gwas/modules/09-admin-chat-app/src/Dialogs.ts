/**
 * Dialog builders and submission handlers.
 * Dialogs are modal forms opened from Chat card button clicks.
 */

// ─── Create task dialog ───────────────────────────────────────────────────────

function buildCreateDialog(
  event: ChatEvent,
  defaultType: 'task' | 'project' = 'task',
  prefill: Record<string, string> = {}
): ChatResponse {
  const members = GWAS.getTeamMembers();
  const memberOptions = members.map(m => ({ text: m.name, value: m.email }));

  const dialog = {
    body: {
      sections: [
        {
          header: defaultType === 'task' ? '➕ Create New Task' : '🚀 Create New Project',
          widgets: [
            {
              selectionInput: {
                name: 'type',
                label: 'Type',
                type: 'RADIO_BUTTON',
                items: [
                  { text: 'Task', value: 'task', selected: defaultType === 'task' },
                  { text: 'Project', value: 'project', selected: defaultType === 'project' },
                ],
              },
            },
            {
              textInput: {
                name: 'title',
                label: 'Title *',
                hintText: 'What needs to be done?',
                value: prefill.title ?? '',
              },
            },
            {
              textInput: {
                name: 'description',
                label: 'Description',
                type: 'MULTIPLE_LINE',
                hintText: 'Additional context…',
                value: prefill.description ?? '',
              },
            },
            {
              selectionInput: {
                name: 'owner',
                label: 'Owner',
                type: 'DROPDOWN',
                items: [{ text: 'Unassigned', value: '' }, ...memberOptions],
              },
            },
            {
              selectionInput: {
                name: 'priority',
                label: 'Priority',
                type: 'DROPDOWN',
                items: [
                  { text: 'P1 — Urgent', value: 'P1', selected: prefill.priority === 'P1' },
                  { text: 'P2 — Normal', value: 'P2', selected: !prefill.priority || prefill.priority === 'P2' },
                  { text: 'P3 — Low', value: 'P3', selected: prefill.priority === 'P3' },
                ],
              },
            },
            {
              dateTimePicker: {
                name: 'dueDate',
                label: 'Due Date',
                type: 'DATE_ONLY',
              },
            },
          ],
        },
      ],
      fixedFooter: {
        primaryButton: {
          text: 'Create',
          onClick: { action: { function: 'onCreateSubmit' } },
        },
        secondaryButton: {
          text: 'Cancel',
          onClick: { action: { function: 'onDialogCancel' } },
        },
      },
    },
  };

  return { actionResponse: { type: 'DIALOG', dialogAction: { dialog } } };
}

function buildSearchDialog(event: ChatEvent): ChatResponse {
  const dialog = {
    body: {
      sections: [{
        header: '🧠 Search Knowledge Base',
        widgets: [{
          textInput: {
            name: 'query',
            label: 'Search query',
            hintText: 'e.g. "Q4 planning decisions" or "API authentication"',
          },
        }],
      }],
      fixedFooter: {
        primaryButton: {
          text: 'Search',
          onClick: { action: { function: 'onSearchSubmit' } },
        },
      },
    },
  };

  return { actionResponse: { type: 'DIALOG', dialogAction: { dialog } } };
}

// ─── Dialog submission handlers ───────────────────────────────────────────────

function handleDialogSubmit(event: ChatEvent): ChatResponse {
  const fn = event.action?.actionMethodName ?? event.common?.invokedFunction ?? '';

  if (fn === 'onCreateSubmit') return _handleCreateSubmit(event);
  if (fn === 'onSearchSubmit') return _handleSearchSubmit(event);
  if (fn === 'onDialogCancel') return { actionResponse: { type: 'DIALOG', dialogAction: { actionStatus: { statusCode: 'OK' } } } };

  return textResponse('Unknown dialog action.');
}

function _handleCreateSubmit(event: ChatEvent): ChatResponse {
  const inputs = event.common?.formInputs ?? {};
  const type = inputs['type']?.stringInputs?.value?.[0] ?? 'task';
  const title = inputs['title']?.stringInputs?.value?.[0]?.trim() ?? '';
  const description = inputs['description']?.stringInputs?.value?.[0] ?? '';
  const owner = inputs['owner']?.stringInputs?.value?.[0] ?? '';
  const priority = (inputs['priority']?.stringInputs?.value?.[0] ?? 'P2') as TaskPriority;
  const dueDateRaw = inputs['dueDate']?.dateTimeInput?.msSinceEpoch;
  const dueDate = dueDateRaw ? GWAS.toIsoDate(new Date(Number(dueDateRaw))) : '';
  const senderEmail = event.user?.email ?? '';

  if (!title) {
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: {
          actionStatus: { statusCode: 'INVALID_ARGUMENT', userFacingMessage: 'Title is required.' },
        },
      },
    };
  }

  if (type === 'task') {
    const result = _createTaskFromAgent({ title, description, owner, priority, dueDate }, senderEmail);
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: { actionStatus: { statusCode: result.success ? 'OK' : 'INTERNAL', userFacingMessage: result.message } },
      },
    };
  } else {
    const result = _createProjectFromAgent({ name: title, description, owner, targetDate: dueDate }, senderEmail);
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: { actionStatus: { statusCode: result.success ? 'OK' : 'INTERNAL', userFacingMessage: result.message } },
      },
    };
  }
}

function _handleSearchSubmit(event: ChatEvent): ChatResponse {
  const query = event.common?.formInputs?.['query']?.stringInputs?.value?.[0]?.trim() ?? '';
  if (!query) {
    return {
      actionResponse: {
        type: 'DIALOG',
        dialogAction: { actionStatus: { statusCode: 'INVALID_ARGUMENT', userFacingMessage: 'Query is required.' } },
      },
    };
  }

  // Close dialog and post results as a message.
  return {
    actionResponse: { type: 'DIALOG', dialogAction: { actionStatus: { statusCode: 'OK' } } },
    ...buildKbSearchResults(query),
  };
}
