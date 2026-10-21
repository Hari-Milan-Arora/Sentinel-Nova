import 'dotenv/config';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY?.trim();
if (!apiKey || /^(your[-_ ]|replace[-_ ]|placeholder|example)/i.test(apiKey)) {
  console.error('BLOCKED Gemini smoke test: GEMINI_API_KEY is missing or a placeholder.');
  process.exit(2);
}

const candidateModels = [
  process.env.GEMINI_MODEL?.trim(),
  'gemini-2.5-flash',
  'gemini-3.8-flash',
].filter(Boolean);

let verified = false;
let lastError = null;

for (const model of candidateModels) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: 'Reply with exactly OK.',
      config: {
        maxOutputTokens: 64,
        abortSignal: controller.signal,
        httpOptions: { timeout: 14_000, retryOptions: { attempts: 1 } },
      },
    });
    if (response.text?.trim()) {
      console.log(`PASS Gemini live smoke test: authenticated generation returned response using ${model}.`);
      verified = true;
      clearTimeout(timeout);
      break;
    }
  } catch (error) {
    lastError = error;
  } finally {
    clearTimeout(timeout);
  }
}

if (!verified) {
  const status = Number(lastError?.status ?? lastError?.statusCode);
  const category = status === 401 || status === 403 ? 'authentication or permission rejected'
    : status === 404 ? 'configured model not found'
      : status === 429 ? 'rate limit or quota exhausted'
        : lastError?.name === 'AbortError' ? 'request timed out'
          : 'provider request failed';
  console.error(`FAIL Gemini smoke test: ${category}${Number.isInteger(status) ? ` (HTTP ${status})` : ''}.`);
  process.exitCode = 1;
}
