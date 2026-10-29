import { connection } from "next/server";
import { comfyHealth } from "@/lib/comfy";
import { cn } from "@/lib/utils";

// The ComfyUI mark with a live dot: green when the Comfy API proxy answers, hollow when not.
export async function ComfyStatus() {
  await connection();
  const up = await comfyHealth();
  return (
    <span
      className="flex items-center gap-2 rounded-full border px-2 py-1 text-xs text-muted-foreground"
      title={up ? "ComfyUI is online" : "ComfyUI is offline: start it with mw serve start comfy-proxy (and ComfyUI)"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/comfy-logo.svg" alt="ComfyUI" className={cn("size-4 rounded-[4px]", !up && "opacity-50 grayscale")} />
      <span className="relative flex size-2">
        {up && <span className="absolute inset-0 motion-safe:animate-ping rounded-full bg-tone-green/60 [animation-duration:2.4s]" />}
        <span className={cn("relative size-2 rounded-full", up ? "bg-tone-green" : "border border-muted-foreground")} />
      </span>
      <span className={up ? "text-tone-green" : ""}>{up ? "online" : "offline"}</span>
    </span>
  );
}
