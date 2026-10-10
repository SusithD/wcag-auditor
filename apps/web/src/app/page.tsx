import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <>
      <header className="flex h-12 items-center justify-between border-b px-6">
        <span className="font-mono text-label">wcag-auditor</span>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto mt-[20vh] w-full max-w-160 px-6">
        <h1 className="text-h1 font-semibold tracking-tight">New audit</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Scaffold only. The audit form arrives in milestone M7a.
        </p>
      </main>
    </>
  );
}
