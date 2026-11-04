import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path = 'data/tailorkit.db') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, pass_hash TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'free', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      resume TEXT NOT NULL, original_text TEXT NOT NULL DEFAULT '', source_format TEXT NOT NULL DEFAULT '',
      facts TEXT NOT NULL DEFAULT '{}', confirmed_skills TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', jd_text TEXT NOT NULL DEFAULT '',
      requirements TEXT NOT NULL DEFAULT '{}', match TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'saved', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), applied_at TEXT
    );
    CREATE INDEX IF NOT EXISTS jobs_user ON jobs(user_id, created_at);
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, label TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL, changes TEXT NOT NULL DEFAULT '[]', suggestions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS company_research (
      company_key TEXT PRIMARY KEY, data TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'basic', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS job_prep (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, data TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS one_time_tokens (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS waitlist (
      email TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS resumes_user ON resumes(user_id, created_at);
    -- One row per job per month: re-tailoring the same job is free, deleting a job does not refund the quota.
    -- One row per successful payment. payment_id is unique so a repeated webhook can never credit twice.
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_id TEXT NOT NULL UNIQUE, pack_id TEXT NOT NULL, credits INTEGER NOT NULL, amount INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS job_chat (job_id INTEGER PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE, n INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, month TEXT NOT NULL, job_key TEXT NOT NULL,
      PRIMARY KEY (user_id, month, job_key)
    );
  `);
  // Added after the first release: a stable identity for "the same job" (see capture).
  if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'google_id')) db.exec("ALTER TABLE users ADD COLUMN google_id TEXT NOT NULL DEFAULT ''");
  if (!db.prepare('PRAGMA table_info(jobs)').all().some((c) => c.name === 'job_key')) {
    db.exec("ALTER TABLE jobs ADD COLUMN job_key TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(jobs)').all().some((c) => c.name === 'logo')) db.exec("ALTER TABLE jobs ADD COLUMN logo TEXT NOT NULL DEFAULT ''");
  db.exec('CREATE INDEX IF NOT EXISTS jobs_key ON jobs(user_id, job_key)');
  return db;
}
