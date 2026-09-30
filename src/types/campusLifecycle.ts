/** Student-facing campus lifecycle shared by the wizard, editor, and service. */
export type CampusLifecycleStatus =
  | "draft"
  | "coming_soon"
  | "published"
  | "unpublished"
  | "archived";

/** States administrators may choose when first creating a campus. */
export type CampusCreationVisibility = Extract<CampusLifecycleStatus, "draft" | "coming_soon">;
