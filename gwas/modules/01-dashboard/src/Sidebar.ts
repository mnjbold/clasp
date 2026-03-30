/**
 * onOpen trigger — adds the GWAS menu and opens the sidebar.
 */
function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('🤖 GWAS')
    .addItem('Open Control Panel', 'showSidebar')
    .addSeparator()
    .addItem('Refresh Dashboard Now', 'refreshDashboard')
    .addItem('Generate AI Insights', 'generateWeeklyInsights')
    .addSeparator()
    .addItem('Setup Dashboard', 'setupDashboard')
    .addItem('Health Check', 'runHealthCheck')
    .addToUi();
}

function showSidebar(): void {
  const html = HtmlService.createHtmlOutput(_getSidebarHtml())
    .setTitle('GWAS Control Panel')
    .setWidth(320);
  SpreadsheetApp.getUi().showSidebar(html);
}

function runHealthCheck(): void {
  const status = getDashboardSystemStatus();
  const missing = Object.entries(status.config).filter(([, v]) => !v).map(([k]) => k);

  let msg = `✅ Config keys set: ${Object.values(status.config).filter(Boolean).length}/${Object.keys(status.config).length}\n`;
  if (missing.length > 0) msg += `❌ Missing keys:\n${missing.join('\n')}\n`;
  msg += `\n👥 Team members loaded: ${status.teamSize}`;
  msg += `\n📋 Tasks store: ${status.tasks.exists ? `${status.tasks.rows} row(s)` : 'missing'}`;
  msg += `\n🚀 Projects store: ${status.projects.exists ? `${status.projects.rows} row(s)` : 'missing'}`;
  msg += `\n📬 Digest log: ${status.digestLog.exists ? `${status.digestLog.rows} row(s)` : 'missing'}`;

  SpreadsheetApp.getUi().alert('GWAS Health Check', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function _getSidebarHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Google Sans, Arial, sans-serif; font-size: 13px; color: #202124; margin: 0; padding: 12px; }
  h2 { font-size: 15px; color: #1a73e8; margin: 0 0 12px; }
  .section { margin-bottom: 16px; }
  .section h3 { font-size: 12px; font-weight: 600; color: #5f6368; text-transform: uppercase; letter-spacing: .5px; margin: 0 0 8px; }
  button { width: 100%; padding: 8px 12px; margin-bottom: 6px; border: 1px solid #dadce0; border-radius: 4px; background: #fff; color: #1a73e8; font-size: 13px; cursor: pointer; text-align: left; }
  button:hover { background: #e8f0fe; }
  button.primary { background: #1a73e8; color: #fff; border-color: #1a73e8; }
  button.primary:hover { background: #1557b0; }
  .status { padding: 8px; background: #e6f4ea; border-radius: 4px; font-size: 12px; color: #137333; margin-top: 8px; display: none; }
  .error { background: #fce8e6; color: #c5221f; }
</style>
</head>
<body>
<h2>🤖 GWAS Control Panel</h2>

<div class="section">
  <h3>Quick Actions</h3>
  <button class="primary" onclick="run('refreshDashboard')">🔄 Refresh Dashboard</button>
  <button onclick="run('generateWeeklyInsights')">🤖 Generate AI Insights</button>
</div>

<div class="section">
  <h3>Create</h3>
  <button onclick="openCreateTask()">➕ New Task</button>
  <button onclick="openCreateProject()">🚀 New Project</button>
  <button onclick="run('triggerAmDigest')">☀️ Send AM Digest Now</button>
  <button onclick="run('triggerPmDigest')">🌙 Send PM Digest Now</button>
</div>

<div class="section">
  <h3>System</h3>
  <button onclick="run('runHealthCheck')">🩺 Health Check</button>
  <button onclick="run('runExpireApprovals')">🧹 Expire Old Approvals</button>
</div>

<div id="status" class="status"></div>

<script>
function run(fn) {
  const el = document.getElementById('status');
  el.className = 'status';
  el.textContent = 'Running...';
  el.style.display = 'block';
  google.script.run
    .withSuccessHandler(() => { el.textContent = '✅ Done!'; })
    .withFailureHandler(e => { el.className = 'status error'; el.textContent = '❌ ' + e.message; })
    [fn]();
}
function openCreateTask() {
  google.script.run.showCreateTaskDialog();
}
function openCreateProject() {
  google.script.run.showCreateProjectDialog();
}
</script>
</body>
</html>`;
}

// ─── Dialogs called from sidebar ─────────────────────────────────────────────

function showCreateTaskDialog(): void {
  const html = HtmlService.createHtmlOutput(_getCreateTaskHtml())
    .setWidth(480).setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(html, 'Create New Task');
}

function showCreateProjectDialog(): void {
  const html = HtmlService.createHtmlOutput(_getCreateProjectHtml())
    .setWidth(480).setHeight(460);
  SpreadsheetApp.getUi().showModalDialog(html, 'Create New Project');
}

function _getCreateTaskHtml(): string {
  const members = GWAS.getTeamMembers().map(m => `<option value="${m.email}">${m.name}</option>`).join('');
  return `<!DOCTYPE html><html><head><style>
    body{font-family:Google Sans,Arial,sans-serif;font-size:13px;padding:16px;color:#202124}
    label{display:block;font-weight:600;margin:10px 0 4px}
    input,select,textarea{width:100%;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;font-size:13px;box-sizing:border-box}
    textarea{height:80px;resize:vertical}
    .actions{margin-top:16px;display:flex;gap:8px;justify-content:flex-end}
    button{padding:8px 16px;border-radius:4px;border:none;cursor:pointer;font-size:13px}
    .primary{background:#1a73e8;color:#fff}
    .secondary{background:#fff;border:1px solid #dadce0;color:#202124}
  </style></head><body>
  <label>Title *</label><input id="title" placeholder="What needs to be done?">
  <label>Description</label><textarea id="desc" placeholder="Additional details..."></textarea>
  <label>Owner</label><select id="owner"><option value="">Unassigned</option>${members}</select>
  <label>Priority</label>
  <select id="priority"><option value="P2">P2 — Normal</option><option value="P1">P1 — Urgent</option><option value="P3">P3 — Low</option></select>
  <label>Due Date</label><input id="due" type="date">
  <div class="actions">
    <button class="secondary" onclick="google.script.host.close()">Cancel</button>
    <button class="primary" onclick="submit()">Create Task</button>
  </div>
  <script>
  function submit(){
    const title=document.getElementById('title').value.trim();
    if(!title){alert('Title is required.');return;}
    google.script.run
      .withSuccessHandler(()=>google.script.host.close())
      .withFailureHandler(e=>alert('Error: '+e.message))
      .createTaskFromDashboard({
        title,
        description:document.getElementById('desc').value,
        owner:document.getElementById('owner').value,
        priority:document.getElementById('priority').value,
        dueDate:document.getElementById('due').value,
      });
  }
  </script></body></html>`;
}

function _getCreateProjectHtml(): string {
  const members = GWAS.getTeamMembers().map(m => `<option value="${m.email}">${m.name}</option>`).join('');
  return `<!DOCTYPE html><html><head><style>
    body{font-family:Google Sans,Arial,sans-serif;font-size:13px;padding:16px;color:#202124}
    label{display:block;font-weight:600;margin:10px 0 4px}
    input,select,textarea{width:100%;padding:6px 8px;border:1px solid #dadce0;border-radius:4px;font-size:13px;box-sizing:border-box}
    textarea{height:80px;resize:vertical}
    .actions{margin-top:16px;display:flex;gap:8px;justify-content:flex-end}
    button{padding:8px 16px;border-radius:4px;border:none;cursor:pointer;font-size:13px}
    .primary{background:#1a73e8;color:#fff}
    .secondary{background:#fff;border:1px solid #dadce0;color:#202124}
  </style></head><body>
  <label>Project Name *</label><input id="name" placeholder="Project name">
  <label>Description *</label><textarea id="desc" placeholder="What is this project about?"></textarea>
  <label>Owner</label><select id="owner">${members}</select>
  <label>Target Date</label><input id="target" type="date">
  <div class="actions">
    <button class="secondary" onclick="google.script.host.close()">Cancel</button>
    <button class="primary" onclick="submit()">Create Project</button>
  </div>
  <script>
  function submit(){
    const name=document.getElementById('name').value.trim();
    const desc=document.getElementById('desc').value.trim();
    if(!name||!desc){alert('Name and description are required.');return;}
    google.script.run
      .withSuccessHandler(()=>google.script.host.close())
      .withFailureHandler(e=>alert('Error: '+e.message))
      .createProjectFromDashboard({
        name,description:desc,
        owner:document.getElementById('owner').value,
        targetDate:document.getElementById('target').value,
      });
  }
  </script></body></html>`;
}

// Stubs — actual logic lives in the respective modules but these are called
// from the dashboard sidebar via google.script.run.
function createTaskFromDashboard(params: { title: string; description: string; owner: string; priority: string; dueDate: string }): void {
  const sheet = _ensureDashboardTasksSheet();

  const taskId = GWAS.generateId();
  sheet.appendRow([
    taskId, params.title, params.description, params.owner, '',
    'todo', params.priority, params.dueDate, new Date().toISOString(), 'manual', '', '', '',
  ]);
  GWAS.gwasLog('Dashboard', 'INFO', `Task created from dashboard: ${taskId} — ${params.title}`);
}

function createProjectFromDashboard(params: { name: string; description: string; owner: string; targetDate: string }): void {
  // Delegates to Module 05 logic by writing to the Projects spreadsheet.
  // Module 05's onChange trigger will pick it up and complete the setup.
  const sheet = _ensureDashboardProjectsSheet();

  const projectId = GWAS.generateId();
  sheet.appendRow([
    projectId, params.name, params.description, 'planning',
    params.owner, '', GWAS.todayIso(), params.targetDate,
    '', '', 0, new Date().toISOString(), '',
  ]);
  GWAS.gwasLog('Dashboard', 'INFO', `Project created from dashboard: ${projectId} — ${params.name}`);
}
