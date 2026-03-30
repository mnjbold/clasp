/**
 * Unified Knowledge Base — indexes content from Drive, Gmail, Calendar,
 * and meeting notes using Gemini embeddings. Provides semantic search
 * via a Sheets sidebar.
 */

const KB_SHEET_NAME = 'KB Index';

// Column indices (1-based).
const KB_COL = {
  KB_ID: 1,
  TITLE: 2,
  SOURCE: 3,
  URL: 4,
  SUMMARY: 5,
  TAGS: 6,
  EMBEDDING: 7,
  CREATED: 8,
  LAST_INDEXED: 9,
} as const;

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupKnowledgeBase(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  _ensureKbSheet(ss);
  _setupKbTriggers();
  GWAS.gwasLog('KB', 'INFO', 'Knowledge Base setup complete.');
  try {
    SpreadsheetApp.getUi().alert('✅ Knowledge Base setup complete!');
  } catch (_) { /* not running in spreadsheet UI context */ }
}

function _ensureKbSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): GoogleAppsScript.Spreadsheet.Sheet {
  let sheet = ss.getSheetByName(KB_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(KB_SHEET_NAME, 0);
    const headers = ['KB ID', 'Title', 'Source', 'URL', 'Summary', 'Tags', 'Embedding (JSON)', 'Created', 'Last Indexed'];
    sheet.getRange(1, 1, 1, headers.length)
      .setValues([headers])
      .setFontWeight('bold')
      .setBackground('#1a73e8')
      .setFontColor('#fff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 160);
    sheet.setColumnWidth(KB_COL.SUMMARY, 320);
    sheet.setColumnWidth(KB_COL.EMBEDDING, 60); // narrow — raw JSON, not for reading
    sheet.setColumnWidth(KB_COL.URL, 280);
  }
  return sheet;
}

function _setupKbTriggers(): void {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Hourly — index new/modified Drive docs.
  ScriptApp.newTrigger('indexNewDriveDocs').timeBased().everyHours(1).create();

  // Daily 6 AM — index starred Gmail threads.
  ScriptApp.newTrigger('indexGmailThreads').timeBased().everyDays(1).atHour(6).create();

  // Weekly Sunday midnight — index past calendar events.
  ScriptApp.newTrigger('indexCalendarEvents')
    .timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();

  GWAS.gwasLog('KB', 'INFO', 'KB triggers installed.');
}

// ─── Core indexing ────────────────────────────────────────────────────────────

/**
 * Indexes a single piece of content into the KB.
 * Skips if the URL is already indexed and content hasn't changed.
 */
function indexContent(params: {
  title: string;
  source: KBSource;
  url: string;
  text: string;
  createdDate?: Date;
}): void {
  const ss = SpreadsheetApp.openById(GWAS.getConfig('KB_SPREADSHEET_ID'));
  const sheet = _ensureKbSheet(ss);

  // Check if already indexed by URL.
  const existingRow = GWAS.findRowByValue(sheet, KB_COL.URL, params.url);

  const text = params.text.substring(0, 10000); // cap for API limits
  if (text.trim().length < 80) return; // skip near-empty content

  // Generate summary, tags, and embedding.
  const summary = GWAS.callGemini(
    `Summarize the following content in 2-3 sentences. Be factual and concise:\n\n${text.substring(0, 4000)}`
  );

  const tagsRaw = GWAS.callGemini(
    `Extract 5-8 keyword tags from this text. Return only a comma-separated list of tags, nothing else:\n\n${text.substring(0, 2000)}`
  );

  const embedding = GWAS.getEmbedding(text.substring(0, 2000));
  const now = new Date().toISOString();

  if (existingRow > 0) {
    // Update existing entry.
    sheet.getRange(existingRow, KB_COL.SUMMARY).setValue(summary);
    sheet.getRange(existingRow, KB_COL.TAGS).setValue(tagsRaw.trim());
    sheet.getRange(existingRow, KB_COL.EMBEDDING).setValue(JSON.stringify(embedding));
    sheet.getRange(existingRow, KB_COL.LAST_INDEXED).setValue(now);
    GWAS.gwasLog('KB', 'INFO', `KB updated: "${params.title}"`);
  } else {
    // New entry.
    sheet.appendRow([
      GWAS.generateId(),
      params.title,
      params.source,
      params.url,
      summary,
      tagsRaw.trim(),
      JSON.stringify(embedding),
      (params.createdDate ?? new Date()).toISOString(),
      now,
    ]);
    GWAS.gwasLog('KB', 'INFO', `KB indexed: "${params.title}" (${params.source})`);
  }
}

// ─── Drive indexer ────────────────────────────────────────────────────────────

/**
 * Indexes new or recently modified Google Docs in the Team Drive.
 * Runs hourly.
 */
function indexNewDriveDocs(): void {
  GWAS.gwasLog('KB', 'INFO', 'Indexing Drive docs...');

  const teamFolderId = GWAS.getConfig('TEAM_DRIVE_FOLDER_ID');
  const folder = DriveApp.getFolderById(teamFolderId);
  const cutoff = new Date(Date.now() - 2 * 60 * 60000); // modified in last 2 hours

  let indexed = 0;
  indexed += _indexFolderDocs(folder, cutoff, 0);

  GWAS.gwasLog('KB', 'INFO', `Drive indexing complete. ${indexed} docs indexed.`);
}

function _indexFolderDocs(
  folder: GoogleAppsScript.Drive.Folder,
  cutoff: Date,
  depth: number
): number {
  if (depth > 3) return 0; // max recursion depth

  let count = 0;
  const files = folder.getFilesByType(MimeType.GOOGLE_DOCS);

  while (files.hasNext()) {
    const file = files.next();
    if (file.getLastUpdated() < cutoff) continue;

    try {
      const doc = DocumentApp.openById(file.getId());
      const text = doc.getBody().getText();
      indexContent({
        title: file.getName(),
        source: 'drive',
        url: file.getUrl(),
        text,
        createdDate: file.getDateCreated(),
      });
      count++;
      // Throttle to avoid hitting Gemini rate limits.
      Utilities.sleep(500);
    } catch (e) {
      GWAS.gwasLog('KB', 'WARN', `Failed to index "${file.getName()}": ${(e as Error).message}`);
    }
  }

  // Recurse into subfolders.
  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    count += _indexFolderDocs(subfolders.next(), cutoff, depth + 1);
  }

  return count;
}

// ─── Gmail indexer ────────────────────────────────────────────────────────────

/**
 * Indexes starred Gmail threads and threads labeled "gwas-kb".
 * Runs daily at 6 AM.
 */
function indexGmailThreads(): void {
  GWAS.gwasLog('KB', 'INFO', 'Indexing Gmail threads...');
  let indexed = 0;

  // Starred threads.
  const starred = GmailApp.getStarredThreads(0, 30);
  starred.forEach(thread => {
    try {
      _indexGmailThread(thread);
      indexed++;
      Utilities.sleep(300);
    } catch (e) {
      GWAS.gwasLog('KB', 'WARN', `Gmail thread index failed: ${(e as Error).message}`);
    }
  });

  // Threads labeled "gwas-kb".
  try {
    const label = GmailApp.getUserLabelByName('gwas-kb');
    if (label) {
      label.getThreads(0, 20).forEach(thread => {
        try {
          _indexGmailThread(thread);
          indexed++;
          Utilities.sleep(300);
        } catch (_) {}
      });
    }
  } catch (_) {}

  GWAS.gwasLog('KB', 'INFO', `Gmail indexing complete. ${indexed} threads indexed.`);
}

function _indexGmailThread(thread: GoogleAppsScript.Gmail.GmailThread): void {
  const subject = thread.getFirstMessageSubject();
  const messages = thread.getMessages();
  const text = messages.map(m => `From: ${m.getFrom()}\n${m.getPlainBody()}`).join('\n\n---\n\n');
  const threadUrl = `https://mail.google.com/mail/u/0/#inbox/${thread.getId()}`;

  indexContent({
    title: `Email: ${subject}`,
    source: 'gmail',
    url: threadUrl,
    text,
    createdDate: thread.getLastMessageDate(),
  });
}

// ─── Calendar indexer ─────────────────────────────────────────────────────────

/**
 * Indexes past calendar events from the last 7 days that have notes docs.
 * Runs weekly on Sunday.
 */
function indexCalendarEvents(): void {
  GWAS.gwasLog('KB', 'INFO', 'Indexing calendar events...');

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const now = new Date();
  const cal = CalendarApp.getDefaultCalendar();
  const events = cal.getEvents(weekAgo, now);

  let indexed = 0;
  events.forEach(event => {
    if (event.isAllDayEvent()) return;
    if (event.getGuestList().length === 0) return;

    const desc = event.getDescription() ?? '';
    const docMatch = desc.match(/https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);

    // Build indexable text from event metadata + notes doc if available.
    let text = `Meeting: ${event.getTitle()}\nDate: ${event.getStartTime().toLocaleString()}\nAttendees: ${event.getGuestList().map(g => g.getEmail()).join(', ')}\n\nDescription:\n${desc}`;

    if (docMatch) {
      try {
        const doc = DocumentApp.openById(docMatch[1]);
        text += `\n\nMeeting Notes:\n${doc.getBody().getText()}`;
      } catch (_) {}
    }

    try {
      indexContent({
        title: `Meeting: ${event.getTitle()} (${GWAS.toIsoDate(event.getStartTime())})`,
        source: 'calendar',
        url: `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(event.getId())}`,
        text,
        createdDate: event.getStartTime(),
      });
      indexed++;
      Utilities.sleep(400);
    } catch (e) {
      GWAS.gwasLog('KB', 'WARN', `Calendar event index failed: ${(e as Error).message}`);
    }
  });

  GWAS.gwasLog('KB', 'INFO', `Calendar indexing complete. ${indexed} events indexed.`);
}

// ─── Semantic search ──────────────────────────────────────────────────────────

/**
 * Searches the KB using cosine similarity against Gemini embeddings.
 * Returns the top N results sorted by relevance score.
 * Called from the sidebar via google.script.run.
 */
function searchKnowledgeBase(query: string, topN: number = 10): Array<{
  kbId: string;
  title: string;
  source: string;
  url: string;
  summary: string;
  tags: string;
  score: number;
}> {
  if (!query || query.trim().length < 3) return [];

  const ss = SpreadsheetApp.openById(GWAS.getConfig('KB_SPREADSHEET_ID'));
  const sheet = ss.getSheetByName(KB_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // Generate query embedding.
  const queryEmbedding = GWAS.getEmbedding(query);

  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();

  const scored = data
    .filter(r => r[0] && r[KB_COL.EMBEDDING - 1]) // skip blank rows
    .map(r => {
      let score = 0;
      try {
        const embedding = JSON.parse(r[KB_COL.EMBEDDING - 1]?.toString() ?? '[]') as number[];
        score = GWAS.cosineSimilarity(queryEmbedding, embedding);
      } catch (_) {}
      return {
        kbId: r[KB_COL.KB_ID - 1]?.toString() ?? '',
        title: r[KB_COL.TITLE - 1]?.toString() ?? '',
        source: r[KB_COL.SOURCE - 1]?.toString() ?? '',
        url: r[KB_COL.URL - 1]?.toString() ?? '',
        summary: r[KB_COL.SUMMARY - 1]?.toString() ?? '',
        tags: r[KB_COL.TAGS - 1]?.toString() ?? '',
        score,
      };
    })
    .filter(r => r.score > 0.3) // minimum relevance threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  GWAS.gwasLog('KB', 'INFO', `KB search: "${query}" → ${scored.length} results`);
  return scored;
}

// ─── onOpen + sidebar ─────────────────────────────────────────────────────────

function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('🧠 Knowledge Base')
    .addItem('Search KB', 'showKbSearchSidebar')
    .addSeparator()
    .addItem('Index Drive Docs Now', 'indexNewDriveDocs')
    .addItem('Index Gmail Threads Now', 'indexGmailThreads')
    .addItem('Index Calendar Events Now', 'indexCalendarEvents')
    .addSeparator()
    .addItem('Setup KB', 'setupKnowledgeBase')
    .addToUi();
}

function showKbSearchSidebar(): void {
  const html = HtmlService.createHtmlOutput(_getKbSidebarHtml())
    .setTitle('🧠 Knowledge Base Search')
    .setWidth(380);
  SpreadsheetApp.getUi().showSidebar(html);
}

function _getKbSidebarHtml(): string {
  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: Google Sans, Arial, sans-serif; font-size: 13px; color: #202124; margin: 0; padding: 12px; }
  h2 { font-size: 15px; color: #1a73e8; margin: 0 0 12px; }
  .search-row { display: flex; gap: 8px; margin-bottom: 12px; }
  input[type=text] { flex: 1; padding: 8px 10px; border: 1px solid #dadce0; border-radius: 4px; font-size: 13px; }
  button { padding: 8px 14px; background: #1a73e8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
  button:hover { background: #1557b0; }
  .result { padding: 10px 0; border-bottom: 1px solid #f1f3f4; }
  .result:last-child { border-bottom: none; }
  .result-title { font-weight: 600; color: #1a73e8; text-decoration: none; font-size: 13px; }
  .result-title:hover { text-decoration: underline; }
  .result-meta { font-size: 11px; color: #80868b; margin: 2px 0; }
  .result-summary { font-size: 12px; color: #3c4043; margin-top: 4px; line-height: 1.4; }
  .result-tags { font-size: 11px; color: #1a73e8; margin-top: 4px; }
  .score { display: inline-block; padding: 1px 6px; background: #e8f0fe; border-radius: 10px; font-size: 10px; color: #1a73e8; margin-left: 6px; }
  .empty { color: #80868b; font-style: italic; padding: 20px 0; text-align: center; }
  .loading { color: #80868b; font-style: italic; }
</style>
</head>
<body>
<h2>🧠 Knowledge Base Search</h2>
<div class="search-row">
  <input type="text" id="query" placeholder="Search meetings, docs, emails…" onkeydown="if(event.key==='Enter')search()">
  <button onclick="search()">Search</button>
</div>
<div id="results"><p class="empty">Enter a query to search across all indexed content.</p></div>

<script>
function search() {
  const query = document.getElementById('query').value.trim();
  if (!query) return;
  document.getElementById('results').innerHTML = '<p class="loading">Searching…</p>';
  google.script.run
    .withSuccessHandler(renderResults)
    .withFailureHandler(err => {
      document.getElementById('results').innerHTML = '<p class="empty">Error: ' + err.message + '</p>';
    })
    .searchKnowledgeBase(query, 10);
}

function renderResults(results) {
  const el = document.getElementById('results');
  if (!results || results.length === 0) {
    el.innerHTML = '<p class="empty">No results found. Try different keywords.</p>';
    return;
  }
  const sourceIcons = { drive: '📄', gmail: '📧', calendar: '📅', meeting_notes: '📝', chat: '💬' };
  el.innerHTML = results.map(r => {
    const icon = sourceIcons[r.source] || '📌';
    const score = Math.round(r.score * 100);
    return \`<div class="result">
      <a class="result-title" href="\${r.url}" target="_blank">\${icon} \${r.title}</a>
      <span class="score">\${score}% match</span>
      <div class="result-meta">\${r.source.replace('_', ' ')}</div>
      <div class="result-summary">\${r.summary}</div>
      \${r.tags ? '<div class="result-tags">🏷 ' + r.tags + '</div>' : ''}
    </div>\`;
  }).join('');
}
</script>
</body>
</html>`;
}
