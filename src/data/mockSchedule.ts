/**
 * Mock class schedule data for Schedule-Aware Navigation.
 *
 * Represents a typical PLV student's weekly schedule with:
 * - Course name, building, room, time, days
 * - Professor information
 * - Realistic room assignments matching the floor plan data
 */

import { calculateTransition } from "../lib/pathfinding";

export interface ScheduledClass {
  id: string;
  courseCode: string;
  courseName: string;
  buildingId: string;
  roomName: string;
  roomId: string | null;
  floor: number;
  professor: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sunday, 1=Monday
  startTime: string;  // "HH:MM" format, 24h
  endTime: string;
  section: string;
}

export interface ClassSchedule {
  studentName: string;
  studentId: string;
  course: string;
  year: number;
  semester: string;
  classes: ScheduledClass[];
}

// ── Mock schedule for a 3rd-year Computer Engineering student ──────────────
export const MOCK_SCHEDULE: ClassSchedule = {
  studentName: "Juan Dela Cruz",
  studentId: "2023-01234",
  course: "BS Computer Engineering",
  year: 3,
  semester: "First Semester AY 2025–2026",
  classes: [
    // ── Monday ──
    {
      id: "c1",
      courseCode: "CPE 401",
      courseName: "Embedded Systems",
      buildingId: "b4",  // ELB
      roomName: "Computer Lab 1",
      roomId: "e102",
      floor: 1,
      professor: "Prof. Reyes",
      dayOfWeek: 1,
      startTime: "07:00",
      endTime: "09:00",
      section: "A",
    },
    {
      id: "c2",
      courseCode: "MATH 301",
      courseName: "Engineering Mathematics",
      buildingId: "b1",  // MAB
      roomName: "Room 301",
      roomId: "m301",
      floor: 3,
      professor: "Prof. Santos",
      dayOfWeek: 1,
      startTime: "09:30",
      endTime: "11:00",
      section: "B",
    },
    {
      id: "c3",
      courseCode: "CPE 403",
      courseName: "Digital Signal Processing",
      buildingId: "b4",  // ELB
      roomName: "Electronics Lab",
      roomId: "e201",
      floor: 2,
      professor: "Prof. Cruz",
      dayOfWeek: 1,
      startTime: "13:00",
      endTime: "15:00",
      section: "A",
    },
    // ── Tuesday ──
    {
      id: "c4",
      courseCode: "CS 201",
      courseName: "Data Structures & Algorithms",
      buildingId: "b1",  // MAB
      roomName: "Room 205",
      roomId: "m207",
      floor: 2,
      professor: "Prof. Villanueva",
      dayOfWeek: 2,
      startTime: "07:00",
      endTime: "09:00",
      section: "A",
    },
    {
      id: "c5",
      courseCode: "ENGL 102",
      courseName: "Technical Writing",
      buildingId: "b3",  // LRC
      roomName: "Silent Study Area",
      roomId: "l305",
      floor: 3,
      professor: "Prof. Garcia",
      dayOfWeek: 2,
      startTime: "09:30",
      endTime: "11:00",
      section: "B",
    },
    {
      id: "c6",
      courseCode: "PE 2",
      courseName: "Physical Education",
      buildingId: "b5",  // GYM
      roomName: "Main Court",
      roomId: "g101",
      floor: 1,
      professor: "Coach Dimagiba",
      dayOfWeek: 2,
      startTime: "13:00",
      endTime: "15:00",
      section: "A",
    },
    // ── Wednesday ──
    {
      id: "c7",
      courseCode: "CPE 401",
      courseName: "Embedded Systems (Lab)",
      buildingId: "b4",  // ELB
      roomName: "Computer Lab 2",
      roomId: "e103",
      floor: 1,
      professor: "Prof. Reyes",
      dayOfWeek: 3,
      startTime: "07:00",
      endTime: "10:00",
      section: "A",
    },
    {
      id: "c8",
      courseCode: "CPE 403",
      courseName: "Digital Signal Processing",
      buildingId: "b4",  // ELB
      roomName: "Electronics Lab",
      roomId: "e201",
      floor: 2,
      professor: "Prof. Cruz",
      dayOfWeek: 3,
      startTime: "11:00",
      endTime: "13:00",
      section: "A",
    },
    // ── Thursday ──
    {
      id: "c9",
      courseCode: "CS 201",
      courseName: "Data Structures & Algorithms",
      buildingId: "b1",  // MAB
      roomName: "Room 205",
      roomId: "m207",
      floor: 2,
      professor: "Prof. Villanueva",
      dayOfWeek: 4,
      startTime: "07:00",
      endTime: "09:00",
      section: "A",
    },
    {
      id: "c10",
      courseCode: "MATH 301",
      courseName: "Engineering Mathematics",
      buildingId: "b1",  // MAB
      roomName: "Room 303",
      roomId: "m303",
      floor: 3,
      professor: "Prof. Santos",
      dayOfWeek: 4,
      startTime: "09:30",
      endTime: "11:00",
      section: "B",
    },
    {
      id: "c11",
      courseCode: "CPE 405",
      courseName: "Robotics Fundamentals",
      buildingId: "b4",  // ELB
      roomName: "Research Laboratory",
      roomId: "e401",
      floor: 4,
      professor: "Prof. Santos",
      dayOfWeek: 4,
      startTime: "13:00",
      endTime: "16:00",
      section: "A",
    },
    // ── Friday ──
    {
      id: "c12",
      courseCode: "GEC 101",
      courseName: "Understanding the Self",
      buildingId: "b6",  // SSC
      roomName: "Training Room",
      roomId: "s301",
      floor: 3,
      professor: "Prof. Morales",
      dayOfWeek: 5,
      startTime: "09:00",
      endTime: "11:00",
      section: "B",
    },
    {
      id: "c13",
      courseCode: "CPE 407",
      courseName: "Capstone Project 1",
      buildingId: "b4",  // ELB
      roomName: "Drawing Room",
      roomId: "e304",
      floor: 3,
      professor: "Prof. Reyes",
      dayOfWeek: 5,
      startTime: "13:00",
      endTime: "16:00",
      section: "A",
    },
  ],
};

// ── Schedule helpers ───────────────────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function getDayName(day: number): string {
  return DAY_NAMES[day] ?? "Unknown";
}

export function getShortDayName(day: number): string {
  return SHORT_DAY_NAMES[day] ?? "Unknown";
}

/**
 * Get today's classes in chronological order.
 */
export function getTodayClasses(schedule: ClassSchedule): ScheduledClass[] {
  const today = new Date().getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return schedule.classes
    .filter(c => c.dayOfWeek === today)
    .sort((a, b) => {
      const [ah, am] = a.startTime.split(":").map(Number);
      const [bh, bm] = b.startTime.split(":").map(Number);
      return ah * 60 + am - (bh * 60 + bm);
    });
}

/**
 * Parse "HH:MM" to total minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Format minutes since midnight to "HH:MM AM/PM".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
}

/**
 * Get the next upcoming class (or current class if within time window).
 */
export function getNextClass(classes: ScheduledClass[]): ScheduledClass | null {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const todayClasses = getTodayClasses({ studentName: "", studentId: "", course: "", year: 0, semester: "", classes });
  const today = new Date().getDay();

  // Filter for today only
  const todaysClasses = todayClasses.filter(c => c.dayOfWeek === today);

  for (const c of todaysClasses) {
    const start = timeToMinutes(c.startTime);
    const end = timeToMinutes(c.endTime);
    // Current class or next upcoming
    if (nowMin < end) return c;
  }
  return null;
}

/**
 * Calculate how many minutes until the next class starts.
 */
export function minutesUntilNext(classes: ScheduledClass[]): number | null {
  const next = getNextClass(classes);
  if (!next) return null;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(next.startTime);
  return Math.max(0, start - nowMin);
}

/**
 * Get the transition warning status between two classes.
 */
export function getTransitionStatus(
  prevClass: ScheduledClass,
  nextClass: ScheduledClass
): {
  availableMinutes: number;
  neededMinutes: number;
  isTight: boolean;
  willBeLate: boolean;
} {
  const prevEnd = timeToMinutes(prevClass.endTime);
  const nextStart = timeToMinutes(nextClass.startTime);
  const availableMinutes = nextStart - prevEnd;

  // Use pathfinding for accurate transition time
  const { minutes: neededMinutes } =
    prevClass.buildingId === nextClass.buildingId
      ? { minutes: Math.abs((nextClass.floor ?? 1) - (prevClass.floor ?? 1)) * 2 + 2, seconds: 0 }
      : calculateTransition(prevClass.buildingId, nextClass.buildingId, prevClass.floor, nextClass.floor);

  return {
    availableMinutes,
    neededMinutes,
    isTight: availableMinutes < neededMinutes + 2, // less than 2 min buffer
    willBeLate: availableMinutes < neededMinutes,
  };
}
