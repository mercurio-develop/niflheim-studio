"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

// Sticky footer of every step: what you have, and the way forward.
export function NextBar(props: {
  summary: React.ReactNode;
  back?: { href: string; label: string };
  next: { label: string; onNext?: () => Promise<unknown>; href?: string; disabled?: boolean; hint?: string };
}) {
  const [pending, start] = useTransition();
  return (
    <div className="nifl-enter sticky bottom-0 z-20 mt-10 border-t bg-background/80 backdrop-blur-md" style={{ "--i": 3 } as React.CSSProperties}>
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        {props.back && (
          <Link href={props.back.href} className={buttonVariants({ variant: "ghost" })}>
            <ArrowLeft data-icon="inline-start" />
            {props.back.label}
          </Link>
        )}
        <div className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{props.summary}</div>
        {props.next.hint && <span className="hidden font-mono text-xs text-muted-foreground sm:inline">{props.next.hint}</span>}
        {props.next.href ? (
          <Link
            href={props.next.href}
            aria-disabled={props.next.disabled}
            className={buttonVariants({ size: "lg", className: props.next.disabled ? "pointer-events-none opacity-50" : "" })}
          >
            {props.next.label}
            <ArrowRight data-icon="inline-end" />
          </Link>
        ) : (
          <Button size="lg" disabled={props.next.disabled || pending} onClick={() => props.next.onNext && start(() => props.next.onNext!().then(() => {}))}>
            {pending ? "Saving..." : props.next.label}
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </div>
    </div>
  );
}
