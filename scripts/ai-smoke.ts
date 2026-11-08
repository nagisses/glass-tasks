// Calls the real Workers AI (through Wrangler's platform proxy) with the same prompt the app uses.
// Requires `npx wrangler login`. Usage: node scripts/ai-smoke.ts "引っ越しの準備"
import { getPlatformProxy } from 'wrangler';
import { breakdownTask } from '../worker/ai.ts';
import type { Env } from '../worker/types.ts';

const title = process.argv[2] ?? '引っ越しの準備をする';
const proxy = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' });
try {
  const started = Date.now();
  const items = await breakdownTask(proxy.env, title, '');
  console.log(JSON.stringify({ title, model: proxy.env.AI_MODEL, ms: Date.now() - started, items }, null, 2));
} finally {
  await proxy.dispose();
}
