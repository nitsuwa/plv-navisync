import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampusStatusBadge, getCampusStatusDetails } from "../CampusStatusTooltip";

const published = {
  publishStatus: "published" as const,
  publishedAt: "2026-09-01",
  lifecycleStatus: "published" as const,
};

describe("Campus status badge explanations", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("describes a live published campus", () => {
    const details = getCampusStatusDetails(published, false, false);
    expect(details.badgeLabel).toBe("Live");
    expect(details.kind).toBe("live");
    expect(details.description).toMatch(/viewing the latest published map/i);
  });

  it("distinguishes unsaved edits from saved changes waiting to publish", () => {
    const unsaved = getCampusStatusDetails(published, true, false);
    const saved = getCampusStatusDetails(published, false, true);

    expect(unsaved.badgeLabel).toBe("Changes");
    expect(unsaved.kind).toBe("unsaved");
    expect(unsaved.title).toMatch(/unsaved/i);
    expect(saved.badgeLabel).toBe("Ready to Publish");
    expect(saved.kind).toBe("saved-unpublished");
    expect(saved.title).toMatch(/ready to publish/i);
  });

  it("uses the persisted lifecycle for never-published and unpublished drafts", () => {
    const fresh = getCampusStatusDetails({ publishStatus: "draft", lifecycleStatus: "draft" }, false, false);
    const unpublished = getCampusStatusDetails({ publishStatus: "draft", lifecycleStatus: "unpublished" }, false, false);

    expect(fresh.badgeLabel).toBe("New");
    expect(fresh.kind).toBe("draft");
    expect(fresh.studentsSee).toMatch(/no campus map/i);
    expect(unpublished.badgeLabel).toBe("Draft");
    expect(unpublished.kind).toBe("saved-unpublished");
    expect(unpublished.studentsSee).toMatch(/previous published/i);
  });

  it("shows the custom explanation on focus without a native title tooltip", () => {
    render(<CampusStatusBadge campus={published} isDirty={false} hasDraftChanges={false} />);
    const badge = screen.getByTestId("campus-status-badge");

    expect(badge).toHaveAttribute("aria-label", expect.stringContaining("viewing the latest published map"));
    expect(badge).not.toHaveAttribute("title");

    fireEvent.focus(badge);
    return waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent(/latest published map/i));
  });
});
