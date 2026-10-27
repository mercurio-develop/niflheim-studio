"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createProject } from "@/lib/store";
import { generateConcepts, setReference } from "@/features/character/actions/character";
import { Count, Prompt, StyleId, referenceError } from "@/features/character/schemas";

const Input = z.object({ prompt: Prompt, style: StyleId, count: z.coerce.number().pipe(Count) });

// Home's Generate: check everything first, then make the project, keep the sketch, start the
// concepts and go there. Nothing is created when an input is wrong.
export async function startCharacter(form: FormData): Promise<{ error: string } | void> {
  const parsed = Input.safeParse({ prompt: form.get("prompt"), style: form.get("style"), count: form.get("count") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const image = form.get("image");
  const hasImage = image instanceof File && image.size > 0;
  if (hasImage) {
    const bad = referenceError(image);
    if (bad) return { error: bad };
  }
  const project = await createProject(parsed.data.prompt);
  try {
    if (hasImage) {
      const ref = new FormData();
      ref.set("image", image);
      await setReference(project.id, ref);
    }
    await generateConcepts(project.id, { style: parsed.data.style, count: parsed.data.count });
  } catch (e) {
    // The project exists by now; open it so nothing is lost, the step shows the job's state.
    console.error("startCharacter", project.id, e);
  }
  redirect(`/p/${project.id}/character`);
}
