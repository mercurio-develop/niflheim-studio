import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { ComfyStatus } from "@/features/wizard/components/comfy-status";
import { Pipeline } from "@/features/home/components/pipeline";
import { StartForm } from "@/features/home/components/start-form";

export default function Home() {
  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--glow),transparent)]"
      />
      <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-4">
          <Wordmark />
          <div className="ml-auto flex items-center gap-5">
            <Suspense fallback={null}>
              <ComfyStatus />
            </Suspense>
            <a
              href="https://github.com/mercurio-develop/niflheim-studio"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center gap-16 px-4 pt-24 pb-16">
        <section className="flex w-full flex-col items-center gap-6 text-center">
          {/* One line across the column on desktop; wraps on phones. */}
          <h4 className="w-full text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[4.55rem] lg:leading-none lg:tracking-tighter lg:whitespace-nowrap">
            Design a character, give them a world, aim the camera and add the effects.
          </h4>
          <div className="mt-4 flex w-full justify-center">
            <StartForm />
          </div>
        </section>

        <section className="flex w-full flex-col gap-4">
          <h2 className="text-sm text-muted-foreground">Five steps. Each one saved, swappable, re-runnable.</h2>
          <Pipeline />
        </section>
      </main>

      <footer>
        <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-8 text-xs text-muted-foreground">
          <span>Open source · MIT</span>
        </div>
      </footer>
    </div>
  );
}
