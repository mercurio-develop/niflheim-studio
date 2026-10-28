import { Suspense } from "react";
import { redirect } from "next/navigation";

// The turnaround is part of the Character step now (decision 0010); old links land there.
async function Go({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/p/${id}/character`);
  return null;
}

export default function Page(props: PageProps<"/p/[id]/turnaround">) {
  return (
    <Suspense>
      <Go params={props.params} />
    </Suspense>
  );
}
