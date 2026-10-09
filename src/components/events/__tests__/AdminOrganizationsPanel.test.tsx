import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ManagedProfile } from "../../../services/adminUserService";
import type { EventOrganization } from "../../../types/eventOrganization";
import { AdminOrganizationsPanel } from "../AdminOrganizationsPanel";

const mocks = vi.hoisted(() => ({
  listOrganizations: vi.fn(),
  replaceRepresentative: vi.fn(),
  revokeRepresentative: vi.fn(),
  saveOrganization: vi.fn(),
}));

vi.mock("../../../services/eventOrganizationService", () => ({
  eventOrganizationService: {
    listOrganizations: mocks.listOrganizations,
    replaceRepresentative: mocks.replaceRepresentative,
    revokeRepresentative: mocks.revokeRepresentative,
    saveOrganization: mocks.saveOrganization,
  },
  OrganizationAccessUnavailable: class OrganizationAccessUnavailable extends Error {},
  OrganizationAssignmentChanged: class OrganizationAssignmentChanged extends Error {},
  OrganizationRecordChanged: class OrganizationRecordChanged extends Error {},
}));

const profiles: ManagedProfile[] = [
  { id: "rep-next", role: "student_org", account_status: "active", first_name: "Jamie", last_name: "Incoming", email: "jamie@example.test", student_number: null, department: "IT Organization", avatar_path: null, is_active: true, last_login_at: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z" },
  { id: "rep-old", role: "student_org", account_status: "active", first_name: "Taylor", last_name: "Outgoing", email: "taylor@example.test", student_number: null, department: "IT Organization", avatar_path: null, is_active: true, last_login_at: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "student", role: "student", account_status: "active", first_name: "Regular", last_name: "Student", email: "student@example.test", student_number: "23-0001", department: null, avatar_path: null, is_active: true, last_login_at: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
  { id: "inactive-rep", role: "student_org", account_status: "inactive", first_name: "Inactive", last_name: "Org", email: "inactive@example.test", student_number: null, department: null, avatar_path: null, is_active: false, last_login_at: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" },
];

const organization = (grants: EventOrganization["grants"] = []): EventOrganization => ({
  id: "org-it", code: "IT-ORG", name: "Information Technology Organization", isActive: true,
  createdAt: "2025-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", grants,
});
const activeGrant = {
  id: "grant-old", organizationId: "org-it", representativeId: "rep-old", representativeName: "Taylor Outgoing",
  academicYear: "2025–2026", startsAt: "2025-06-01T00:00:00Z", expiresAt: "2027-06-01T00:00:00Z", grantedBy: "admin",
  endedAt: null, endedBy: null, endReason: null, profileActive: true, profileRole: "student_org",
};

describe("AdminOrganizationsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listOrganizations.mockResolvedValue([organization()]);
    mocks.replaceRepresentative.mockResolvedValue({ organizationId: "org-it", organizationName: "Information Technology Organization", grantId: "grant-next", academicYear: "2026–2027", expiresAt: "2027-06-30T15:59:59.000Z" });
    mocks.revokeRepresentative.mockResolvedValue(undefined);
    mocks.saveOrganization.mockResolvedValue(organization());
  });
  afterEach(cleanup);

  it("shows an unassigned organization and only active Student Org candidates", async () => {
    render(<AdminOrganizationsPanel profiles={profiles} />);
    expect(await screen.findByText("No representative assigned")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assign representative" }));
    expect(await screen.findByRole("dialog", { name: /Assign representative/i })).toBeTruthy();
    expect(screen.getByRole("option", { name: /Jamie Incoming/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Regular Student/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Inactive Org/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Incoming representative"), { target: { value: "rep-next" } });
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: "2026–2027" } });
    fireEvent.change(screen.getByLabelText("Access expires on"), { target: { value: "2027-06-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue to handover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm handover" }));
    await waitFor(() => expect(mocks.replaceRepresentative).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-it", representativeId: "rep-next", expectedGrantId: null, academicYear: "2026–2027", expiresAt: "2027-06-30T15:59:59.000Z" })));
  });

  it("creates a verified organization and requires a separate representative assignment", async () => {
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add organization" }));
    const dialog = await screen.findByRole("dialog", { name: "Add organization" });
    fireEvent.change(within(dialog).getByLabelText("Organization code"), { target: { value: "CEIT-ORG" } });
    fireEvent.change(within(dialog).getByLabelText("Organization name"), { target: { value: "College of Engineering and Information Technology" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create organization" }));
    await waitFor(() => expect(mocks.saveOrganization).toHaveBeenCalledWith({ id: null, code: "CEIT-ORG", name: "College of Engineering and Information Technology", isActive: true, expectedUpdatedAt: null }));
    expect(await screen.findByText(/Assign a representative to give it access/i)).toBeTruthy();
  });

  it("shows current representative, replacement, expiry and on-demand history", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([activeGrant])]);
    render(<AdminOrganizationsPanel profiles={profiles} />);
    expect((await screen.findAllByText("Taylor Outgoing")).length).toBeGreaterThan(0);
    expect(screen.getByText("2025–2026")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Replace representative" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Show assignment history/i }));
    expect((await screen.findAllByText("Taylor Outgoing")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/replaced|current/i).length).toBeGreaterThan(0);
  });

  it("keeps organization edits open with the latest error when a duplicate code is rejected", async () => {
    mocks.listOrganizations.mockResolvedValue([organization()]);
    mocks.saveOrganization.mockRejectedValueOnce(new Error("This organization code already exists."));
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit organization" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit organization" });
    fireEvent.change(within(dialog).getByLabelText("Organization code"), { target: { value: "DUPLICATE" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save organization" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This organization code already exists.");
    expect((within(dialog).getByLabelText("Organization code") as HTMLInputElement).value).toBe("DUPLICATE");
  });

  it("labels an expired assignment and offers a new assignment rather than implying active access", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([{ ...activeGrant, expiresAt: "2026-01-01T00:00:00Z" }])]);
    render(<AdminOrganizationsPanel profiles={profiles} />);
    expect(await screen.findByText("Expired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assign representative" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "End representative assignment" })).toBeTruthy();
  });

  it("lets admins explicitly end an open grant when its account is inactive", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([{ ...activeGrant, profileActive: false }])]);
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "End representative assignment" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke organization access" });
    fireEvent.change(within(dialog).getByLabelText("Reason for revocation"), { target: { value: "Account was deactivated" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke access" }));
    await waitFor(() => expect(mocks.revokeRepresentative).toHaveBeenCalledWith("org-it", "grant-old", "Account was deactivated"));
  });

  it("does not offer replacement when there is no other active Student Org account", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([activeGrant])]);
    render(<AdminOrganizationsPanel profiles={[profiles[1]]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Replace representative" }));
    expect(await screen.findByText(/No other active Student Organization accounts are available/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue to handover" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows both people before replacement and submits the expected current grant", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([activeGrant])]);
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "Replace representative" }));
    const dialog = await screen.findByRole("dialog", { name: /Replace representative/i });
    expect(within(dialog).getAllByText(/Taylor Outgoing/).length).toBeGreaterThan(0);
    fireEvent.change(within(dialog).getByLabelText("Incoming representative"), { target: { value: "rep-next" } });
    fireEvent.change(within(dialog).getByLabelText("Academic year"), { target: { value: "2026–2027" } });
    fireEvent.change(within(dialog).getByLabelText("Access expires on"), { target: { value: "2027-06-30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue to handover" }));
    const confirmation = await screen.findByRole("dialog", { name: /Replace representative/i });
    expect(within(confirmation).getAllByText(/Taylor Outgoing/).length).toBeGreaterThan(0);
    expect(within(confirmation).getAllByText(/Jamie Incoming/).length).toBeGreaterThan(0);
    expect(within(confirmation).getByText(/drafts, pending submissions, and feedback tasks/i)).toBeTruthy();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm handover" }));
    await waitFor(() => expect(mocks.replaceRepresentative).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-it", representativeId: "rep-next", expectedGrantId: "grant-old", academicYear: "2026–2027", expiresAt: "2027-06-30T15:59:59.000Z" })));
  });

  it("requires a reason before revocation and refreshes after success", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([activeGrant])]);
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "Revoke representative" }));
    const dialog = await screen.findByRole("dialog", { name: "Revoke organization access" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke access" }));
    expect(within(dialog).getByText(/reason is required/i)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Reason for revocation"), { target: { value: "Representative term ended" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Revoke access" }));
    await waitFor(() => expect(mocks.revokeRepresentative).toHaveBeenCalledWith("org-it", "grant-old", "Representative term ended"));
  });

  it("reloads assignment state after a stale-dialog conflict and explains the change", async () => {
    mocks.listOrganizations.mockResolvedValue([organization([activeGrant])]);
    mocks.replaceRepresentative.mockRejectedValueOnce(Object.assign(new Error("changed"), { name: "OrganizationAssignmentChanged" }));
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "Replace representative" }));
    const dialog = await screen.findByRole("dialog", { name: /Replace representative/i });
    fireEvent.change(within(dialog).getByLabelText("Incoming representative"), { target: { value: "rep-next" } });
    fireEvent.change(within(dialog).getByLabelText("Academic year"), { target: { value: "2026–2027" } });
    fireEvent.change(within(dialog).getByLabelText("Access expires on"), { target: { value: "2027-06-30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue to handover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm handover" }));
    expect(await screen.findByText(/assignment changed while you were reviewing it\. Current representative details have been refreshed/i)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: /Replace representative/i })).toBeNull();
    expect(mocks.listOrganizations).toHaveBeenCalledTimes(2);
  });

  it("closes a stale organization edit after refreshing instead of allowing a repeat conflict", async () => {
    mocks.listOrganizations.mockResolvedValue([organization()]);
    mocks.saveOrganization.mockRejectedValueOnce(Object.assign(new Error("changed"), { name: "OrganizationRecordChanged" }));
    render(<AdminOrganizationsPanel profiles={profiles} />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit organization" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit organization" });
    fireEvent.change(within(dialog).getByLabelText("Organization name"), { target: { value: "Updated IT" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save organization" }));
    expect(await screen.findByText(/Organization details changed in another session/i)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Edit organization" })).toBeNull();
    expect(mocks.listOrganizations).toHaveBeenCalledTimes(2);
  });

  it("closes on Escape and restores focus to the assignment trigger", async () => {
    render(<AdminOrganizationsPanel profiles={profiles} />);
    const trigger = await screen.findByRole("button", { name: "Assign representative" });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: /Assign representative/i });
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Assign representative/i })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
