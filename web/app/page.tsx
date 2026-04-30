import { Chat } from "@/components/Chat";

export default function Home() {
  return (
    <div className="min-h-dvh">
      <a
        href="#composer"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-[var(--color-ink)] focus:text-[var(--color-paper)] focus:px-3 focus:py-1 focus:text-sm"
      >
        Skip to chat input
      </a>
      <main className="relative" aria-label="Forethought chat">
        <Chat />
      </main>
    </div>
  );
}
