import { notFound } from "next/navigation";
import { STEPS, isStep } from "@/features/wizard/steps";
import { getStepStates } from "@/features/wizard/queries/project-steps";

export default async function StepPage({ params }: PageProps<"/p/[id]/[step]">) {
  const { id, step } = await params;
  if (!isStep(step)) notFound();
  const state = (await getStepStates(id)).find((s) => s.slug === step)!;
  const label = STEPS.find((s) => s.slug === step)!.label;
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-2xl font-semibold">{label}</h1>
      <p className="text-sm opacity-70">
        {state.status === "empty"
          ? "No saved result yet."
          : `Saved ${state.savedAt}${state.status === "stale" ? " (stale: an earlier step changed)" : ""}.`}
      </p>
      <ul className="text-sm">{state.files.map((f) => <li key={f}>{f}</li>)}</ul>
    </section>
  );
}
