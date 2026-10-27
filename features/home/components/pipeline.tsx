import Image from "next/image";
import { cn } from "@/lib/utils";
import { STEPS } from "@/lib/steps";

// Section select: eight slanted panels. At rest the art is dim and grey (the NIFLheim
// black-and-white look); the panel under the pointer or focus widens and comes up in colour.
// Phones (no hover) get a stack of bars in dimmed colour with the descriptions shown.
export function Pipeline() {
  return (
    <ol className="flex flex-col gap-2 sm:h-[28rem] sm:-skew-x-[7deg] sm:flex-row sm:gap-1.5 sm:px-7 lg:-mx-12">
      {STEPS.map((s) => (
        <li
          key={s.slug}
          tabIndex={0}
          aria-label={`${s.n} ${s.title}: ${s.body}`}
          className={cn(
            "group relative h-36 min-w-0 overflow-hidden rounded-md border outline-none transition-[flex-grow,border-color] duration-500 ease-out",
            "sm:h-auto sm:flex-1 sm:hover:flex-[2.6] sm:focus-visible:flex-[2.6]",
            "hover:border-ring/60 focus-visible:border-foreground",
          )}
        >
          <Image
            src={s.art}
            alt=""
            fill
            sizes="(min-width: 640px) 40vw, 100vw"
            className={cn(
              "object-cover transition-[filter,transform] duration-700 ease-out",
              "brightness-[0.55] sm:scale-[1.25] sm:skew-x-[7deg] sm:brightness-[0.45] sm:grayscale",
              "group-hover:brightness-100 group-hover:grayscale-0 group-hover:saturate-[1.15]",
              "group-focus:brightness-100 group-focus:grayscale-0",
              "sm:group-hover:scale-[1.32] sm:group-focus-visible:scale-[1.32]",
            )}
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/45 to-transparent" />

          <div className="relative flex h-full flex-col justify-end p-4 sm:origin-bottom sm:skew-x-[7deg] sm:pr-6 sm:pl-3.5 sm:pb-5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground">{s.n}</span>
              <span
                className={cn("size-1.5 rounded-full border border-foreground/70", s.ready && "bg-foreground")}
                title={s.ready ? "ready" : "soon"}
              />
            </div>
            <span className="mt-1.5 text-base font-medium whitespace-nowrap sm:text-sm sm:tracking-tight">{s.title}</span>
            {/* Collapsed to zero height on desktop until hover, so every title sits on the same line. */}
            <div className="grid transition-[grid-template-rows] duration-500 ease-out sm:grid-rows-[0fr] sm:group-hover:grid-rows-[1fr] sm:group-focus-visible:grid-rows-[1fr]">
              <div className="overflow-hidden">
                <p className="pt-1.5 text-xs leading-relaxed text-muted-foreground sm:w-52 sm:pt-2 sm:text-sm sm:text-foreground/80">
                  {s.body}
                  <span className="mt-2 block font-mono text-[11px] text-muted-foreground">{s.ready ? "ready" : "soon"}</span>
                </p>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
