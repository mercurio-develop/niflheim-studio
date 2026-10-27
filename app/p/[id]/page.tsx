import { Suspense } from "react";
import { redirect } from "next/navigation";

async function ToCharacter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return redirect(`/p/${id}/character`);
}

// /p/<id> opens the first step. params are runtime data, so they sit inside Suspense.
export default function ProjectIndex(props: PageProps<"/p/[id]">) {
  return (
    <Suspense>
      <ToCharacter params={props.params} />
    </Suspense>
  );
}
