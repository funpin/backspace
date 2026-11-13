import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let testDb: TestDb;
let testRawDb: Database.Database;
let tmpUploadDir: string;
let retentionDays = 0;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => testRawDb,
  schema,
}));

vi.mock('../config.js', async () => {
  const real = await import('../config.js');
  return {
    config: new Proxy(real.config, {
      get(target, prop: string) {
        if (prop === 'uploadDir') return tmpUploadDir;
        if (prop === 'chatMediaRetentionDays') return retentionDays;
        return (target as Record<string, unknown>)[prop];
      },
    }),
  };
});

const DAY = 24 * 60 * 60 * 1000;

function applyMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    for (const stmt of sql.split(/-->\s*statement-breakpoint/)) {
      const clean = stmt.trim();
      if (clean) db.exec(clean);
    }
  }
}

/** A file on disk plus its attachment row. `linked` attaches it to a message. */
function addAttachment(id: string, ageDays: number, linked: boolean): string {
  const filename = `${id}.png`;
  fs.writeFileSync(path.join(tmpUploadDir, filename), 'data');
  testDb.insert(schema.attachments).values({
    id,
    messageId: linked ? `msg-${id}` : null,
    dmMessageId: null,
    uploaderId: 'user-1',
    filename,
    originalName: filename,
    mimetype: 'image/png',
    size: 100,
    createdAt: Date.now() - ageDays * DAY,
  } as typeof schema.attachments.$inferInsert).run();
  return filename;
}

const onDisk = (filename: string) => fs.existsSync(path.join(tmpUploadDir, filename));
const rowIds = () => testDb.select({ id: schema.attachments.id }).from(schema.attachments).all().map((r) => r.id).sort();

beforeEach(() => {
  tmpUploadDir = path.join(os.tmpdir(), `backspace-retention-${crypto.randomBytes(8).toString('hex')}`);
  fs.mkdirSync(tmpUploadDir, { recursive: true });
  testRawDb = new Database(':memory:');
  applyMigrations(testRawDb);
  // The rows under test stand in for attachments of messages this test never
  // creates; the sweep reads only the attachment row and the file.
  testRawDb.pragma('foreign_keys = OFF');
  testDb = drizzle(testRawDb, { schema });
  retentionDays = 0;
});

afterEach(() => {
  testRawDb.close();
  fs.rmSync(tmpUploadDir, { recursive: true, force: true });
});

describe('CHAT_MEDIA_RETENTION_DAYS', () => {
  it('does nothing and returns null while the policy is off', async () => {
    const { applyChatMediaRetention } = await import('./storageJanitor.js');
    const old = addAttachment('old', 30, true);

    expect(applyChatMediaRetention()).toBeNull();
    expect(onDisk(old)).toBe(true);
    expect(rowIds()).toEqual(['old']);
  });

  it('deletes message attachments past the window, file and row, and keeps newer ones', async () => {
    const { applyChatMediaRetention } = await import('./storageJanitor.js');
    retentionDays = 7;
    const old = addAttachment('old', 8, true);
    const fresh = addAttachment('fresh', 6, true);

    const result = applyChatMediaRetention();

    expect(result?.deletedFiles).toBe(1);
    expect(result?.deletedAttachmentRecords).toBe(1);
    expect(result?.errors).toEqual([]);
    expect(onDisk(old)).toBe(false);
    expect(onDisk(fresh)).toBe(true);
    expect(rowIds()).toEqual(['fresh']);
  });

  it('leaves an old upload that is not attached to any message to the other sweeps', async () => {
    const { applyChatMediaRetention } = await import('./storageJanitor.js');
    retentionDays = 7;
    const unlinked = addAttachment('unlinked', 30, false);

    expect(applyChatMediaRetention()?.deletedFiles).toBe(0);
    expect(onDisk(unlinked)).toBe(true);
  });
});
