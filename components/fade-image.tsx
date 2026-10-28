"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// An image that condenses in (blur + fade) once its bytes arrive. Until then its box shows the
// three loading dots (.nifl-loading in globals.css); an image that fails stops them.
export function FadeImage({ className, alt, onError, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      onLoad={() => setState("loaded")}
      onError={(e) => {
        setState("failed");
        onError?.(e);
      }}
      ref={(el) => {
        if (el?.complete && el.naturalWidth) setState("loaded");
      }}
      className={cn(state === "loaded" ? "nifl-condense" : state === "loading" ? "nifl-loading" : "opacity-0", className)}
    />
  );
}
