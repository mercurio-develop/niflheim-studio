import { Suspense } from "react";
import { Wordmark } from "@/components/wordmark";
import { ComfyStatus } from "@/features/home/components/comfy-status";

export function ProjectHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-4 px-4">
        <Wordmark />
        <div className="ml-auto">
          <Suspense fallback={null}>
            <ComfyStatus />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
