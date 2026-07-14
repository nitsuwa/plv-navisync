import { createCrudService, seedMockData } from "./crud";
import { SEED_CAMPUSES } from "../components/map-builder";
import type { Campus } from "../components/map-builder/types";

// Register the seed campuses in the mock store
seedMockData("campuses", SEED_CAMPUSES);

export const campusService = createCrudService<Campus>("campuses");
