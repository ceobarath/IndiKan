import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const defaultColumns = [
  { title: "Todo", order: 1000 },
  { title: "In Progress", order: 2000 },
  { title: "Blocked/Review", order: 3000 },
  { title: "Done", order: 4000 },
];

const starterCards = [
  {
    title: "Define product promise",
    description: "One sentence that makes it easy to say no to everything else.",
    columnTitle: "Todo",
    priority: "medium",
  },
  {
    title: "Design the first-run onboarding",
    description: "Sketch the first 3 screens or steps.",
    columnTitle: "In Progress",
    priority: "high",
  },
  {
    title: "Set up feedback capture",
    description: "Decide where early users can leave notes.",
    columnTitle: "Blocked/Review",
    priority: "low",
  },
  {
    title: "Ship v0.1 to one user",
    description: "Pick a single person and get it into their hands.",
    columnTitle: "Done",
    priority: "medium",
  },
] as const;

export const getColumns = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("columns")
      .withIndex("by_order", (q) => q)
      .collect();
  },
});

export const ensureDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("columns").first();
    if (existing) {
      return;
    }

    const createdIds: Record<string, Id<"columns">> = {};
    for (const column of defaultColumns) {
      const id = await ctx.db.insert("columns", { ...column });
      createdIds[column.title] = id;
    }

    const now = Date.now();
    const orderByColumn: Record<Id<"columns">, number> = {};
    for (const card of starterCards) {
      const columnId = createdIds[card.columnTitle];
      if (!columnId) continue;
      orderByColumn[columnId] = (orderByColumn[columnId] ?? 0) + 1;
      await ctx.db.insert("cards", {
        title: card.title,
        description: card.description,
        columnId,
        order: orderByColumn[columnId] * 1000,
        priority: card.priority,
        createdAt: now,
        updatedAt: now,
        archived: false,
        overflowed: false,
        timeSeconds: 0,
        tags: [],
      });
    }
  },
});

export const createColumn = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const columns = await ctx.db.query("columns").collect();
    const maxOrder = columns.reduce(
      (max, column) => (column.order > max ? column.order : max),
      0
    );
    const nextOrder = maxOrder ? maxOrder + 1000 : 1000;
    return ctx.db.insert("columns", {
      title: args.title,
      order: nextOrder,
    });
  },
});

export const updateColumn = mutation({
  args: { id: v.id("columns"), title: v.string() },
  handler: async (ctx, args) => {
    const column = await ctx.db.get(args.id);
    if (!column) return;
    await ctx.db.patch(args.id, { title: args.title });
  },
});

export const normalizeDefaultColumnNames = mutation({
  args: {},
  handler: async (ctx) => {
    const columns = await ctx.db
      .query("columns")
      .withIndex("by_order", (q) => q)
      .collect();
    if (columns.length === 0) return;

    const byTitle = new Map<string, typeof columns[number]>();
    for (const column of columns) {
      byTitle.set(column.title.toLowerCase(), column);
    }

    const hasTodo = byTitle.has("todo");
    const hasDone = byTitle.has("done");
    const backlog = byTitle.get("backlog");
    const blocked = byTitle.get("blocked");
    const blockedReview = byTitle.get("blocked/review");

    if (!hasDone && backlog) {
      await ctx.db.patch(backlog._id, { title: "Done" });
    } else if (!hasTodo && backlog) {
      await ctx.db.patch(backlog._id, { title: "Todo" });
    }

    if (!blockedReview && blocked) {
      await ctx.db.patch(blocked._id, { title: "Blocked/Review" });
    }
  },
});

export const forceDefaultColumnTitles = mutation({
  args: {},
  handler: async (ctx) => {
    const columns = await ctx.db
      .query("columns")
      .withIndex("by_order", (q) => q)
      .collect();
    if (columns.length === 0) return;

    const targetTitles = ["Todo", "In Progress", "Blocked/Review", "Done"];
    for (let index = 0; index < targetTitles.length; index += 1) {
      const column = columns[index];
      if (!column) continue;
      const nextTitle = targetTitles[index];
      if (column.title !== nextTitle) {
        await ctx.db.patch(column._id, { title: nextTitle });
      }
    }
  },
});

export const claimExistingData = mutation({
  args: {},
  handler: async () => undefined,
});
