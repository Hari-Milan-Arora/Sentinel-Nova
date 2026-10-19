import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey || /^(your[-_ ]|replace[-_ ]|placeholder|example)/i.test(apiKey)) {
  console.error('BLOCKED Gemini smoke test: GEMINI_API_KEY is missing or a placeholder.');
  process.exit(2);
}

const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash';
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 15_000);

try {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: 'Reply with exactly OK.',
    config: {
      temperature: 0,
      // Gemini 3.x may use output budget for internal thinking; leave room for
      // a tiny visible answer so the smoke check tests generation, not budget.
      maxOutputTokens: 64,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      abortSignal: controller.signal,
      httpOptions: { timeout: 14_000, retryOptions: { attempts: 1 } },
    },
  });
  if (!response.text?.trim()) {
    console.error('FAIL Gemini smoke test: provider returned no text.');
    process.exitCode = 1;
  } else {
    console.log('PASS Gemini live smoke test: authenticated generation returned a non-empty response.');
  }
} catch (error) {
  const status = Number(error?.status ?? error?.statusCode);
  const category = status === 401 || status === 403 ? 'authentication or permission rejected'
    : status === 404 ? 'configured model not found'
      : status === 429 ? 'rate limit or quota exhausted'
        : error?.name === 'AbortError' ? 'request timed out'
          : 'provider request failed';
  console.error(`FAIL Gemini smoke test: ${category}${Number.isInteger(status) ? ` (HTTP ${status})` : ''}.`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
