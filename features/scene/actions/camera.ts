"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FOCUS, FRAMINGS, MOVES, type CameraMove } from "@/lib/camera";
import { updateProject } from "@/lib/store";

const done = (id: string) => {
  revalidatePath(`/p/${id}/scene`);
  revalidatePath(`/p/${id}/shot`);
};

const Point = z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every((x) => Number.isFinite(x) && Math.abs(x) < 500));
const Move = z
  .object({
    preset: z.string().regex(/^[a-z-]{1,24}$/).optional(),
    side: z.union([z.literal(1), z.literal(-1)]).optional(),
    move: z.enum(MOVES.map((m) => m.id) as [string, ...string[]]),
    amount: z.number(),
    seconds: z.number().min(2).max(10),
    ease: z.boolean(),
    framing: z.enum(FRAMINGS.map((f) => f.id) as [string, ...string[]]).optional(),
    from: Point.optional(),
    to: Point.optional(),
    walk: z.object({ from: Point, to: Point }).optional(),
    focus: z.enum(FOCUS.map((f) => f.id) as [string, ...string[]]).optional(),
    pose: z.string().regex(/^[a-z0-9]{1,16}$/).optional(),
    poseThen: z.string().regex(/^[a-z0-9]{1,16}$/).optional(),
    subject: z.string().regex(/^(main|none|[a-z0-9]{1,24})$/).optional(),
    moments: z
      .array(
        z.object({
          frame: z.number().int().min(0).max(400),
          camera: z.object({ from: Point, look: Point }).optional(),
          marks: z.record(z.string().regex(/^(main|[a-z0-9]{1,24})$/), z.object({ at: Point.optional(), turn: z.number().min(-360).max(360).optional(), pose: z.string().regex(/^[a-z0-9]{0,16}$/).optional() })),
        }),
      )
      .max(8)
      .optional(),
  })
  .refine((m) => {
    const spec = MOVES.find((x) => x.id === m.move)!;
    return m.amount >= spec.min && m.amount <= spec.max;
  }, "That amount is out of range for this move.");

// The active shot's camera move, saved as it is tuned.
export async function saveCamera(id: string, raw: unknown) {
  const camera = Move.parse(raw) as CameraMove;
  await updateProject(id, (q) => void (q.camera = camera));
  done(id);
}
