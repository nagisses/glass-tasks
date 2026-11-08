import type { Env, Priority } from './types';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_BASE = 'https://generativelanguage.googleapis.com';

export class GeminiError extends Error {
  constructor(
    message: string,
    public notConfigured = false,
  ) {
    super(message);
  }
}

export interface ParsedTask {
  title: string;
  dueDate: string | null;
  priority: Priority;
}

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'タスク名。日時や優先度の言葉は除く' },
    dueDate: { type: ['string', 'null'], description: 'YYYY-MM-DD。期限が無ければ null' },
    priority: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['title', 'dueDate', 'priority'],
};

function instruction(today: string, weekday: string) {
  return [
    'ユーザーが書いた短いメモを、タスク管理アプリの1件のタスクに整理します。',
    `今日は ${today}（${weekday}曜日）です。「明日」「来週月曜」「25日」などは具体的な日付 YYYY-MM-DD に変換してください。`,
    '期限の言葉が無ければ dueDate は null。',
    '「急ぎ」「至急」「大事」「重要」などがあれば priority は high、「いつか」「余裕があれば」などは low、それ以外は medium。',
    'title は日付・時刻以外の要点を簡潔な日本語で（時刻は title に残してよい）。40文字以内。説明は付けない。',
  ].join('\n');
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Turns free text like "明日15時に歯医者 急ぎ" into a structured task with Gemini (JSON output). */
export async function parseWithGemini(env: Env, text: string, today: string, weekday: string): Promise<ParsedTask> {
  if (!env.GEMINI_API_KEY) throw new GeminiError('gemini not configured', true);
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const base = env.GEMINI_API_URL || DEFAULT_BASE;
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instruction(today, weekday) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: SCHEMA,
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    }),
  });
  if (!res.ok) throw new GeminiError(`gemini http ${res.status}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const raw = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '');
  } catch {
    throw new GeminiError('gemini returned invalid json');
  }
  const title = typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 200) : '';
  return {
    title: title || text.trim().slice(0, 200),
    dueDate: isDate(parsed.dueDate) ? parsed.dueDate : null,
    priority: parsed.priority === 'high' || parsed.priority === 'low' ? parsed.priority : 'medium',
  };
}
