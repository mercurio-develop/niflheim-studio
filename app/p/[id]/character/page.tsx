import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/store";

// Placeholder until the character feature lands: shows the saved prompt, nothing fake.
async function Character({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-16">
      <span className="font-mono text-xs text-muted-foreground">01 · Character · {project.id}</span>
      <h1 className="text-2xl font-semibold tracking-tight">{project.character.prompt}</h1>
      <p className="text-sm text-muted-foreground">No concepts generated yet.</p>
    </main>
  );
}

export default function Page(props: PageProps<"/p/[id]/character">) {
  return (
    <Suspense>
      <Character params={props.params} />
    </Suspense>
  );
}
