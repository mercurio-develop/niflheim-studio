"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_MOVE, type CameraMove } from "@/lib/camera";
import { updateProject } from "@/lib/store";

// The active shot's key moments (decision 0013), saved on their own: the camera section saves the
// rest of the move as it is tuned, the moments bar saves these as they are blocked.
const Point = z.tuple([z.number(), z.number(), z.number()]).refine((v) => v.every((x) => Number.isFinite(x) && Math.abs(x) < 500));
const Moments = z
  .array(
    z.object({
      frame: z.number().int().min(0).max(400),
      camera: z.object({ from: Point, look: Point }).optional(),
      marks: z.record(z.string().regex(/^(main|[a-z0-9]{1,24})$/), z.object({ at: Point.optional(), turn: z.number().min(-360).max(360).optional(), pose: z.string().regex(/^[a-z0-9]{0,16}$/).optional() })),
    }),
  )
  .max(8);

export async function saveMoments(id: string, raw: unknown) {
  const moments = Moments.parse(raw) as NonNullable<CameraMove["moments"]>;
  await updateProject(id, (q) => {
    const m: CameraMove = { ...(q.camera ?? DEFAULT_MOVE) };
    if (moments.length) m.moments = moments;
    else delete m.moments;
    q.camera = m;
  });
  revalidatePath(`/p/${id}/shot`);
}
