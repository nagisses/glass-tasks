export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AI?: Ai;
  AI_MODEL: string;
  /** "mock" returns deterministic AI output (E2E tests only) */
  AI_MODE?: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  /** Overridable only so E2E tests can point at a local mock OAuth server */
  GOOGLE_AUTH_URL?: string;
  GOOGLE_TOKEN_URL?: string;
  GOOGLE_USERINFO_URL?: string;
  /** Optional public origin when the app sits behind a dev proxy */
  APP_ORIGIN?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export type AppEnv = { Bindings: Env; Variables: { user: User } };

export type Status = 'todo' | 'doing' | 'done';
export type Priority = 'high' | 'medium' | 'low';
