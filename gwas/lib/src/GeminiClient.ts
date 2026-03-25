/**
 * Gemini API client for Apps Script.
 *
 * All calls go through UrlFetchApp to the Google AI Studio REST endpoint.
 * The API key is read from PropertiesService — never hardcoded.
 *
 * Rate limiting: the free tier allows 1,500 requests/day and 15 RPM.
 * Use CacheService to avoid redundant calls for identical prompts.
 */

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

// Cache TTL for Gemini responses (10 minutes). Avoids duplicate API calls
// when the same prompt is triggered multiple times in quick succession.
const CACHE_TTL_SECONDS = 600;

interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }> };
    finishReason: string;
  }>;
}

interface EmbeddingResponse {
  embedding: { values: number[] };
}

/**
 * Calls Gemini and returns the text response.
 * Results are cached by prompt hash to reduce API quota usage.
 */
function callGemini(prompt: string, model: string = DEFAULT_MODEL): string {
  const cacheKey = `gemini_${Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    prompt + model,
    Utilities.Charset.UTF_8
  ).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('')}`;

  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const apiKey = getConfig('GEMINI_API_KEY');
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();

  if (statusCode !== 200) {
    const errorBody = response.getContentText();
    throw new Error(`[GeminiClient] API error ${statusCode}: ${errorBody}`);
  }

  const data = JSON.parse(response.getContentText()) as GeminiResponse;

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('[GeminiClient] No candidates returned from Gemini.');
  }

  const text = data.candidates[0].content.parts[0].text;
  cache.put(cacheKey, text, CACHE_TTL_SECONDS);
  return text;
}

/**
 * Calls Gemini and parses the response as JSON matching the expected type T.
 * The prompt must instruct Gemini to return valid JSON only.
 */
function callGeminiStructured<T>(prompt: string, model: string = DEFAULT_MODEL): T {
  const jsonPrompt = `${prompt}

IMPORTANT: Respond with valid JSON only. No markdown, no code fences, no explanation — just the raw JSON object.`;

  const raw = callGemini(jsonPrompt, model);

  // Strip any accidental markdown fences Gemini may still include.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(`[GeminiClient] Failed to parse JSON response: ${cleaned.substring(0, 200)}`);
  }
}

/**
 * Generates a text embedding vector using text-embedding-004.
 * Embeddings are cached for 10 minutes.
 */
function getEmbedding(text: string): number[] {
  const cacheKey = `emb_${Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    text,
    Utilities.Charset.UTF_8
  ).map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('')}`;

  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached) as number[];

  const apiKey = getConfig('GEMINI_API_KEY');
  const url = `${GEMINI_BASE_URL}/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;

  const payload = {
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts: [{ text }] },
  };

  const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200) {
    throw new Error(`[GeminiClient] Embedding API error: ${response.getContentText()}`);
  }

  const data = JSON.parse(response.getContentText()) as EmbeddingResponse;
  const values = data.embedding.values;
  cache.put(cacheKey, JSON.stringify(values), CACHE_TTL_SECONDS);
  return values;
}

/**
 * Computes cosine similarity between two embedding vectors.
 * Returns a value between -1 (opposite) and 1 (identical).
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('[GeminiClient] Embedding dimension mismatch.');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Extracts structured context (tasks, calendar events, decisions, alerts)
 * from any text source (transcript, email, chat message, doc content).
 */
function extractContextFromText(
  text: string,
  sourceType: 'meeting_transcript' | 'email' | 'chat' | 'doc',
  teamMemberNames: string[]
): GeminiExtractedContext {
  const teamList = teamMemberNames.join(', ');

  const prompt = `You are an intelligent workspace assistant. Analyze the following ${sourceType} and extract structured information.

Team members: ${teamList}

Text to analyze:
---
${text.substring(0, 30000)}
---

Return a JSON object with this exact structure:
{
  "summary": "2-4 sentence summary of the content",
  "actionItems": [
    {
      "title": "concise task title",
      "description": "what needs to be done",
      "suggestedOwner": "name or email of the person responsible (empty string if unclear)",
      "suggestedDueDate": "ISO date YYYY-MM-DD or empty string if not mentioned",
      "priority": "P1 | P2 | P3",
      "sourceText": "verbatim excerpt that triggered this task"
    }
  ],
  "calendarSuggestions": [
    {
      "title": "meeting or event title",
      "description": "purpose of the event",
      "suggestedDate": "ISO datetime YYYY-MM-DDTHH:MM or empty string",
      "suggestedDuration": 60,
      "suggestedAttendees": ["name or email"],
      "sourceText": "verbatim excerpt"
    }
  ],
  "decisions": ["decision made, stated as a fact"],
  "openQuestions": ["unresolved question that needs follow-up"],
  "urgentAlerts": ["any urgent or time-sensitive issue requiring immediate attention"]
}

Rules:
- Only include items that are clearly present in the text
- P1 = urgent/blocking, P2 = important/this week, P3 = nice to have
- For suggestedOwner, use the exact name as it appears in the team list if possible
- urgentAlerts should only contain genuinely urgent items (deadlines missed, blockers, emergencies)`;

  return callGeminiStructured<GeminiExtractedContext>(prompt);
}
