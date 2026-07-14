import { createCrudService, seedMockData } from "./crud";
import { MOCK_ANNOUNCEMENTS } from "../data/mockData";
import type { DbAnnouncement } from "./types";

seedMockData("announcements", MOCK_ANNOUNCEMENTS as unknown as DbAnnouncement[]);

export const announcementService = createCrudService<DbAnnouncement>("announcements");
