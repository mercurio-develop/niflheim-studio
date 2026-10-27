import { Suspense } from "react";
import Link from "next/link";
import { ComfyStatus } from "@/features/home/components/comfy-status";
import { Pipeline } from "@/features/home/components/pipeline";
import { StartForm } from "@/features/home/components/start-form";

export default function Home() {
  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[36rem] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,oklch(1_0_0/8%),transparent)]"
      />
      <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="flex items-baseline gap-0.5 text-sm tracking-tight">
            <span className="font-semibold">NIFL</span>
            <span className="text-muted-foreground">heim</span>
            <span className="ml-1.5 text-muted-foreground">Studio</span>
          </Link>
          <div className="ml-auto flex items-center gap-5">
            <Suspense fallback={<span className="font-mono text-xs text-muted-foreground">comfy ...</span>}>
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
          <span className="font-mono text-xs tracking-widest text-muted-foreground uppercase">Form condenses from fog</span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Direct a shot from a single idea.
          </h1>
          <p className="max-w-xl text-balance text-muted-foreground">
            Design a character, give them a world, aim the camera and add the effects. LTX-2.5 shoots it on your own
            GPU, and you can fly through the result as a Gaussian splat.
          </p>
          <div className="mt-4 flex w-full justify-center">
            <StartForm />
          </div>
        </section>

        <section className="flex w-full flex-col gap-4">
          <h2 className="text-sm text-muted-foreground">Eight steps. Each one saved, swappable, re-runnable.</h2>
          <Pipeline />
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 font-mono text-xs text-muted-foreground">
          <span>open weights · one 16 GB GPU · Comfy SDK</span>
          <span>MIT</span>
        </div>
      </footer>
    </div>
  );
}
