import { createCrudService, seedMockData } from "./crud";
import { MOCK_BUILDINGS } from "../data/mockData";
import type { DbBuilding } from "./types";

seedMockData("buildings", MOCK_BUILDINGS as unknown as DbBuilding[]);

export const buildingService = createCrudService<DbBuilding>("buildings");
