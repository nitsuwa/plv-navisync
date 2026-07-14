import { createCrudService, seedMockData } from "./crud";
import type { DbSetting } from "./types";

const mockSettings: DbSetting[] = [
  { id: "s1", key: "site_name", value: "PLV NaviSync", updated_at: "2025-01-01" },
  { id: "s2", key: "site_tagline", value: "Smart Campus Navigator", updated_at: "2025-01-01" },
  { id: "s3", key: "contact_email", value: "navisync@plv.edu.ph", updated_at: "2025-01-01" },
  { id: "s4", key: "campus_address", value: "Tongco Street, Karuhatan, Valenzuela City", updated_at: "2025-01-01" },
  { id: "s5", key: "default_latitude", value: "14.7116", updated_at: "2025-01-01" },
  { id: "s6", key: "default_longitude", value: "120.9660", updated_at: "2025-01-01" },
];

seedMockData("settings", mockSettings);

export const settingsService = createCrudService<DbSetting>("settings");
