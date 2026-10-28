"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MOVES } from "@/lib/camera";
import { updateProject } from "@/lib/store";

const Move = z
  .object({
    move: z.enum(MOVES.map((m) => m.id) as [string, ...string[]]),
    amount: z.number(),
    seconds: z.number().min(2).max(10),
    ease: z.boolean(),
  })
  .refine((m) => {
    const spec = MOVES.find((x) => x.id === m.move)!;
    return m.amount >= spec.min && m.amount <= spec.max;
  }, "That amount is out of range for this move.");

// The scene's camera move, saved as it is tuned.
export async function saveCamera(id: string, raw: unknown) {
  const camera = Move.parse(raw) as z.infer<typeof Move> & { move: (typeof MOVES)[number]["id"] };
  await updateProject(id, (q) => void (q.camera = camera));
  revalidatePath(`/p/${id}/scene`);
}
