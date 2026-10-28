import { cn } from "@/lib/utils";

// A small toggle chip, as in the character's Describe: filled when on.
export const chip = (on: boolean) =>
  cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-ring/60 hover:text-foreground");
