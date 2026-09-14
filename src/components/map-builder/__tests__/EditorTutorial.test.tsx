import { describe, expect, it, beforeEach } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  EditorTutorial,
  OUTDOOR_TUTORIAL_STEPS,
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

  it("skips an explicitly optional missing target instead of blocking the walkthrough", async () => {
    const steps: TutorialStep[] = [
      { id: "missing", target: "not-rendered", title: "Missing", description: "Skip me.", skipWhenMissing: true },
      { id: "present", target: "present-target", title: "Present", description: "Continue." },
    ];
    render(<Harness steps={steps} targetOverride="present-target" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    await waitFor(() => expect(screen.getByText("1 of 2")).toBeInTheDocument());
  });

  it("keeps required missing targets on their logical step", async () => {
    const steps: TutorialStep[] = [
      { id: "welcome", target: "present-target", title: "Welcome", description: "First." },
      { id: "required", target: "not-rendered", title: "Required", description: "Stay here." },
    ];
    render(<Harness steps={steps} targetOverride="present-target" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("2 of 2")).toBeInTheDocument());
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByText("Stay here.")).toBeInTheDocument();
  });

  it("keeps editor tours aligned with the current tool hierarchy", () => {
    const outdoorIds = OUTDOOR_TUTORIAL_STEPS.map((step) => step.id);
    expect(outdoorIds).toEqual(expect.arrayContaining(["hierarchy", "assets", "history", "save-publish"]));
    expect(outdoorIds).not.toContain("properties");
    expect(OUTDOOR_TUTORIAL_STEPS.length).toBe(16);
    const outdoorTail = ["history", "canvas-settings", "keyboard-shortcuts", "save-publish"];
    const outdoorTailIndexes = outdoorTail.map((id) => outdoorIds.indexOf(id));
    expect(outdoorTailIndexes).toEqual([12, 13, 14, 15]);
    expect(OUTDOOR_TUTORIAL_STEPS.some((step) => step.id === "snap" || step.id === "zoom")).toBe(false);
    expect(OUTDOOR_TUTORIAL_STEPS.find((step) => step.id === "select")?.description).toMatch(/properties/i);
    expect(OUTDOOR_TUTORIAL_STEPS.find((step) => step.id === "select")?.description).toMatch(/Spacebar/);
    expect(FLOOR_TUTORIAL_STEPS.map((step) => step.id)).toEqual(expect.arrayContaining(["circulation", "furniture", "history", "floor-settings", "shortcuts", "save-publish"]));
    expect(FLOOR_TUTORIAL_STEPS.findIndex((step) => step.id === "shortcuts")).toBeLessThan(FLOOR_TUTORIAL_STEPS.findIndex((step) => step.id === "floor-settings"));
    expect(FLOOR_TUTORIAL_STEPS.some((step) => step.id === "locking" || step.id === "selection-properties")).toBe(false);
    expect(FLOOR_TUTORIAL_STEPS.find((step) => step.id === "furniture")?.description).toMatch(/Lock/);
    expect(FLOOR_TUTORIAL_STEPS.find((step) => step.id === "select")?.description).toMatch(/properties/i);
    expect(FLOOR_TUTORIAL_STEPS.some((step) => step.id === "transform")).toBe(false);
  });

  it("traverses the Outdoor final steps symmetrically with continuous progress", async () => {
    const steps: TutorialStep[] = [
      { id: "history", target: "present-target", title: "Undo + Redo", description: "History." },
      { id: "canvas-settings", target: "present-target", title: "Canvas Settings", description: "Canvas." },
      { id: "keyboard-shortcuts", target: "present-target", title: "Keyboard Shortcuts", description: "Shortcuts." },
      { id: "save-publish", target: "present-target", title: "Save + Review & Publish", description: "Lifecycle." },
    ];
    render(<Harness kind="outdoor" steps={steps} targetOverride="present-target" />);
    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    expect(screen.getByText("1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Undo + Redo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("2 of 4")).toBeInTheDocument());
    expect(screen.getByText("Canvas Settings")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("3 of 4")).toBeInTheDocument());
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("4 of 4")).toBeInTheDocument());
    expect(screen.getByText("Save + Review & Publish")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByText("3 of 4")).toBeInTheDocument());
    expect(screen.getByText("Keyboard Shortcuts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByText("2 of 4")).toBeInTheDocument());
    expect(screen.getByText("Canvas Settings")).toBeInTheDocument();
  });

  it("waits for a harmlessly exposed target before measuring a tutorial step", async () => {
    function ExposureHarness() {
      const controller = useEditorTutorial("outdoor", 2);
      const [assetsVisible, setAssetsVisible] = useState(false);
      const steps: TutorialStep[] = [
        { id: "hierarchy", target: "hierarchy-target", title: "Hierarchy", description: "First." },
        { id: "assets", target: "assets-target", title: "Assets", description: "Second." },
      ];
      return (
        <>
          <button type="button" onClick={controller.start}>Start</button>
          <div data-tutorial="hierarchy-target">Hierarchy</div>
          {assetsVisible && <div data-tutorial="assets-target">Assets</div>}
          <EditorTutorial
            kind="outdoor"
            steps={steps}
            controller={controller}
            onStepChange={(step) => { if (step.id === "assets") setAssetsVisible(true); }}
          />
        </>
      );
    }

    render(<ExposureHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("2 of 2")).toBeInTheDocument());
    expect(screen.getAllByText("Assets").length).toBeGreaterThan(0);
  });

  it("keeps Back from Canvas Settings on the previous logical step when its target is unavailable", async () => {
    const steps: TutorialStep[] = [
      { id: "welcome", target: "present-target", title: "Welcome", description: "First." },
      { id: "optional", target: "missing-target", title: "Optional", description: "Second.", skipWhenMissing: true },
      { id: "canvas-settings", target: "present-target", title: "Canvas Settings", description: "Third." },
    ];
    render(<Harness steps={steps} targetOverride="present-target" />);

    fireEvent.click(screen.getByRole("button", { name: "Start Tour" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("3 of 3")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByText("2 of 3")).toBeInTheDocument());
    await new Promise((resolve) => window.setTimeout(resolve, 30));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });
});
