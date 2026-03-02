import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type Priority = "low" | "medium" | "high";

export type ColumnRecord = {
  _id: string;
  title: string;
  order: number;
};

export type CardRecord = {
  _id: string;
  title: string;
  description?: string;
  columnId: string;
  order: number;
  priority: Priority;
  dueDate?: string;
  archived: boolean;
  overflowed: boolean;
  updatedAt: number;
  timeSeconds: number;
  timerStartedAt?: number;
  tags?: string[];
};

const defaultColumns: ColumnRecord[] = [
  { _id: "col-todo", title: "Todo", order: 1000 },
  { _id: "col-in-progress", title: "In Progress", order: 2000 },
  { _id: "col-blocked-review", title: "Blocked/Review", order: 3000 },
  { _id: "col-done", title: "Done", order: 4000 },
];

const starterCards: Array<{
  title: string;
  description: string;
  columnId: string;
  priority: Priority;
}> = [
  {
    title: "Define product promise",
    description: "One sentence that makes it easy to say no to everything else.",
    columnId: "col-todo",
    priority: "medium",
  },
  {
    title: "Design the first-run onboarding",
    description: "Sketch the first 3 screens or steps.",
    columnId: "col-in-progress",
    priority: "high",
  },
  {
    title: "Set up feedback capture",
    description: "Decide where early users can leave notes.",
    columnId: "col-blocked-review",
    priority: "low",
  },
  {
    title: "Ship v0.1 to one user",
    description: "Pick a single person and get it into their hands.",
    columnId: "col-done",
    priority: "medium",
  },
];

const dbFile = path.join(process.cwd(), "data", "indikan.sqlite");

const openDb = () => {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      "order" INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      column_id TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      priority TEXT NOT NULL,
      due_date TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      overflowed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      time_seconds INTEGER NOT NULL DEFAULT 0,
      timer_started_at INTEGER,
      tags_json TEXT,
      FOREIGN KEY(column_id) REFERENCES columns(id)
    );
  `);
  return db;
};

const globalForDb = globalThis as typeof globalThis & {
  indikanDb?: DatabaseSync;
};

const db = globalForDb.indikanDb ?? openDb();
globalForDb.indikanDb = db;

const ensureDefaults = () => {
  const row = db.prepare("SELECT COUNT(*) as count FROM columns").get() as {
    count: number;
  };
  if (row.count > 0) return;

  const now = Date.now();
  const insertColumn = db.prepare(
    'INSERT INTO columns (id, title, "order") VALUES (?, ?, ?)'
  );
  const insertCard = db.prepare(`
    INSERT INTO cards (
      id, title, description, column_id, "order", priority, due_date,
      archived, overflowed, updated_at, time_seconds, timer_started_at, tags_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const column of defaultColumns) {
      insertColumn.run(column._id, column.title, column.order);
    }
    for (let index = 0; index < starterCards.length; index += 1) {
      const card = starterCards[index];
      insertCard.run(
        `seed-${index + 1}`,
        card.title,
        card.description,
        card.columnId,
        (index + 1) * 1000,
        card.priority,
        null,
        0,
        0,
        now,
        0,
        null,
        JSON.stringify([])
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export const getBoard = (): { columns: ColumnRecord[]; cards: CardRecord[] } => {
  ensureDefaults();
  const columns = db
    .prepare('SELECT id, title, "order" FROM columns ORDER BY "order" ASC')
    .all() as Array<{ id: string; title: string; order: number }>;
  const cards = db
    .prepare(
      `SELECT
        id,
        title,
        description,
        column_id,
        "order",
        priority,
        due_date,
        archived,
        overflowed,
        updated_at,
        time_seconds,
        timer_started_at,
        tags_json
      FROM cards
      ORDER BY "order" ASC, updated_at ASC`
    )
    .all() as Array<{
    id: string;
    title: string;
    description: string | null;
    column_id: string;
    order: number;
    priority: Priority;
    due_date: string | null;
    archived: number;
    overflowed: number;
    updated_at: number;
    time_seconds: number;
    timer_started_at: number | null;
    tags_json: string | null;
  }>;

  return {
    columns: columns.map((column) => ({
      _id: column.id,
      title: column.title,
      order: column.order,
    })),
    cards: cards.map((card) => ({
      _id: card.id,
      title: card.title,
      description: card.description ?? undefined,
      columnId: card.column_id,
      order: card.order,
      priority: card.priority,
      dueDate: card.due_date ?? undefined,
      archived: Boolean(card.archived),
      overflowed: Boolean(card.overflowed),
      updatedAt: card.updated_at,
      timeSeconds: card.time_seconds,
      timerStartedAt: card.timer_started_at ?? undefined,
      tags: (() => {
        if (!card.tags_json) return [];
        try {
          const parsed = JSON.parse(card.tags_json);
          return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
        } catch {
          return [];
        }
      })(),
    })),
  };
};

export const saveBoard = (board: {
  columns: ColumnRecord[];
  cards: CardRecord[];
}) => {
  const insertColumn = db.prepare(
    'INSERT INTO columns (id, title, "order") VALUES (?, ?, ?)'
  );
  const insertCard = db.prepare(`
    INSERT INTO cards (
      id, title, description, column_id, "order", priority, due_date,
      archived, overflowed, updated_at, time_seconds, timer_started_at, tags_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM cards");
    db.exec("DELETE FROM columns");

    for (const column of board.columns) {
      insertColumn.run(column._id, column.title, column.order);
    }

    for (const card of board.cards) {
      insertCard.run(
        card._id,
        card.title,
        card.description ?? null,
        card.columnId,
        card.order,
        card.priority,
        card.dueDate ?? null,
        card.archived ? 1 : 0,
        card.overflowed ? 1 : 0,
        card.updatedAt,
        card.timeSeconds,
        card.timerStartedAt ?? null,
        JSON.stringify(card.tags ?? [])
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
