import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADMIN_NOTIFICATION_PREFERENCES,
  isAdminActivityNotificationEnabled,
} from "../adminNotificationPreferencesService";

describe("per-admin activity notification preferences", () => {
  it("filters only the selected notification category", () => {
    const preferences = { ...DEFAULT_ADMIN_NOTIFICATION_PREFERENCES, events: false };
    expect(isAdminActivityNotificationEnabled({ action: "event_overlay.approved", entity_type: "event_overlay" }, preferences)).toBe(false);
    expect(isAdminActivityNotificationEnabled({ action: "report.pending", entity_type: "report" }, preferences)).toBe(true);
  });

  it("keeps unmatched system activity visible", () => {
    const preferences = { ...DEFAULT_ADMIN_NOTIFICATION_PREFERENCES, users: false };
    expect(isAdminActivityNotificationEnabled({ action: "settings.update", entity_type: "settings" }, preferences)).toBe(true);
    expect(isAdminActivityNotificationEnabled({ action: "admin.profile_updated", entity_type: "profile" }, preferences)).toBe(false);
    expect(isAdminActivityNotificationEnabled({ action: "admin.user_invited", entity_type: "profile" }, preferences)).toBe(false);
    expect(isAdminActivityNotificationEnabled({ action: "admin.user_role_changed", entity_type: "profile" }, preferences)).toBe(false);
    expect(isAdminActivityNotificationEnabled({ action: "admin.user_deactivated", entity_type: "profile" }, preferences)).toBe(false);
  });
});
