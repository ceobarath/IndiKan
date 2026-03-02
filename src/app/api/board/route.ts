import { NextResponse } from "next/server";
import {
  getBoard,
  saveBoard,
  type CardRecord,
  type ColumnRecord,
} from "@/lib/sqlite";

export const runtime = "nodejs";

const isColumnArray = (value: unknown): value is ColumnRecord[] => {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item._id === "string" &&
      typeof item.title === "string" &&
      typeof item.order === "number"
  );
};

const isCardArray = (value: unknown): value is CardRecord[] => {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item._id === "string" &&
      typeof item.title === "string" &&
      typeof item.columnId === "string" &&
      typeof item.order === "number" &&
      typeof item.priority === "string" &&
      typeof item.archived === "boolean" &&
      typeof item.overflowed === "boolean" &&
      typeof item.updatedAt === "number" &&
      typeof item.timeSeconds === "number"
  );
};

export async function GET() {
  try {
    const board = getBoard();
    return NextResponse.json(board);
  } catch (error) {
    console.error("GET /api/board failed", error);
    return NextResponse.json(
      { error: "Failed to load board." },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as {
      columns?: unknown;
      cards?: unknown;
    };
    if (!isColumnArray(payload.columns) || !isCardArray(payload.cards)) {
      return NextResponse.json(
        { error: "Invalid board payload." },
        { status: 400 }
      );
    }

    saveBoard({
      columns: payload.columns,
      cards: payload.cards,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/board failed", error);
    return NextResponse.json(
      { error: "Failed to save board." },
      { status: 500 }
    );
  }
}
