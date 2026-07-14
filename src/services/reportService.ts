import { createCrudService, seedMockData } from "./crud";
import type { DbReport } from "./types";

const mockReports: DbReport[] = [
  { id: "rpt1", type: "Broken Elevator", building: "ADM Building", location_detail: "2nd Floor near south wing", description: "Elevator has been stuck at 2F since Monday.", reporter: "student_2023001", status: "investigating", has_image: true, created_at: "2025-01-15", updated_at: "2025-01-15" },
  { id: "rpt2", type: "Blocked Walkway", building: "Near Library", location_detail: "Main walkway between LRC and MAB", description: "Construction materials blocking the main path.", reporter: "student_2023045", status: "pending", has_image: false, created_at: "2025-01-14", updated_at: "2025-01-14" },
  { id: "rpt3", type: "Broken Light", building: "MAB", location_detail: "Ground floor hallway, east wing", description: "Three ceiling lights out on the entire ground floor east corridor.", reporter: "student_2023102", status: "approved", has_image: true, created_at: "2025-01-13", updated_at: "2025-01-13" },
  { id: "rpt4", type: "Inaccessible Ramp", building: "ELB", location_detail: "Main entrance ramp", description: "Wheelchair ramp has a broken guard rail.", reporter: "student_2022078", status: "resolved", has_image: true, created_at: "2025-01-12", updated_at: "2025-01-13" },
  { id: "rpt5", type: "Flooded Area", building: "Gymnasium", location_detail: "South entrance pathway", description: "Heavy rain caused flooding near south entrance.", reporter: "student_2023210", status: "resolved", has_image: false, created_at: "2025-01-10", updated_at: "2025-01-11" },
  { id: "rpt6", type: "Incorrect Room Name", building: "MAB", location_detail: "Room 302, 3rd Floor", description: "Room 302 labeled as Computer Lab but converted to faculty lounge.", reporter: "student_2023089", status: "pending", has_image: false, created_at: "2025-01-09", updated_at: "2025-01-09" },
  { id: "rpt7", type: "Safety Hazard", building: "ELB", location_detail: "Workshop area, Ground Floor", description: "Exposed wiring near the electrical workshop.", reporter: "student_2022156", status: "investigating", has_image: true, created_at: "2025-01-08", updated_at: "2025-01-08" },
  { id: "rpt8", type: "Facility Problem", building: "SSC", location_detail: "Student Council area, 1st Floor", description: "AC unit leaking water onto the floor.", reporter: "student_2023334", status: "rejected", has_image: false, created_at: "2025-01-07", updated_at: "2025-01-07" },
];

seedMockData("reports", mockReports);

export const reportService = createCrudService<DbReport>("reports");
