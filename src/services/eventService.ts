import { createCrudService, seedMockData } from "./crud";
import type { DbCampusEvent } from "./types";

const mockEvents: DbCampusEvent[] = [
  { id: "ev1", campus_id: "campus_plv", title: "PLV Foundation Day 2025", description: "Annual foundation day celebration with performances, exhibits, and booths across the campus.", venue: "Campus-wide", date_start: "Jan 25, 2025", date_end: "Jan 27, 2025", status: "scheduled", marker_count: 12, organizer: "PLV Office of Student Affairs", affected_areas: ["Main Plaza", "MAB Grounds", "GYM Area"], temp_features: ["Stage", "Food Booths (×8)", "Registration Tent", "First Aid Station", "Temporary Restrooms"], created_at: "2025-01-05", updated_at: "2025-01-15" },
  { id: "ev2", campus_id: "campus_plv", title: "STEM Fair 2025", description: "Annual science and technology exhibition where students showcase research projects.", venue: "Main Academic Building", date_start: "Feb 12, 2025", date_end: "Feb 14, 2025", status: "draft", marker_count: 6, organizer: "College of Engineering", affected_areas: ["MAB Ground Floor", "Main Plaza"], temp_features: ["Exhibit Booths (×20)", "Demo Area", "Judges Station"], created_at: "2025-01-10", updated_at: "2025-01-10" },
  { id: "ev3", campus_id: "campus_plv", title: "Career Fair 2024", description: "Connects students with industry partners for internship and employment opportunities.", venue: "ADM Building Lobby", date_start: "Nov 20, 2024", date_end: "Nov 21, 2024", status: "ended", marker_count: 8, organizer: "Placement Office", affected_areas: ["ADM Building", "Main Entrance"], temp_features: ["Company Booths (×15)", "Interview Rooms", "CV Submission Booth"], created_at: "2024-11-01", updated_at: "2024-11-22" },
  { id: "ev4", campus_id: "campus_plv", title: "Sports Day 2025", description: "Inter-program sports competition open to all enrolled students.", venue: "Gymnasium & Sports Field", date_start: "Mar 5, 2025", date_end: "Mar 5, 2025", status: "draft", marker_count: 5, organizer: "SSC Sports Committee", affected_areas: ["Gymnasium", "South Sports Field"], temp_features: ["Bleacher Expansion", "First Aid Tent", "Scoreboard", "Refreshment Area"], created_at: "2025-01-12", updated_at: "2025-01-12" },
];

seedMockData("campus_events", mockEvents);

export const eventService = createCrudService<DbCampusEvent>("campus_events");
