import { StatusDot } from "./status-dot";

export default function Preview() {
  return (
    <div className="flex flex-col gap-3 font-sans text-sm text-text">
      <StatusDot on label="online" />
      <StatusDot label="offline" />
      <StatusDot pending label="running" />
    </div>
  );
}
