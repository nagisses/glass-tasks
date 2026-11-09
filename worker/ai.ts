import type { Env } from './types';

const SYSTEM_PROMPT = [
  'あなたはタスク分解アシスタントです。',
  'ユーザーのタスクを、すぐに着手できる具体的なサブタスクに分解します。',
  'ルール:',
  '- サブタスクは3〜6個。実行する順番に並べる。',
  '- 各サブタスクは日本語で、40文字以内、動作で終わる短い文にする。',
  '- 番号・記号・説明文・前置きは付けない。',
  '- JSONのみを返す。',
].join('\n');

const SCHEMA = {
  type: 'object',
  properties: {
    subtasks: { type: 'array', items: { type: 'string' } },
  },
  required: ['subtasks'],
};

export class AiError extends Error {}

function clean(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const s = raw
      .replace(/^\s*(?:[-*・•]|\d+[.)．、])\s*/, '')
      .trim()
      .slice(0, 80);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out.slice(0, 6);
}

function parseResponse(response: unknown): string[] {
  let value = response;
  if (typeof value === 'string') {
    const match = value.match(/\{[\s\S]*\}/);
    if (!match) throw new AiError('invalid ai response');
    try {
      value = JSON.parse(match[0]);
    } catch {
      throw new AiError('invalid ai response');
    }
  }
  const items = clean((value as { subtasks?: unknown } | null)?.subtasks);
  if (items.length === 0) throw new AiError('empty ai response');
  return items;
}

/** Splits a task into concrete subtasks with Workers AI (JSON mode). */
export async function breakdownTask(env: Env, title: string, note: string): Promise<string[]> {
  if (env.AI_MODE === 'mock') {
    return [`${title}の情報を集める`, `${title}の手順を決める`, `${title}を進める`, '仕上がりを確認する'];
  }
  if (!env.AI) throw new AiError('ai binding missing');

  const user = note ? `タスク: ${title}\nメモ: ${note}` : `タスク: ${title}`;
  let result: { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  try {
    result = (await env.AI.run(env.AI_MODEL as keyof AiModels, {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
      max_tokens: 512,
      temperature: 0.4,
    } as never)) as typeof result;
  } catch (e) {
    throw new AiError(e instanceof Error ? e.message : 'ai failed');
  }
  // JSON mode may answer in the OpenAI-style shape (choices[0].message.content) instead of `response`
  return parseResponse(result?.response ?? result?.choices?.[0]?.message?.content);
}
