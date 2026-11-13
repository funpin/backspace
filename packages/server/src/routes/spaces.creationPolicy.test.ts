import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../db/schema.js';
import { setWorkerId } from '../utils/snowflake.js';

setWorkerId(1);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

type TestDb = ReturnType<typeof drizzle<typeof schema>>;
let sqlite: Database.Database;
let testDb: TestDb;
let currentUserId = 'member';
let adminOnly = false;

vi.mock('../db/index.js', () => ({
  getDb: () => testDb,
  getRawDb: () => sqlite,
  schema,
}));

vi.mock('../utils/auth.js', () => ({
  authenticate: async (req: { userId?: string }) => {
    req.userId = currentUserId;
  },
}));

vi.mock('../ws/handler.js', () => ({
  connectionManager: {
    addUserSpace: vi.fn(),
    sendToSpace: vi.fn(),
    sendToUser: vi.fn(),
  },
}));

vi.mock('../config.js', async () => {
  const real = await import('../config.js');
  return {
    config: new Proxy(real.config, {
      get(target, prop: string) {
        if (prop === 'spaceCreationAdminOnly') return adminOnly;
        return (target as Record<string, unknown>)[prop];
      },
    }),
  };
});

function applyMigrations(db: Database.Database): void {
  const migrationsDir = path.resolve(__dirname, '../../drizzle');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sqlText = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    for (const stmt of sqlText.split(/-->\s*statement-breakpoint/)) {
      const clean = stmt.trim();
      if (clean) db.exec(clean);
    }
  }
}

const now = 1_700_000_000_000;
let app: FastifyInstance;

function createSpace(name: string) {
  return app.inject({ method: 'POST', url: '/api/spaces', payload: { name } });
}

beforeEach(async () => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  applyMigrations(sqlite);
  testDb = drizzle(sqlite, { schema });
  adminOnly = false;
  currentUserId = 'member';

  testDb.insert(schema.users).values({ id: 'admin', username: 'admin', passwordHash: 'x', isAdmin: 1, createdAt: now }).run();
  testDb.insert(schema.users).values({ id: 'member', username: 'member', passwordHash: 'x', createdAt: now }).run();

  const { spaceRoutes } = await import('./spaces.js');
  app = Fastify();
  await app.register(spaceRoutes);
});

describe('SPACE_CREATION_ADMIN_ONLY', () => {
  it('lets any member create a space while the policy is off', async () => {
    const res = await createSpace('Open');
    expect(res.statusCode).toBeLessThan(300);
    expect(testDb.select().from(schema.spaces).all()).toHaveLength(1);
  });

  it('refuses a member with 403 forbidden and creates nothing while the policy is on', async () => {
    adminOnly = true;
    const res = await createSpace('Closed');
    expect(res.statusCode).toBe(403);
    expect(res.json<{ code?: string }>().code).toBe('forbidden');
    expect(testDb.select().from(schema.spaces).all()).toHaveLength(0);
  });

  it('still lets an instance admin create a space while the policy is on', async () => {
    adminOnly = true;
    currentUserId = 'admin';
    const res = await createSpace('Admin space');
    expect(res.statusCode).toBeLessThan(300);
    expect(testDb.select().from(schema.spaces).all()).toHaveLength(1);
  });

  it('refuses a caller with no user row while the policy is on', async () => {
    adminOnly = true;
    currentUserId = 'ghost';
    const res = await createSpace('Ghost');
    expect(res.statusCode).toBe(403);
  });
});
