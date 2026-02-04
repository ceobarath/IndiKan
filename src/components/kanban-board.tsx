"use client";

import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DropAnimation,
  defaultDropAnimationSideEffects,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  defaultAnimateLayoutChanges,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import confetti from "canvas-confetti";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckSquare,
  Clock,
  Archive,
  Eye,
  Minus,
  Pencil,
  Search,
  Square,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const priorities = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const MAX_VISIBLE_COLUMNS = 4;

type Priority = (typeof priorities)[number]["value"];

type CardRecord = {
  _id: Id<"cards">;
  title: string;
  description?: string;
  columnId: Id<"columns">;
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

type ColumnRecord = {
  _id: Id<"columns">;
  title: string;
  order: number;
};


export default function KanbanBoard() {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [tagFilters, setTagFilters] = useState<Set<string>>(
    () => new Set()
  );
  const [dateFilter, setDateFilter] = useState({
    from: "",
    to: "",
  });

  const columns = (useQuery(api.columns.getColumns) ?? []) as ColumnRecord[];
  const cards = ((useQuery(api.cards.getCards, {
    includeArchived: true,
  }) ?? []) as CardRecord[]).map((card) => ({
    ...card,
    overflowed: card.overflowed ?? false,
  }));

  const ensureDefaults = useMutation(api.columns.ensureDefaults);
  const updateColumn = useMutation(api.columns.updateColumn);
  const createCard = useMutation(api.cards.createCard);
  const updateCard = useMutation(api.cards.updateCard);
  const toggleArchive = useMutation(api.cards.toggleArchive);
  const toggleTimer = useMutation(api.cards.toggleTimer);
  const setOverflow = useMutation(api.cards.setOverflow);
  const reorderCards = useMutation(api.cards.reorderCards);
  const deleteCard = useMutation(api.cards.deleteCard);

  const [quickForm, setQuickForm] = useState({
    title: "",
    description: "",
    tags: "",
    priority: "medium" as Priority,
    dueDate: "",
    columnId: "",
  });
  const [seeded, setSeeded] = useState(false);
  const [focusedCardId, setFocusedCardId] = useState<Id<"cards"> | null>(null);
  const [editingCardId, setEditingCardId] = useState<Id<"cards"> | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Id<"cards"> | null>(null);
  const [showQuickModal, setShowQuickModal] = useState(false);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(
    () => new Set()
  );
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [showPanels, setShowPanels] = useState(true);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerModalId, setTimerModalId] = useState<Id<"cards"> | null>(null);
  const [activeSelectionColumnId, setActiveSelectionColumnId] = useState<
    Id<"columns"> | null
  >(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    () => new Set()
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    ids: Id<"cards">[];
    label: string;
  } | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    tags: "",
    priority: "medium" as Priority,
    dueDate: "",
  });
  const [drafts, setDrafts] = useState<
    Array<{
      id: string;
      title: string;
      description: string;
      tags: string;
      priority: Priority;
      dueDate: string;
      columnId: string;
    }>
  >([]);

  const quickTitleRef = useRef<HTMLInputElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastOverIdRef = useRef<string | null>(null);

  const playTacticalSound = useCallback(
    async (variant: "tap" | "confirm" | "cancel" | "drag" = "tap") => {
      if (typeof window === "undefined") return;
      try {
        const AudioContextConstructor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioContextConstructor) return;
        const ctx = audioContextRef.current ?? new AudioContextConstructor();
        audioContextRef.current = ctx;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;

        const settings = {
          tap: { frequency: 520, duration: 0.08, gain: 0.06 },
          confirm: { frequency: 720, duration: 0.1, gain: 0.08 },
          cancel: { frequency: 320, duration: 0.1, gain: 0.06 },
          drag: { frequency: 420, duration: 0.06, gain: 0.05 },
        }[variant];

        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(settings.frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(settings.gain, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);

        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now);
        oscillator.stop(now + settings.duration + 0.02);
      } catch {
        // Ignore sound errors to avoid breaking interactions.
      }
    },
    []
  );

  const cardById = useMemo(() => {
    return new Map(cards.map((card) => [card._id, card]));
  }, [cards]);


  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!seeded && columns.length === 0) {
      void ensureDefaults();
      setSeeded(true);
    }
  }, [columns.length, ensureDefaults, seeded]);



  const orderedColumns = useMemo(() => {
    return [...columns].sort((a, b) => a.order - b.order);
  }, [columns]);

  const baseColumns = useMemo(() => {
    return orderedColumns.slice(0, MAX_VISIBLE_COLUMNS);
  }, [orderedColumns]);

  const sortedColumns = useMemo(() => {
    return baseColumns.filter((column) => !hiddenColumnIds.has(column._id));
  }, [baseColumns, hiddenColumnIds]);

  const focusColumnId = useMemo(() => {
    return baseColumns[1]?._id ?? null;
  }, [baseColumns]);

  const celebrateColumnId = useMemo(() => {
    return baseColumns[3]?._id ?? null;
  }, [baseColumns]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        if (editingCardId) {
          const activeEdit = cards.find((card) => card._id === editingCardId);
          if (activeEdit?.timerStartedAt) {
            void playTacticalSound("cancel");
            return;
          }
        }
        setEditingCardId(null);
        setFocusedCardId(null);
        setSearch("");
        setQuickForm((prev) => ({
          ...prev,
          title: "",
          description: "",
          tags: "",
          dueDate: "",
        }));
        setArchiveTarget(null);
        setShowQuickModal(false);
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        setQuickForm((prev) => ({ ...prev, columnId: "" }));
        setShowQuickModal(true);
        setTimeout(() => quickTitleRef.current?.focus(), 0);
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const filtersActive =
        Boolean(search.trim()) ||
        tagFilters.size > 0 ||
        Boolean(dateFilter.from) ||
        Boolean(dateFilter.to);

      if (focusedCardId && !filtersActive && ["1", "2", "3", "4"].includes(event.key)) {
        const index = Number(event.key) - 1;
        const targetColumn = sortedColumns[index];
        if (targetColumn) {
          void moveCardToColumn(focusedCardId, targetColumn._id);
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    focusedCardId,
    sortedColumns,
    search,
    tagFilters,
    dateFilter.from,
    dateFilter.to,
    editingCardId,
    cards,
    playTacticalSound,
  ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    cards.forEach((card) => {
      (card.tags ?? []).forEach((tag) => {
        if (tag.trim()) tagSet.add(tag);
      });
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  const filteredCards = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const fromDate = dateFilter.from ? new Date(dateFilter.from) : null;
    const toDate = dateFilter.to ? new Date(dateFilter.to) : null;

    return cards.filter((card) => {
      if (card.archived) return false;
      const matchesSearch =
        !normalizedSearch ||
        card.title.toLowerCase().includes(normalizedSearch) ||
        (card.description ?? "").toLowerCase().includes(normalizedSearch) ||
        (card.tags ?? []).some((tag) =>
          tag.toLowerCase().includes(normalizedSearch)
        );

      if (!matchesSearch) return false;

      if (tagFilters.size > 0) {
        const tagMatch = (card.tags ?? []).some((tag) =>
          tagFilters.has(tag)
        );
        if (!tagMatch) return false;
      }

      if (fromDate || toDate) {
        if (!card.dueDate) return false;
        const due = new Date(card.dueDate);
        if (fromDate && due < fromDate) return false;
        if (toDate && due > toDate) return false;
      }

      return true;
    });
  }, [cards, dateFilter.from, dateFilter.to, search, tagFilters]);

  const cardsByColumn = useMemo(() => {
    const map: Record<string, CardRecord[]> = {};
    for (const column of columns) {
      map[column._id] = [];
    }

    for (const card of filteredCards) {
      if (card.overflowed) continue;
      if (!map[card.columnId]) {
        map[card.columnId] = [];
      }
      map[card.columnId].push(card);
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.order - b.order);
    }

    return map;
  }, [filteredCards, columns]);

  const overflowCards = useMemo(() => {
    return filteredCards.filter((card) => card.overflowed);
  }, [filteredCards]);

  const archivedCards = useMemo(() => {
    return cards.filter((card) => card.archived);
  }, [cards]);

  const celebrateDone = () => {
    confetti({
      particleCount: 90,
      spread: 65,
      origin: { y: 0.6 },
    });
  };

  const showInProgressLimitNotice = useCallback(() => {
    setLimitNotice(
      "You can only work one thing at a time, bro. How are you doing 5? Keep In Progress at 5 max."
    );
    setShowLimitModal(true);
  }, []);

  const moveCardToColumn = async (
    cardId: Id<"cards">,
    targetColumnId: Id<"columns">
  ) => {
    const activeCard = cards.find((card) => card._id === cardId);
    if (!activeCard) return;

    const sourceColumnId = activeCard.columnId;
    if (sourceColumnId === targetColumnId) return;

    if (
      focusColumnId &&
      targetColumnId === focusColumnId &&
      sourceColumnId !== focusColumnId &&
      inProgressCount >= 5
    ) {
      showInProgressLimitNotice();
      void playTacticalSound("cancel");
      return;
    }

    const sourceCards = [...(cardsByColumn[sourceColumnId] ?? [])];
    const sourceIndex = sourceCards.findIndex((card) => card._id === cardId);
    if (sourceIndex < 0) return;

    const [movedCard] = sourceCards.splice(sourceIndex, 1);
    const targetCards = [...(cardsByColumn[targetColumnId] ?? [])];
    targetCards.push({ ...movedCard, columnId: targetColumnId });

    const updates = [
      ...sourceCards.map((card, index) => ({
        id: card._id,
        order: (index + 1) * 1000,
      })),
      ...targetCards.map((card, index) => ({
        id: card._id,
        order: (index + 1) * 1000,
        columnId: targetColumnId,
      })),
    ];

    await reorderCards({ updates });
    void playTacticalSound("confirm");
    if (activeCard.overflowed) {
      await setOverflow({ id: activeCard._id, overflowed: false });
    }
    if (celebrateColumnId && targetColumnId === celebrateColumnId) {
      celebrateDone();
    }

    if (
      focusColumnId &&
      sourceColumnId === focusColumnId &&
      targetColumnId !== focusColumnId &&
      movedCard.timerStartedAt
    ) {
      await toggleTimer({ id: movedCard._id });
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    void playTacticalSound("drag");
    setActiveDragId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveDragId(null);
    lastOverIdRef.current = null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) {
      return;
    }

    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId === overId) {
      return;
    }

    if (activeId.startsWith("draft:")) {
      const draftId = activeId.replace("draft:", "");
      const draft = drafts.find((item) => item.id === draftId);
      if (!draft) return;

      let targetColumnId: Id<"columns"> | null = null;
      if (overId.startsWith("column:")) {
        targetColumnId = overId.replace("column:", "") as Id<"columns">;
      } else {
        const overCard = cards.find((card) => card._id === overId);
        if (overCard) {
          targetColumnId = overCard.columnId;
        }
      }

      if (!targetColumnId) return;
      if (
        focusColumnId &&
        targetColumnId === focusColumnId &&
        inProgressCount >= 5
      ) {
        showInProgressLimitNotice();
        void playTacticalSound("cancel");
        return;
      }

      void playTacticalSound("confirm");
      const tags = draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      await createCard({
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        columnId: targetColumnId,
        priority: draft.priority,
        dueDate: draft.dueDate || undefined,
        tags,
      });
      setDrafts((prev) => prev.filter((item) => item.id !== draft.id));
      return;
    }

    if (overId === "archive" && !activeId.startsWith("archive:")) {
      const activeCard = cards.find((card) => card._id === activeId);
      if (!activeCard) return;
      if (activeCard.timerStartedAt) {
        await toggleTimer({ id: activeCard._id });
      }
      await toggleArchive({ id: activeCard._id, archived: true });
      void playTacticalSound("confirm");
      return;
    }

    if (overId === "overflow" && !activeId.startsWith("overflow:")) {
      const activeCard = cards.find((card) => card._id === activeId);
      if (!activeCard) return;
      if (activeCard.timerStartedAt) {
        await toggleTimer({ id: activeCard._id });
      }
      await setOverflow({ id: activeCard._id, overflowed: true });
      void playTacticalSound("confirm");
      return;
    }

    const resolvedActiveId = activeId.startsWith("overflow:")
      ? activeId.replace("overflow:", "")
      : activeId.startsWith("archive:")
        ? activeId.replace("archive:", "")
        : activeId;
    const activeCard = cards.find((card) => card._id === resolvedActiveId);
    if (!activeCard) {
      return;
    }

    const sourceColumnId = activeCard.columnId;
    let targetColumnId = sourceColumnId;
    let targetIndex = 0;

    if (overId.startsWith("column:")) {
      targetColumnId = overId.replace("column:", "");
      targetIndex = (cardsByColumn[targetColumnId] ?? []).length;
    } else {
      const overCard = cards.find((card) => card._id === overId);
      if (!overCard) {
        return;
      }
      targetColumnId = overCard.columnId;
      const targetCards = cardsByColumn[targetColumnId] ?? [];
      const overIndex = targetCards.findIndex((card) => card._id === overId);
      targetIndex = overIndex < 0 ? targetCards.length : overIndex;
    }

    const sourceCards = [...(cardsByColumn[sourceColumnId] ?? [])];
    const sourceIndex = sourceCards.findIndex(
      (card) => card._id === resolvedActiveId
    );
    if (sourceIndex < 0) {
      if (activeId.startsWith("overflow:") || activeId.startsWith("archive:")) {
        // From overflow to column: no reordering needed in source column.
      } else {
        return;
      }
    }

    const [movedCard] =
      sourceIndex >= 0 ? sourceCards.splice(sourceIndex, 1) : [activeCard];

    if (
      sourceColumnId === targetColumnId &&
      !activeId.startsWith("overflow:") &&
      !activeId.startsWith("archive:")
    ) {
      const adjustedIndex =
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      sourceCards.splice(adjustedIndex, 0, movedCard);

      const updates = sourceCards.map((card, index) => ({
        id: card._id,
        order: (index + 1) * 1000,
      }));

      await reorderCards({ updates });
      void playTacticalSound("confirm");
      return;
    }

    if (
      focusColumnId &&
      targetColumnId === focusColumnId &&
      sourceColumnId !== focusColumnId &&
      inProgressCount >= 5
    ) {
      showInProgressLimitNotice();
      void playTacticalSound("cancel");
      return;
    }

    const targetCards = [...(cardsByColumn[targetColumnId] ?? [])];
    targetCards.splice(targetIndex, 0, {
      ...movedCard,
      columnId: targetColumnId,
    });

    const updates = [
      ...sourceCards.map((card, index) => ({
        id: card._id,
        order: (index + 1) * 1000,
      })),
      ...targetCards.map((card, index) => ({
        id: card._id,
        order: (index + 1) * 1000,
        columnId: targetColumnId,
      })),
    ];

    await reorderCards({ updates });
    void playTacticalSound("confirm");
    if (activeCard.overflowed) {
      await setOverflow({ id: activeCard._id, overflowed: false });
    }
    if (activeCard.archived) {
      await toggleArchive({ id: activeCard._id, archived: false });
    }
    if (
      celebrateColumnId &&
      targetColumnId === celebrateColumnId &&
      sourceColumnId !== targetColumnId
    ) {
      celebrateDone();
    }

    if (
      focusColumnId &&
      sourceColumnId === focusColumnId &&
      targetColumnId !== focusColumnId &&
      movedCard.timerStartedAt
    ) {
      await toggleTimer({ id: movedCard._id });
    }
  };

  const handleQuickCreate = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();
    if (!quickForm.title.trim()) {
      return;
    }

    void playTacticalSound("confirm");
    const tags = quickForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    if (quickForm.columnId) {
      if (
        focusColumnId &&
        quickForm.columnId === focusColumnId &&
        inProgressCount >= 5
      ) {
        showInProgressLimitNotice();
        void playTacticalSound("cancel");
        return;
      }
      await createCard({
        title: quickForm.title.trim(),
        description: quickForm.description.trim() || undefined,
        columnId: quickForm.columnId as Id<"columns">,
        priority: quickForm.priority,
        dueDate: quickForm.dueDate || undefined,
        tags,
      });
    } else {
      const nextDraft = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : String(Date.now()),
        title: quickForm.title.trim(),
        description: quickForm.description.trim(),
        tags: quickForm.tags,
        priority: quickForm.priority,
        dueDate: quickForm.dueDate,
        columnId: "",
      };
      setDrafts((prev) => [nextDraft, ...prev]);
    }

    setQuickForm((prev) => ({
      ...prev,
      title: "",
      description: "",
      tags: "",
      dueDate: "",
      columnId: "",
    }));
  };


  const inProgressCount = useMemo(() => {
    if (!focusColumnId) return 0;
    return cards.filter(
      (card) =>
        !card.archived &&
        !card.overflowed &&
        card.columnId === focusColumnId
    ).length;
  }, [cards, focusColumnId]);

  const firstColumnId = useMemo(() => {
    return baseColumns[0]?._id ?? null;
  }, [baseColumns]);

  const editingCard = useMemo(() => {
    if (!editingCardId) return null;
    return cards.find((card) => card._id === editingCardId) ?? null;
  }, [cards, editingCardId]);

  useEffect(() => {
    if (!editingCard) return;
    setEditDraft({
      title: editingCard.title,
      description: editingCard.description ?? "",
      tags: (editingCard.tags ?? []).join(", "),
      priority: editingCard.priority,
      dueDate: editingCard.dueDate ?? "",
    });
  }, [editingCard?.updatedAt, editingCardId]);

  const handleEditToggle = (id: Id<"cards"> | null) => {
    if (!id) {
      if (editingCard?.timerStartedAt) {
        void playTacticalSound("cancel");
        return;
      }
      setEditingCardId(null);
      return;
    }
    setEditingCardId(id);
  };

  const activeTimerCard = useMemo(() => {
    return cards.find((card) => card.timerStartedAt && !card.overflowed);
  }, [cards]);

  useEffect(() => {
    if (activeTimerCard) {
      setTimerModalId(activeTimerCard._id);
    }
  }, [activeTimerCard?._id]);

  const timerModalCard = useMemo(() => {
    if (!timerModalId) return null;
    return cards.find((card) => card._id === timerModalId) ?? null;
  }, [cards, timerModalId]);

  const nextToFocusColumnId = useMemo(() => {
    return baseColumns[2]?._id ?? null;
  }, [baseColumns]);

  const handleTimerToggle = async ({ id }: { id: Id<"cards"> }) => {
    const card = cards.find((item) => item._id === id);
    if (card?.timerStartedAt) {
      setTimerModalId(id);
      setShowTimerModal(true);
      return;
    }
    await toggleTimer({ id });
    setTimerModalId(id);
    setShowTimerModal(true);
  };

  const dropAnimation: DropAnimation = {
    duration: 140,
    easing: "cubic-bezier(0.18, 0.9, 0.2, 1)",
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: "0.6",
        },
      },
    }),
  };

  const handleArchiveRequest = async (id: Id<"cards">, archived: boolean) => {
    if (!archived) {
      setArchiveTarget(id);
      return;
    }
    await toggleArchive({ id, archived: false });
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    await toggleArchive({ id: archiveTarget, archived: true });
    setArchiveTarget(null);
  };

  const openDeleteConfirm = (ids: Id<"cards">[], label: string) => {
    setDeleteTarget({ ids, label });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const ids = deleteTarget.ids;
    for (const id of ids) {
      const card = cardById.get(id);
      if (card?.timerStartedAt) {
        await toggleTimer({ id });
      }
    }
    await Promise.all(ids.map((id) => deleteCard({ id })));
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (editingCardId && ids.includes(editingCardId)) {
      handleEditToggle(null);
    }
    if (timerModalId && ids.includes(timerModalId)) {
      setShowTimerModal(false);
      setTimerModalId(null);
    }
    setDeleteTarget(null);
  };


  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-[color:var(--text)] sm:text-4xl">
              Indikan
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void playTacticalSound("tap");
                setQuickForm((prev) => ({ ...prev, columnId: "" }));
                setShowQuickModal(true);
                setTimeout(() => quickTitleRef.current?.focus(), 0);
              }}
              className="rounded-full bg-[color:var(--accent)] px-5 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--bg)] shadow-[var(--shadow)]"
            >
              Quick add
            </button>
          </div>
        </div>
      </div>

      {showLimitModal && limitNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
            <h3 className="text-lg font-semibold text-[color:var(--text)]">
              In Progress Limit
            </h3>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {limitNotice}
            </p>
            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("cancel");
                  setShowLimitModal(false);
                  setLimitNotice(null);
                }}
                className="rounded-full border border-[color:var(--stroke)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface)] p-5 shadow-[var(--shadow)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 shadow-sm">
          <span className="text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
            Search
          </span>
          <Search className="h-4 w-4 text-[color:var(--text-muted)]" aria-hidden="true" />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by title or notes"
            className="w-full border-0 bg-transparent text-sm text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-muted)]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
          <details className="relative">
            <summary
              onClick={() => void playTacticalSound("tap")}
              className="cursor-pointer list-none rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
              aria-label="Tag filters"
            >
              <Tags className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] p-3 text-xs font-semibold tracking-[0.06em] text-[color:var(--text-muted)] shadow-[var(--shadow)]">
              <p className="mb-2 text-[10px]">Filter by tags</p>
              {availableTags.length === 0 ? (
                <p className="text-[10px] text-[color:var(--text-muted)]">
                  No tags yet
                </p>
              ) : (
                availableTags.map((tag) => (
                  <label key={tag} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={tagFilters.has(tag)}
                      onChange={(event) => {
                        const next = new Set(tagFilters);
                        if (event.target.checked) {
                          next.add(tag);
                        } else {
                          next.delete(tag);
                        }
                        setTagFilters(next);
                        void playTacticalSound("tap");
                      }}
                      className="h-4 w-4 rounded border border-[color:var(--stroke)] accent-[color:var(--accent)]"
                    />
                    {tag}
                  </label>
                ))
              )}
            </div>
          </details>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
              From
            </span>
            <input
              type="date"
              value={dateFilter.from}
              onChange={(event) => {
                setDateFilter((prev) => ({ ...prev, from: event.target.value }));
                void playTacticalSound("tap");
              }}
              className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-1 text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
              To
            </span>
            <input
              type="date"
              value={dateFilter.to}
              onChange={(event) => {
                setDateFilter((prev) => ({ ...prev, to: event.target.value }));
                void playTacticalSound("tap");
              }}
              className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-1 text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
            />
          </div>
          <details className="relative">
            <summary
              onClick={() => void playTacticalSound("tap")}
              className="cursor-pointer list-none rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
              aria-label="Column visibility"
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
            </summary>
            <div className="absolute right-0 z-10 mt-2 w-56 rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] p-3 text-xs font-semibold tracking-[0.06em] text-[color:var(--text-muted)] shadow-[var(--shadow)]">
              <p className="mb-2 text-[10px]">Toggle columns</p>
              {baseColumns.map((column) => {
                const isHidden = hiddenColumnIds.has(column._id);
                return (
                  <label key={column._id} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={(event) => {
                        const next = new Set(hiddenColumnIds);
                        if (event.target.checked) {
                          next.delete(column._id);
                        } else {
                          next.add(column._id);
                        }
                        setHiddenColumnIds(next);
                        void playTacticalSound("tap");
                      }}
                      className="h-4 w-4 rounded border border-[color:var(--stroke)] accent-[color:var(--accent)]"
                    />
                    {column.title}
                  </label>
                );
              })}
            </div>
          </details>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragOver={(event) => {
          const nextOverId = event.over?.id
            ? String(event.over.id)
            : null;
          if (nextOverId && nextOverId !== lastOverIdRef.current) {
            lastOverIdRef.current = nextOverId;
            void playTacticalSound("drag");
          }
        }}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <OverflowPanel
            title="Drafts"
            helper="Quick adds land here. Drag cards in or out, or pick a column to send them into the board."
            droppableId="overflow"
            drafts={drafts}
            cards={overflowCards}
            columns={baseColumns}
            focusColumnId={focusColumnId}
            inProgressCount={inProgressCount}
            isOpen={showPanels}
            onToggle={() => setShowPanels((prev) => !prev)}
            onUpdateDraft={(id, columnId) => {
              setDrafts((prev) =>
                prev.map((item) =>
                  item.id === id ? { ...item, columnId } : item
                )
              );
            }}
            onSendDraft={async (draft) => {
              const targetId = draft.columnId as Id<"columns"> | null;
              if (!targetId) return;
              if (
                focusColumnId &&
                targetId === focusColumnId &&
                inProgressCount >= 5
              ) {
                showInProgressLimitNotice();
                void playTacticalSound("cancel");
                return;
              }
              void playTacticalSound("confirm");
              const tags = draft.tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean);
              await createCard({
                title: draft.title.trim(),
                description: draft.description.trim() || undefined,
                columnId: targetId,
                priority: draft.priority,
                dueDate: draft.dueDate || undefined,
                tags,
              });
              setDrafts((prev) =>
                prev.filter((item) => item.id !== draft.id)
              );
            }}
            emptyLabel="Drop cards here or use Quick add"
          />
          <ArchivePanel
            cards={archivedCards}
            isOpen={showPanels}
            onToggle={() => setShowPanels((prev) => !prev)}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]">
          {sortedColumns.map((column) => (
            <KanbanColumn
              key={column._id}
              column={column}
              cards={cardsByColumn[column._id] ?? []}
              focusedCardId={focusedCardId}
              editingCardId={editingCardId}
              activeSelectionColumnId={activeSelectionColumnId}
              selectedCardIds={selectedCardIds}
              onStartSelection={(columnId) => {
                void playTacticalSound("tap");
                setActiveSelectionColumnId(columnId);
                setSelectedCardIds(new Set());
              }}
              onClearSelection={(columnId) => {
                void playTacticalSound("cancel");
                setActiveSelectionColumnId((prev) =>
                  prev === columnId ? null : prev
                );
                setSelectedCardIds((prev) => {
                  const next = new Set(prev);
                  (cardsByColumn[columnId] ?? []).forEach((card) =>
                    next.delete(card._id)
                  );
                  return next;
                });
              }}
              onSelectAllInColumn={(columnId, mode) => {
                void playTacticalSound("tap");
                setSelectedCardIds((prev) => {
                  const next = new Set(prev);
                  const columnCards = cardsByColumn[columnId] ?? [];
                  if (mode === "clear") {
                    columnCards.forEach((card) => next.delete(card._id));
                  } else {
                    columnCards.forEach((card) => next.add(card._id));
                  }
                  return next;
                });
              }}
              onToggleCardSelection={(cardId) => {
                void playTacticalSound("tap");
                setSelectedCardIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(cardId)) {
                    next.delete(cardId);
                  } else {
                    next.add(cardId);
                  }
                  return next;
                });
              }}
              onDeleteSelected={(columnId, ids) => {
                openDeleteConfirm(
                  ids,
                  `Delete ${ids.length} task${
                    ids.length === 1 ? "" : "s"
                  } from ${column.title}?`
                );
              }}
              onFocusCard={setFocusedCardId}
              onEditCard={handleEditToggle}
              nowTick={nowTick}
              onArchive={handleArchiveRequest}
              onRename={updateColumn}
              onToggleTimer={handleTimerToggle}
              focusColumnId={focusColumnId}
              onSound={playTacticalSound}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeDragId ? (
            activeDragId.startsWith("draft:") ? (
              <DraftPreview
                draft={
                  drafts.find(
                    (draft) => `draft:${draft.id}` === activeDragId
                  ) ?? null
                }
              />
            ) : (
              <CardPreview
                card={
                  cards.find((card) =>
                    activeDragId.startsWith("overflow:")
                      ? card._id === activeDragId.replace("overflow:", "")
                      : card._id === activeDragId
                  ) ?? null
                }
              />
            )
          ) : null}
        </DragOverlay>
      </DndContext>

      {filteredCards.length === 0 && (
        <div className="rounded-3xl border border-dashed border-[color:var(--stroke)] bg-[color:var(--surface-strong)] p-8 text-center shadow-[var(--shadow)]">
          <h3 className="text-lg font-semibold text-[color:var(--text)]">
            {search || tagFilters.size > 0 || dateFilter.from || dateFilter.to
              ? "No matching tasks"
              : "Add your first task"}
          </h3>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            {search || tagFilters.size > 0 || dateFilter.from || dateFilter.to
              ? "Try clearing filters to see everything again."
              : "Capture a quick idea, then keep moving."}
          </p>
          <button
            type="button"
            onClick={() => quickTitleRef.current?.focus()}
            className="mt-4 rounded-full bg-[color:var(--accent)] px-5 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--bg)]"
          >
            Add a task
          </button>
        </div>
      )}

      {editingCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--text)]">
                  Edit task
                </h3>
                <p className="text-sm text-[color:var(--text-muted)]">
                  Update details and keep momentum going.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editingCard.timerStartedAt) return;
                  void playTacticalSound("cancel");
                  handleEditToggle(null);
                }}
                disabled={Boolean(editingCard.timerStartedAt)}
                className={clsx(
                  "rounded-full border border-[color:var(--stroke)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]",
                  editingCard.timerStartedAt && "opacity-50"
                )}
              >
                Close
              </button>
            </div>

            <form
              onSubmit={async (event) => {
                event.preventDefault();
                void playTacticalSound("confirm");
                await updateCard({
                  id: editingCard._id,
                  title: editDraft.title.trim(),
                  description: editDraft.description.trim() || undefined,
                  tags: editDraft.tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                  priority: editDraft.priority,
                  dueDate: editDraft.dueDate || undefined,
                });
                if (!editingCard.timerStartedAt) {
                  handleEditToggle(null);
                }
              }}
              className="mt-6 space-y-4"
            >
              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
                  Title
                </label>
                <input
                  value={editDraft.title}
                  onChange={(event) =>
                    setEditDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="w-full rounded-xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
                  Notes
                </label>
                <textarea
                  value={editDraft.description}
                  onChange={(event) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
                  Tags (comma separated)
                </label>
                <input
                  value={editDraft.tags}
                  onChange={(event) =>
                    setEditDraft((prev) => ({
                      ...prev,
                      tags: event.target.value,
                    }))
                  }
                  placeholder="design, growth, release"
                  className="w-full rounded-xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
                    Priority
                  </label>
                  <select
                    value={editDraft.priority}
                    onChange={(event) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        priority: event.target.value as Priority,
                      }))
                    }
                    className="w-full rounded-xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                  >
                    {priorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={editDraft.dueDate}
                    onChange={(event) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        dueDate: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      void playTacticalSound("tap");
                      if (editingCard.timerStartedAt) {
                        await toggleTimer({ id: editingCard._id });
                      }
                      await toggleArchive({
                        id: editingCard._id,
                        archived: !editingCard.archived,
                      });
                      handleEditToggle(null);
                    }}
                    className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-amber-600"
                  >
                    <Archive className="h-3 w-3" aria-hidden="true" />
                    {editingCard.archived ? "Unarchive" : "Archive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void playTacticalSound("cancel");
                      openDeleteConfirm(
                        [editingCard._id],
                        `Delete "${editingCard.title}"?`
                      );
                    }}
                    className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-rose-600"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    Delete
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {celebrateColumnId &&
                    celebrateColumnId !== editingCard.columnId &&
                    !editingCard.overflowed && (
                    <button
                      type="button"
                      onClick={() => {
                        void playTacticalSound("confirm");
                        void moveCardToColumn(
                          editingCard._id,
                          celebrateColumnId
                        ).then(() => handleEditToggle(null));
                      }}
                      className="rounded-full border border-[color:var(--stroke)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
                    >
                      Mark done
                    </button>
                  )}
                  <button
                    type="submit"
                    className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--bg)]"
                  >
                    Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTimerModal && timerModalCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
                  Focus timer
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[color:var(--text)]">
                  {timerModalCard.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={async () => {
                  void playTacticalSound("cancel");
                  if (timerModalCard.timerStartedAt) {
                    await toggleTimer({ id: timerModalCard._id });
                  }
                  setShowTimerModal(false);
                }}
                className="flex items-center gap-2 rounded-full border border-[color:var(--stroke)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Close
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3">
              <div className="text-sm font-semibold text-[color:var(--text)]">
                {timerModalCard.timerStartedAt ? "Timer running" : "Timer paused"}
              </div>
              <span className="rounded-full bg-[color:var(--surface-strong)] px-3 py-1 text-xs font-semibold text-[color:var(--text)]">
                {(() => {
                  const liveSeconds =
                    timerModalCard.timeSeconds +
                    (timerModalCard.timerStartedAt
                      ? Math.floor(
                          (nowTick - timerModalCard.timerStartedAt) / 1000
                        )
                      : 0);
                  const hours = Math.floor(liveSeconds / 3600);
                  const minutes = Math.floor((liveSeconds % 3600) / 60);
                  const seconds = liveSeconds % 60;
                  return `${hours}h ${minutes
                    .toString()
                    .padStart(2, "0")}m ${seconds
                    .toString()
                    .padStart(2, "0")}s`;
                })()}
              </span>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("tap");
                  void toggleTimer({ id: timerModalCard._id });
                }}
                className="flex items-center gap-2 rounded-full border border-[color:var(--stroke)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {timerModalCard.timerStartedAt ? "Pause" : "Start"}
              </button>
              {nextToFocusColumnId && (
                <button
                  type="button"
                  onClick={async () => {
                    void playTacticalSound("confirm");
                    if (timerModalCard.timerStartedAt) {
                      await toggleTimer({ id: timerModalCard._id });
                    }
                    await moveCardToColumn(
                      timerModalCard._id,
                      nextToFocusColumnId
                    );
                    setShowTimerModal(false);
                  }}
                  className="flex items-center gap-2 rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--bg)]"
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Finish
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
            <h3 className="text-lg font-semibold text-[color:var(--text)]">
              Archive this task?
            </h3>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              You can restore it later by turning on “Show archived.”
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("cancel");
                  setArchiveTarget(null);
                }}
                className="rounded-full border border-[color:var(--stroke)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("confirm");
                  void confirmArchive();
                }}
                className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--bg)]"
              >
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-3xl bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
            <h3 className="text-lg font-semibold text-[color:var(--text)]">
              Delete task{deleteTarget.ids.length === 1 ? "" : "s"}?
            </h3>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {deleteTarget.label} This can't be undone.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("cancel");
                  setDeleteTarget(null);
                }}
                className="rounded-full border border-[color:var(--stroke)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("confirm");
                  void confirmDelete();
                }}
                className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold tracking-[0.08em] text-[color:var(--bg)]"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuickModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-[color:var(--surface)] p-6 shadow-[var(--shadow)]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--text)]">
                  Quick capture
                </h3>
                <p className="text-sm text-[color:var(--text-muted)]">
                  Capture a task in seconds. Press Enter to save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void playTacticalSound("cancel");
                  setShowQuickModal(false);
                }}
                className="rounded-full border border-[color:var(--stroke)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[color:var(--text-muted)]"
              >
                Close
              </button>
            </div>
            <form
              onSubmit={(event) => {
                void handleQuickCreate(event);
                setShowQuickModal(false);
              }}
              className="mt-6 grid gap-4"
            >
              <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_auto]">
                <input
                  ref={quickTitleRef}
                  value={quickForm.title}
                  onChange={(event) =>
                    setQuickForm((prev) => ({
                      ...prev,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Ship onboarding flow"
                  className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] placeholder:text-[color:var(--text-muted)]"
                />
                <select
                  value={quickForm.priority}
                  onChange={(event) =>
                    setQuickForm((prev) => ({
                      ...prev,
                      priority: event.target.value as Priority,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                >
                  {priorities.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={quickForm.dueDate}
                  onChange={(event) =>
                    setQuickForm((prev) => ({
                      ...prev,
                      dueDate: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] placeholder:text-[color:var(--text-muted)]"
                />
                <select
                  value={quickForm.columnId}
                  onChange={(event) =>
                    setQuickForm((prev) => ({
                      ...prev,
                      columnId: event.target.value,
                    }))
                  }
                  className="rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                >
                  <option value="">Draft (no status)</option>
                  {baseColumns.map((column) => (
                    <option key={column._id} value={column._id}>
                      {column.title}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="justify-self-start rounded-2xl bg-[color:var(--accent)] px-5 py-3 text-sm font-semibold text-[color:var(--bg)] shadow-sm lg:justify-self-auto"
                >
                  Add
                </button>
              </div>
              <textarea
                value={quickForm.description}
                onChange={(event) =>
                  setQuickForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Notes (optional)"
                className="w-full resize-none rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] placeholder:text-[color:var(--text-muted)]"
              />
              <input
                value={quickForm.tags}
                onChange={(event) =>
                  setQuickForm((prev) => ({
                    ...prev,
                    tags: event.target.value,
                  }))
                }
                placeholder="Tags (comma separated)"
                className="w-full rounded-2xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--text)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] placeholder:text-[color:var(--text-muted)]"
              />
            </form>
          </div>
        </div>
      )}

    </section>
  );
}

function KanbanColumn({
  column,
  cards,
  focusedCardId,
  editingCardId,
  activeSelectionColumnId,
  selectedCardIds,
  onStartSelection,
  onClearSelection,
  onSelectAllInColumn,
  onToggleCardSelection,
  onDeleteSelected,
  onFocusCard,
  onEditCard,
  nowTick,
  onArchive,
  onRename,
  onToggleTimer,
  focusColumnId,
  onSound,
}: {
  column: ColumnRecord;
  cards: CardRecord[];
  focusedCardId: Id<"cards"> | null;
  editingCardId: Id<"cards"> | null;
  activeSelectionColumnId: Id<"columns"> | null;
  selectedCardIds: Set<string>;
  onStartSelection: (columnId: Id<"columns">) => void;
  onClearSelection: (columnId: Id<"columns">) => void;
  onSelectAllInColumn: (
    columnId: Id<"columns">,
    mode: "select" | "clear"
  ) => void;
  onToggleCardSelection: (cardId: Id<"cards">) => void;
  onDeleteSelected: (columnId: Id<"columns">, ids: Id<"cards">[]) => void;
  onFocusCard: (id: Id<"cards"> | null) => void;
  onEditCard: (id: Id<"cards"> | null) => void;
  nowTick: number;
  onArchive: (args: { id: Id<"cards">; archived: boolean }) => Promise<void>;
  onRename: (args: { id: Id<"columns">; title: string }) => Promise<void>;
  onToggleTimer: (args: { id: Id<"cards"> }) => Promise<void>;
  focusColumnId: Id<"columns"> | null;
  onSound: (variant?: "tap" | "confirm" | "cancel" | "drag") => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column:${column._id}`,
  });
  const { over } = useDndContext();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(column.title);
  const selectionActive = activeSelectionColumnId === column._id;
  const selectedCount = useMemo(() => {
    return cards.reduce(
      (count, card) => (selectedCardIds.has(card._id) ? count + 1 : count),
      0
    );
  }, [cards, selectedCardIds]);
  const allSelected = selectedCount > 0 && selectedCount === cards.length;

  const isHoveringCardInColumn = useMemo(() => {
    if (!over?.id) return false;
    const overId = String(over.id);
    if (overId.startsWith("column:")) return false;
    return cards.some((card) => card._id === overId);
  }, [cards, over?.id]);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(column.title);
    }
  }, [column.title, isEditingTitle]);

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[320px] flex-col gap-4 rounded-3xl border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] p-4 shadow-[var(--shadow)]",
        (isOver || isHoveringCardInColumn) && "ring-2 ring-[color:var(--accent)]"
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex-1">
          {isEditingTitle ? (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const next = draftTitle.trim();
                if (next && next !== column.title) {
                  void onSound("confirm");
                  await onRename({ id: column._id, title: next });
                }
                setIsEditingTitle(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                className="w-full rounded-xl border border-[color:var(--stroke)] px-2 py-1 text-sm font-semibold text-[color:var(--text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)]"
                autoFocus
              />
              <button
                type="submit"
                className="rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
                aria-label="Confirm rename"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void onSound("cancel");
                  setDraftTitle(column.title);
                  setIsEditingTitle(false);
                }}
                className="rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
                aria-label="Cancel rename"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </form>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[color:var(--text)]">
                  {column.title}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    void onSound("tap");
                    setIsEditingTitle(true);
                  }}
                  className="rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
                  aria-label="Rename column"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
              <p className="text-xs text-[color:var(--text-muted)]">
                {cards.length} task{cards.length === 1 ? "" : "s"}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectionActive ? (
            <>
              <button
                type="button"
                onClick={() =>
                  onSelectAllInColumn(
                    column._id,
                    allSelected ? "clear" : "select"
                  )
                }
                className="rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
                aria-label={allSelected ? "Clear all" : "Select all"}
                title={allSelected ? "Clear all" : "Select all"}
              >
                {allSelected ? (
                  <X className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <CheckSquare className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  onDeleteSelected(
                    column._id,
                    cards
                      .filter((card) => selectedCardIds.has(card._id))
                      .map((card) => card._id)
                  )
                }
                disabled={selectedCount === 0}
                className={clsx(
                  "rounded-full border border-[color:var(--stroke)] p-2 text-rose-600",
                  selectedCount === 0 && "opacity-50"
                )}
                aria-label="Delete selected"
                title="Delete selected"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onClearSelection(column._id)}
                className="rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
                aria-label="Done"
                title="Done"
              >
                <Check className="h-3 w-3" aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onStartSelection(column._id)}
              className="rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
              aria-label="Select"
              title="Select"
            >
              <Square className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <SortableContext
        items={cards.map((card) => card._id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-3">
          {cards.map((card) => (
            <KanbanCard
              key={card._id}
              card={card}
              isFocused={focusedCardId === card._id}
              isEditing={editingCardId === card._id}
              selectionEnabled={selectionActive}
              isSelected={selectedCardIds.has(card._id)}
              onSelect={onToggleCardSelection}
              onFocus={onFocusCard}
              onEdit={onEditCard}
              nowTick={nowTick}
              onArchive={onArchive}
              onToggleTimer={onToggleTimer}
              focusColumnId={focusColumnId}
              onSound={onSound}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function KanbanCard({
  card,
  isFocused,
  isEditing,
  selectionEnabled,
  isSelected,
  onSelect,
  onFocus,
  onEdit,
  nowTick,
  onArchive,
  onToggleTimer,
  focusColumnId,
  onSound,
}: {
  card: CardRecord;
  isFocused: boolean;
  isEditing: boolean;
  selectionEnabled: boolean;
  isSelected: boolean;
  onSelect: (id: Id<"cards">) => void;
  onFocus: (id: Id<"cards">) => void;
  onEdit: (id: Id<"cards"> | null) => void;
  nowTick: number;
  onArchive: (args: { id: Id<"cards">; archived: boolean }) => Promise<void>;
  onToggleTimer: (args: { id: Id<"cards"> }) => Promise<void>;
  focusColumnId: Id<"columns"> | null;
  onSound: (variant?: "tap" | "confirm" | "cancel" | "drag") => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card._id,
    disabled: card.archived || isEditing || selectionEnabled,
    animateLayoutChanges: (args) =>
      defaultAnimateLayoutChanges({ ...args, wasDragging: true }),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const priorityStyles = {
    low: "bg-emerald-500/20 text-emerald-200",
    medium: "bg-amber-400/20 text-amber-200",
    high: "bg-rose-400/20 text-rose-200",
  };

  const liveSeconds =
    card.timeSeconds +
    (card.timerStartedAt
      ? Math.floor((nowTick - card.timerStartedAt) / 1000)
      : 0);
  const hours = Math.floor(liveSeconds / 3600);
  const minutes = Math.floor((liveSeconds % 3600) / 60);
  const seconds = liveSeconds % 60;
  const formattedTime = `${hours}h ${minutes
    .toString()
    .padStart(2, "0")}m ${seconds.toString().padStart(2, "0")}s`;

  const isInFocusColumn = focusColumnId === card.columnId;
  const canStartTimer = isInFocusColumn && !card.overflowed;

  return (
    <motion.article
      ref={setNodeRef}
      style={{ ...style, touchAction: "none", transformOrigin: "center" }}
      {...attributes}
      {...listeners}
      className={clsx(
        "rounded-2xl border border-[color:var(--stroke)] bg-gradient-to-br from-[color:var(--surface-strong)] to-[color:var(--surface)] p-4 shadow-sm transition will-change-transform",
        !card.archived &&
          !isEditing &&
          !selectionEnabled &&
          "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-80 shadow-lg ring-2 ring-[color:var(--accent)]",
        isFocused && "ring-2 ring-[color:var(--accent)]"
      )}
      onClick={() => {
        if (selectionEnabled) {
          onSelect(card._id);
          return;
        }
        onFocus(card._id);
        onEdit(card._id);
      }}
      layout={!isDragging}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <div className="flex items-start gap-3">
        {selectionEnabled && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(card._id);
            }}
            className={clsx(
              "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border text-[color:var(--text-muted)]",
              isSelected
                ? "border-[color:var(--accent)] bg-[color:var(--surface-strong)]"
                : "border-[color:var(--stroke)]"
            )}
            aria-label={isSelected ? "Deselect card" : "Select card"}
            title={isSelected ? "Deselect card" : "Select card"}
          >
            {isSelected && (
              <Check className="h-3 w-3" aria-hidden="true" />
            )}
          </button>
        )}
        <div className="flex-1">
          <h3 className="text-base font-semibold text-[color:var(--text)]">
            {card.title}
          </h3>
          {card.archived && (
            <p className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
              Archived
            </p>
          )}
          <p className="mt-1 text-sm text-[color:var(--text-muted)]">
            {card.description || "Add a quick note to clarify the task."}
          </p>
          {card.tags && card.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {card.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[color:var(--stroke)] bg-[color:var(--surface-strong)] px-2 py-1 text-[10px] font-semibold tracking-[0.06em] text-[color:var(--text)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={clsx(
              "rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.06em]",
              priorityStyles[card.priority]
            )}
          >
            {card.priority}
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--text-muted)]">
        <span>{card.dueDate ? `Due ${card.dueDate}` : "No due date"}</span>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[color:var(--surface-strong)] px-2 py-1 text-[10px] font-semibold tracking-[0.06em] text-[color:var(--text-muted)]">
            {formattedTime}
          </span>
          {canStartTimer && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                void onSound("tap");
                onToggleTimer({ id: card._id });
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex items-center gap-1 rounded-full border border-transparent bg-[color:var(--accent)] px-2 py-1 text-[10px] font-semibold tracking-[0.06em] text-[color:var(--bg)]"
              title={card.timerStartedAt ? "Stop timer" : "Start timer"}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {card.timerStartedAt ? "Stop" : "Start"}
            </button>
          )}
        </div>
      </div>

    </motion.article>
  );
}

function CardPreview({ card }: { card: CardRecord | null }) {
  if (!card) return null;
  return (
    <div className="w-[280px] rounded-2xl border border-[color:var(--stroke)] bg-gradient-to-br from-[color:var(--surface-strong)] to-[color:var(--surface)] p-4 shadow-[var(--shadow)]">
      <p className="text-sm font-semibold text-[color:var(--text)]">
        {card.title}
      </p>
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        {card.description || "No notes"}
      </p>
    </div>
  );
}

function DraftCard({
  draft,
  columns,
  onChangeColumn,
  onSend,
}: {
  draft: {
    id: string;
    title: string;
    description: string;
    tags: string;
    priority: Priority;
    dueDate: string;
    columnId: string;
  };
  columns: ColumnRecord[];
  onChangeColumn: (columnId: string) => void;
  onSend: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useDraggable({ id: `draft:${draft.id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, transformOrigin: "center" }}
      {...attributes}
      {...listeners}
      className={clsx(
        "flex max-w-[280px] flex-col gap-3 justify-self-start rounded-2xl border border-[color:var(--stroke)] bg-gradient-to-br from-[color:var(--surface-strong)] to-[color:var(--surface)] p-4 shadow-sm transition will-change-transform",
        isDragging && "opacity-100"
      )}
    >
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[color:var(--text)]">
          {draft.title}
        </p>
        <p className="text-xs text-[color:var(--text-muted)]">
          Draft column:{" "}
          {columns.find((column) => column._id === draft.columnId)?.title ??
            "Pick a column"}
        </p>
      </div>
      <div className="mt-auto text-[10px] font-semibold tracking-[0.06em] text-[color:var(--text-muted)]">
        Drag to a column
      </div>
    </div>
  );
}

function DraftPreview({
  draft,
}: {
  draft: {
    title: string;
    description: string;
  } | null;
}) {
  if (!draft) return null;
  return (
    <div className="w-[280px] rounded-2xl border border-[color:var(--stroke)] bg-gradient-to-br from-[color:var(--surface-strong)] to-[color:var(--surface)] p-4 shadow-[var(--shadow)]">
      <p className="text-sm font-semibold text-[color:var(--text)]">
        {draft.title}
      </p>
      <p className="mt-1 text-xs text-[color:var(--text-muted)]">
        {draft.description || "Add a quick note to clarify the task."}
      </p>
    </div>
  );
}

function OverflowPanel({
  title,
  helper,
  droppableId,
  drafts,
  cards,
  columns,
  focusColumnId,
  inProgressCount,
  isOpen,
  onToggle,
  onUpdateDraft,
  onSendDraft,
  emptyLabel,
}: {
  title: string;
  helper: string;
  droppableId: "overflow" | "archive";
  drafts: Array<{
    id: string;
    title: string;
    description: string;
    tags: string;
    priority: Priority;
    dueDate: string;
    columnId: string;
  }>;
  cards: CardRecord[];
  columns: ColumnRecord[];
  focusColumnId: Id<"columns"> | null;
  inProgressCount: number;
  isOpen: boolean;
  onToggle: () => void;
  onUpdateDraft: (id: string, columnId: string) => void;
  onSendDraft: (draft: {
    id: string;
    title: string;
    description: string;
    tags: string;
    priority: Priority;
    dueDate: string;
    columnId: string;
  }) => void;
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "rounded-3xl border border-dashed border-[color:var(--stroke)] bg-[color:var(--surface-strong)] p-5 shadow-[var(--shadow)]",
        isOver && "ring-2 ring-[color:var(--accent)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-[0.08em] text-[color:var(--text-muted)]">
            {title}
          </h3>
          {isOpen && (
            <p className="mt-1 text-sm text-[color:var(--text-muted)]">
              {helper}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 rounded-full border border-[color:var(--stroke)] p-2 text-[color:var(--text-muted)]"
          aria-label={isOpen ? "Minimize panel" : "Maximize panel"}
        >
          {isOpen ? (
            <X className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Minus className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
      {isOpen && (
        <>
          <div className="mt-4 grid auto-rows-min items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                columns={columns}
                onChangeColumn={(columnId) => onUpdateDraft(draft.id, columnId)}
                onSend={() => onSendDraft(draft)}
              />
            ))}
            {cards.map((card) => (
              <OverflowCard key={card._id} card={card} />
            ))}
            {drafts.length === 0 && cards.length === 0 && (
              <div className="flex min-h-[140px] items-center justify-center text-center rounded-2xl border border-dashed border-[color:var(--stroke)] bg-[color:var(--surface-strong)] text-xs font-semibold tracking-[0.06em] text-[color:var(--text-muted)]">
                {emptyLabel}
              </div>
            )}
          </div>
          {focusColumnId && inProgressCount >= 5 && (
            <p className="mt-3 text-xs text-[color:var(--text-muted)]">
              Focus column is at max capacity (5).
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ArchivePanel({
  cards,
  isOpen,
  onToggle,
}: {
  cards: CardRecord[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <OverflowPanel
      title="Archive"
      helper="Archived cards live here. Drag them back onto a column to restore."
      droppableId="archive"
      drafts={[]}
      cards={cards}
      columns={[]}
      focusColumnId={null}
      inProgressCount={0}
      isOpen={isOpen}
      onToggle={onToggle}
      onUpdateDraft={() => {}}
      onSendDraft={async () => {}}
      emptyLabel="Drop cards here to archive"
    />
  );
}

function OverflowCard({ card }: { card: CardRecord }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useDraggable({ id: `${card.archived ? "archive" : "overflow"}:${card._id}` });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "flex max-w-[280px] flex-wrap items-center justify-between gap-3 justify-self-start rounded-2xl border border-[color:var(--stroke)] bg-gradient-to-br from-[color:var(--surface-strong)] to-[color:var(--surface)] px-4 py-3 shadow-sm transition will-change-transform",
        isDragging && "opacity-100"
      )}
    >
      <div>
        <p className="text-sm font-semibold text-[color:var(--text)]">
          {card.title}
        </p>
        <p className="text-xs text-[color:var(--text-muted)]">
          {card.archived ? "Archived card" : "Draft card"}
        </p>
      </div>
      <div className="text-[10px] font-semibold tracking-[0.06em] text-[color:var(--text-muted)]">
        Drag to a column
      </div>
    </div>
  );
}
