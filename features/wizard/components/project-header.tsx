import Link from "next/link";

export function ProjectHeader({ projectId }: { projectId: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-baseline gap-0.5 text-sm tracking-tight">
          <span className="font-semibold">NIFL</span>
          <span className="text-muted-foreground">heim</span>
        </Link>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-mono text-xs text-muted-foreground">{projectId}</span>
      </div>
    </header>
  );
}
