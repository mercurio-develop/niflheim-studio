"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While a GPU job runs, refresh the server-rendered step every 2 s.
export function JobPoller({ running }: { running: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [running, router]);
  return null;
}
