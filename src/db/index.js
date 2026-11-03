import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function openDatabase(path = process.env.DB_PATH || './data/courier.sqlite') {
  const file = path === ':memory:' ? path : resolve(path);
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.exec('INSERT OR IGNORE INTO user_roles(user_id,role) SELECT id,role FROM users');
  const columns = new Set(db.prepare('PRAGMA table_info(orders)').all().map(row => row.name));
  if (!columns.has('pickup_district')) db.exec("ALTER TABLE orders ADD COLUMN pickup_district TEXT NOT NULL DEFAULT ''");
  if (!columns.has('dropoff_address')) db.exec("ALTER TABLE orders ADD COLUMN dropoff_address TEXT NOT NULL DEFAULT ''");
  if (!columns.has('item_category')) db.exec("ALTER TABLE orders ADD COLUMN item_category TEXT NOT NULL DEFAULT ''");
  if (!columns.has('item_description')) db.exec("ALTER TABLE orders ADD COLUMN item_description TEXT NOT NULL DEFAULT ''");
  if (!columns.has('weight_grams')) db.exec('ALTER TABLE orders ADD COLUMN weight_grams INTEGER NOT NULL DEFAULT 0');
  if (!columns.has('chargeable_grams')) db.exec('ALTER TABLE orders ADD COLUMN chargeable_grams INTEGER NOT NULL DEFAULT 0');
  return db;
}
