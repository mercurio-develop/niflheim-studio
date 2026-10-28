import { JobLine } from "./job-line";

export default function Preview() {
  return (
    <div className="flex flex-col gap-3">
      <JobLine status="running" message="Painting four concepts" />
      <JobLine status="error" message="Failed: the GPU timed out" />
    </div>
  );
}
