import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  columns: defineTable({
    title: v.string(),
    order: v.number(),
  })
    .index("by_order", ["order"]),
  cards: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    columnId: v.id("columns"),
    order: v.number(),
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    dueDate: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    archived: v.boolean(),
    overflowed: v.optional(v.boolean()),
    timeSeconds: v.number(),
    timerStartedAt: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  })
    .index("by_column_order", ["columnId", "order"]),
});
