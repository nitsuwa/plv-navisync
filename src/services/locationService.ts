import { createCrudService, seedMockData } from "./crud";
import { MOCK_LOCATIONS } from "../data/mockData";
import type { DbCampusLocation } from "./types";

seedMockData("campus_locations", MOCK_LOCATIONS as unknown as DbCampusLocation[]);

export const locationService = createCrudService<DbCampusLocation>("campus_locations");
