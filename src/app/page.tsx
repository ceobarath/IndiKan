import KanbanBoard from "@/components/kanban-board";
import AuthGate from "@/components/auth-gate";

export default function Home() {
  return (
    <main className="min-h-screen px-6 py-10 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <AuthGate>
          <KanbanBoard />
        </AuthGate>
      </div>
    </main>
  );
}
