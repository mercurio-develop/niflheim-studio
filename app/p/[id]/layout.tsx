import { notFound } from "next/navigation";
import { StepRail } from "@/features/wizard/components/step-rail";
import { getStepStates, projectExists } from "@/features/wizard/queries/project-steps";

export default async function ProjectLayout({ children, params }: LayoutProps<"/p/[id]">) {
  const { id } = await params;
  if (!(await projectExists(id))) notFound();
  const steps = await getStepStates(id);
  return (
    <div className="flex flex-1">
      <StepRail projectId={id} steps={steps} />
      <div className="flex-1 p-6">{children}</div>
    </div>
  );
}
