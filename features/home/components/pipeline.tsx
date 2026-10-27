import Image from "next/image";
import { cn } from "@/lib/utils";
import { STEPS } from "@/lib/steps";

// Section select: eight slanted panels, no borders, the dark gaps are the "/" dividers.
// At rest the art is dim and coffee-toned (Ristretto); the panel under the pointer or
// focus widens and comes up in colour with its one-line pitch. Phones: stacked bars, colour, text shown.
export function Pipeline() {
  return (
    <ol className="flex flex-col gap-2 sm:h-[30rem] sm:-skew-x-[7deg] sm:flex-row sm:gap-2 sm:px-8 lg:-mx-12">
      {STEPS.map((s) => (
        <li
          key={s.slug}
          tabIndex={0}
          aria-label={`${s.n} ${s.title}: ${s.line}`}
          className={cn(
            "group relative h-36 min-w-0 overflow-hidden rounded-md outline-none transition-[flex-grow] duration-500 ease-out",
            "sm:h-auto sm:flex-1 sm:hover:flex-[2.8] sm:focus-visible:flex-[2.8]",
            "focus-visible:ring-2 focus-visible:ring-primary",
          )}
        >
          <Image
            src={s.art}
            alt=""
            fill
            sizes="(min-width: 640px) 40vw, 100vw"
            className={cn(
              "object-cover transition-[filter,transform] duration-700 ease-out",
              "brightness-[0.6] sm:scale-[1.25] sm:skew-x-[7deg] sm:brightness-[0.45] sm:sepia-[.55] sm:saturate-[.6]",
              "group-hover:brightness-110 group-hover:sepia-0 group-hover:saturate-[1.2]",
              "group-focus:brightness-110 group-focus:sepia-0 group-focus:saturate-100",
              "sm:group-hover:scale-[1.32] sm:group-focus-visible:scale-[1.32]",
            )}
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />

          {/* Text is un-slanted around the bottom edge, so the lines stay inside the panel. */}
          <div className="relative flex h-full flex-col justify-end p-4 sm:origin-bottom sm:skew-x-[7deg] sm:pr-7 sm:pb-6 sm:pl-4">
            <span className="font-mono text-xs text-muted-foreground transition-colors group-hover:text-primary">{s.n}</span>
            <span className="mt-1 text-base font-semibold whitespace-nowrap sm:text-sm sm:tracking-tight sm:group-hover:text-lg sm:transition-[font-size] sm:duration-500">
              {s.title}
            </span>
            {/* Zero height until hover on desktop, so every title sits on the same line. */}
            <div className="grid transition-[grid-template-rows] duration-500 ease-out sm:grid-rows-[0fr] sm:group-hover:grid-rows-[1fr] sm:group-focus-visible:grid-rows-[1fr]">
              <div className="overflow-hidden">
                <p className="pt-1 text-sm leading-snug text-foreground/85 sm:w-48 sm:pt-2">{s.line}</p>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
