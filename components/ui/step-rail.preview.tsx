import { StepRail } from "./step-rail";

export default function Preview() {
  return (
    <StepRail
      active="set"
      steps={[
        { id: "start", n: "01", title: "Start", href: "#start", ready: true },
        { id: "set", n: "02", title: "Set", href: "#set", ready: true },
        { id: "out", n: "03", title: "Output", ready: false },
      ]}
    />
  );
}
