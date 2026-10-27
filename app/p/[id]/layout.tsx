import { Suspense } from "react";
import { ProjectHeader } from "@/features/wizard/components/project-header";

async function Header({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectHeader projectId={id} />;
}

export default function ProjectLayout({ children, params }: LayoutProps<"/p/[id]">) {
  return (
    <div className="relative flex min-h-svh flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,var(--glow),transparent)]"
      />
      <Suspense fallback={<div className="h-12 border-b" />}>
        <Header params={params} />
      </Suspense>
      {children}
    </div>
  );
}
