import { createCrudService, seedMockData } from "./crud";
import type { DbUser } from "./types";

const mockUsers: DbUser[] = [
  { id: "u1", name: "Dr. Maria Santos", email: "m.santos@plv.edu.ph", role: "admin", department: "Office of the President", status: "active", last_login: "2025-01-15T08:30:00Z", created_at: "2024-01-01", updated_at: "2025-01-15" },
  { id: "u2", name: "Engr. Juan Dela Cruz", email: "j.delacruz@plv.edu.ph", role: "faculty", department: "College of Engineering", status: "active", last_login: "2025-01-14T14:22:00Z", created_at: "2024-01-01", updated_at: "2025-01-14" },
  { id: "u3", name: "Ana Reyes", email: "a.reyes@plv.edu.ph", role: "staff", department: "Library Services", status: "active", last_login: "2025-01-13T09:10:00Z", created_at: "2024-06-01", updated_at: "2025-01-13" },
  { id: "u4", name: "Prof. Carlo Mendoza", email: "c.mendoza@plv.edu.ph", role: "moderator", department: "Student Affairs", status: "active", last_login: "2025-01-12T16:45:00Z", created_at: "2024-03-15", updated_at: "2025-01-12" },
  { id: "u5", name: "Rosa Lim", email: "r.lim@plv.edu.ph", role: "staff", department: "Finance Office", status: "inactive", last_login: "2024-12-28T11:00:00Z", created_at: "2024-01-01", updated_at: "2024-12-28" },
  { id: "u6", name: "Mark Torres", email: "m.torres@plv.edu.ph", role: "faculty", department: "College of Arts & Sciences", status: "active", last_login: "2025-01-11T10:30:00Z", created_at: "2024-08-20", updated_at: "2025-01-11" },
];

seedMockData("users", mockUsers);

export const userService = createCrudService<DbUser>("users");
