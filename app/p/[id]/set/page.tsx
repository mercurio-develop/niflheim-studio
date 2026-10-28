import { Suspense } from "react";
import { redirect } from "next/navigation";

// The Set step is part of the Scene step now; old links land there.
async function Go({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/p/${id}/scene`);
  return null;
}

export default function Page(props: PageProps<"/p/[id]/set">) {
  return (
    <Suspense>
      <Go params={props.params} />
    </Suspense>
  );
}
