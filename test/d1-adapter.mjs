// Minimal D1-compatible adapter over node:sqlite, so the Worker's community
// code (which talks to env.DB) can run against a real SQLite database in tests.
// Run Node with --experimental-sqlite.
import { DatabaseSync } from "node:sqlite";

function coerce(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

class Stmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.params = [];
  }
  bind(...params) {
    this.params = params.map(coerce);
    return this;
  }
  async first(col) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (row == null) return null;
    return col ? row[col] : { ...row };
  }
  async all() {
    const rows = this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r }));
    return { results: rows, success: true, meta: {} };
  }
  async run() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  }
}

class D1 {
  constructor(db) {
    this.db = db;
  }
  prepare(sql) {
    return new Stmt(this.db, sql);
  }
  async batch(stmts) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

export function makeD1(schemaSqls = []) {
  const db = new DatabaseSync(":memory:");
  for (const sql of schemaSqls) db.exec(sql);
  return new D1(db);
}
