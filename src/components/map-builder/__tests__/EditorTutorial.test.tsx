import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  EditorTutorial,
  FLOOR_TUTORIAL_STEPS,
  TutorialInvitation,
  useEditorTutorial,
  type EditorTutorialKind,
  type TutorialStep,
} from "../EditorTutorial";

function Harness({ kind = "floor", steps = FLOOR_TUTORIAL_STEPS.slice(0, 1), targetOverride }: { kind?: EditorTutorialKind; steps?: TutorialStep[]; targetOverride?: string }) {
  const controller = useEditorTutorial(kind, steps.length);
  return (
    <>
      <button type="button" onClick={controller.replay}>Replay</button>
      {targetOverride !== "none" && <div data-tutorial={targetOverride ?? steps[0]?.target}>Editor target</div>}
      <TutorialInvitation kind={kind} open={controller.invitationOpen} onStart={controller.start} onMaybeLater={controller.maybeLater} />
      <EditorTutorial kind={kind} steps={steps} controller={controller} />
    </>
  );
}

describe("EditorTutorial", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows an optional first-visit invitation and completes without editor mutation", async () => {
    render(<Harness />);
    expect(screen.getByRole("dialog", { name: /tutorial invitation/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    expect(screen.getByRole("dialog", { name: /floor editor tutorial/i })).toBeInTheDocument();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(window.localStorage.getItem("plv-navisync:tutorial:floor:v1")).toBe("completed"));
    expect(screen.queryByRole("dialog", { name: /floor editor tutorial/i })).toBeNull();
  });

  it("supports skip and replay with versioned local preference", async () => {
    render(<Harness kind="outdoor" steps={FLOOR_TUTORIAL_STEPS.slice(0, 1)} />);
    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip tutorial" }));
    await waitFor(() => expect(window.localStorage.getItem("plv-navisync:tutorial:outdoor:v1")).toBe("dismissed"));
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(screen.getByRole("dialog", { name: /outdoor map builder tutorial/i })).toBeInTheDocument();
  });

  it("skips a missing target instead of blocking the walkthrough", async () => {
    const steps: TutorialStep[] = [
      { id: "missing", target: "not-rendered", title: "Missing", description: "Skip me." },
      { id: "present", target: "present-target", title: "Present", description: "Continue." },
    ];
    render(<Harness steps={steps} targetOverride="present-target" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
  });
});
