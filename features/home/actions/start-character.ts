"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createProject } from "@/lib/store";
import { generateConcepts, setReference } from "@/features/character/actions/character";

const Input = z.object({
  prompt: z.string().trim().min(3, "Describe your character in a few words.").max(600),
  style: z.string().min(1),
  count: z.coerce.number(),
});

// Home's Generate: make the project, keep the sketch if there is one, start the concepts, go there.
export async function startCharacter(form: FormData): Promise<{ error: string } | void> {
  const parsed = Input.safeParse({ prompt: form.get("prompt"), style: form.get("style"), count: form.get("count") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const project = await createProject(parsed.data.prompt);
  const image = form.get("image");
  if (image instanceof File && image.size > 0) {
    const ref = new FormData();
    ref.set("image", image);
    await setReference(project.id, ref);
  }
  await generateConcepts(project.id, { style: parsed.data.style, count: parsed.data.count });
  redirect(`/p/${project.id}/character`);
}
