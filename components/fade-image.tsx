"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// An image that condenses in (blur + fade) once its bytes arrive.
export function FadeImage({ className, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      onLoad={() => setLoaded(true)}
      ref={(el) => {
        if (el?.complete && el.naturalWidth) setLoaded(true);
      }}
      className={cn(loaded ? "nifl-condense" : "opacity-0", className)}
    />
  );
}
