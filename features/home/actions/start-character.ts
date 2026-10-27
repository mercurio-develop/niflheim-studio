"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createProject } from "@/lib/store";
import { generateConcepts } from "@/features/character/actions/character";

const Input = z.object({ prompt: z.string().trim().min(3, "Describe your character in a few words.").max(600) });

export type StartState = { error?: string; prompt?: string };

export async function startCharacter(_prev: StartState, form: FormData): Promise<StartState> {
  const parsed = Input.safeParse({ prompt: form.get("prompt") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, prompt: String(form.get("prompt") ?? "") };
  const project = await createProject(parsed.data.prompt);
  await generateConcepts(project.id);
  redirect(`/p/${project.id}/character`);
}
