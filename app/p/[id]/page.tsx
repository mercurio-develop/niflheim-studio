import { redirect } from "next/navigation";

export default async function ProjectIndex({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  redirect(`/p/${id}/character`);
}
