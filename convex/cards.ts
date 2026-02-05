
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getCards = query({
  args: {
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_user_column_order", (q) => q.eq("userId", userId))
      .collect();
    if (args.includeArchived) {
      return cards;
    }
    return cards.filter((card) => !card.archived);
  },
});

export const createCard = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    columnId: v.id("columns"),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    dueDate: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const column = await ctx.db.get(args.columnId);
    if (!column || column.userId !== userId) {
      throw new Error("Unauthorized");
    }
    const last = await ctx.db
      .query("cards")
      .withIndex("by_user_column_order", (q) =>
        q.eq("userId", userId).eq("columnId", args.columnId)
      )
      .order("desc")
      .first();

    const nextOrder = last ? last.order + 1000 : 1000;

    return ctx.db.insert("cards", {
      title: args.title,
      description: args.description,
      columnId: args.columnId,
      order: nextOrder,
      priority: args.priority,
      dueDate: args.dueDate,
      tags: args.tags ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      archived: false,
      overflowed: false,
      timeSeconds: 0,
      userId,
    });
  },
});

export const updateCard = mutation({
  args: {
    id: v.id("cards"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    priority: v.optional(
      v.union(v.literal("low"), v.literal("medium"), v.literal("high"))
    ),
    dueDate: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const card = await ctx.db.get(args.id);
    if (!card || card.userId !== userId) {
      throw new Error("Unauthorized");
    }
    const { id, title, description, priority, dueDate, tags } = args;
    const updates: {
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      dueDate?: string;
      updatedAt?: number;
      tags?: string[];
    } = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (tags !== undefined) updates.tags = tags;

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = Date.now();
      await ctx.db.patch(id, updates);
    }
  },
});

export const setOverflow = mutation({
  args: {
    id: v.id("cards"),
    overflowed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const card = await ctx.db.get(args.id);
    if (!card || card.userId !== userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.id, {
      overflowed: args.overflowed,
      updatedAt: Date.now(),
    });
  },
});

export const reorderCards = mutation({
  args: {
    updates: v.array(
      v.object({
        id: v.id("cards"),
        order: v.number(),
        columnId: v.optional(v.id("columns")),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    for (const update of args.updates) {
      const card = await ctx.db.get(update.id);
      if (!card || card.userId !== userId) {
        throw new Error("Unauthorized");
      }
      const patch: { order: number; columnId?: Id<"columns"> } = {
        order: update.order,
      };

      if (update.columnId) {
        const column = await ctx.db.get(update.columnId as Id<"columns">);
        if (!column || column.userId !== userId) {
          throw new Error("Unauthorized");
        }
        patch.columnId = update.columnId as Id<"columns">;
      }

      await ctx.db.patch(update.id, patch);
    }
  },
});

export const toggleArchive = mutation({
  args: {
    id: v.id("cards"),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const card = await ctx.db.get(args.id);
    if (!card || card.userId !== userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.id, {
      archived: args.archived,
      updatedAt: Date.now(),
    });
  },
});

export const toggleTimer = mutation({
  args: {
    id: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const card = await ctx.db.get(args.id);
    if (!card || card.userId !== userId) return;

    if (card.timerStartedAt) {
      const elapsed = Math.max(0, Date.now() - card.timerStartedAt);
      const additionalSeconds = Math.floor(elapsed / 1000);
      await ctx.db.patch(args.id, {
        timerStartedAt: undefined,
        timeSeconds: card.timeSeconds + additionalSeconds,
        updatedAt: Date.now(),
      });
      return;
    }

    if (card.overflowed) {
      return;
    }

    const columns = await ctx.db
      .query("columns")
      .withIndex("by_user_order", (q) => q.eq("userId", userId))
      .collect();
    const focusColumnId = columns[1]?._id;
    if (!focusColumnId || card.columnId !== focusColumnId) {
      return;
    }

    const running = await ctx.db
      .query("cards")
      .withIndex("by_user_column_order", (q) => q.eq("userId", userId))
      .collect();
    for (const existing of running) {
      if (existing.timerStartedAt) {
        const elapsed = Math.max(0, Date.now() - existing.timerStartedAt);
        const additionalSeconds = Math.floor(elapsed / 1000);
        await ctx.db.patch(existing._id, {
          timerStartedAt: undefined,
          timeSeconds: existing.timeSeconds + additionalSeconds,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.patch(args.id, {
      timerStartedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteCard = mutation({
  args: { id: v.id("cards") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const card = await ctx.db.get(args.id);
    if (!card || card.userId !== userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.delete(args.id);
  },
});
