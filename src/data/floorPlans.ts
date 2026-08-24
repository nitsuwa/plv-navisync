// Floor plan data for PLV campus buildings
// Each room: { id, name, x, y, w, h, type }
// Coordinate space: 0-400 wide, 0-300 tall per floor

export type RoomType = "classroom" | "office" | "lab" | "lobby" | "restroom" | "stairs" | "elevator" | "library" | "corridor" | "storage" | "canteen";

export interface Room {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number;
  type: RoomType;
}

export interface Floor {
  number: number;
  label: string;
  rooms: Room[];
}

export interface FloorPlanData {
  buildingId: string;
  buildingName: string;
  floors: Floor[];
}

const MAB_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      { id: "m101", name: "Main Lobby",     x: 20,  y: 100, w: 140, h: 100, type: "lobby"    },
      { id: "m102", name: "Registrar",      x: 175, y: 100, w: 100, h: 60,  type: "office"   },
      { id: "m103", name: "Cashier",        x: 175, y: 170, w: 100, h: 30,  type: "office"   },
      { id: "m104", name: "Room 101",       x: 290, y: 100, w: 90,  h: 50,  type: "classroom"},
      { id: "m105", name: "Room 102",       x: 290, y: 160, w: 90,  h: 50,  type: "classroom"},
      { id: "m106", name: "Guard Station",  x: 20,  y: 210, w: 60,  h: 50,  type: "office"   },
      { id: "m107", name: "Restroom ♂",    x: 90,  y: 220, w: 40,  h: 40,  type: "restroom" },
      { id: "m108", name: "Restroom ♀",    x: 140, y: 220, w: 40,  h: 40,  type: "restroom" },
      { id: "m109", name: "Stairs A",      x: 295, y: 230, w: 35,  h: 35,  type: "stairs"   },
      { id: "m110", name: "Elevator",      x: 340, y: 230, w: 30,  h: 35,  type: "elevator" },
    ],
  },
  {
    number: 2, label: "2nd Floor",
    rooms: [
      { id: "m201", name: "Dean's Office",    x: 20,  y: 80,  w: 100, h: 70,  type: "office"   },
      { id: "m202", name: "Faculty Room",     x: 130, y: 80,  w: 110, h: 70,  type: "office"   },
      { id: "m203", name: "Room 201",         x: 255, y: 80,  w: 80,  h: 60,  type: "classroom"},
      { id: "m204", name: "Room 202",         x: 345, y: 80,  w: 80,  h: 60,  type: "classroom"},
      { id: "m205", name: "Room 203",         x: 20,  y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m206", name: "Room 204",         x: 110, y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m207", name: "Room 205",         x: 200, y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m208", name: "Restroom ♂",      x: 295, y: 195, w: 35,  h: 30,  type: "restroom" },
      { id: "m209", name: "Restroom ♀",      x: 335, y: 195, w: 35,  h: 30,  type: "restroom" },
      { id: "m210", name: "Stairs A",         x: 295, y: 235, w: 35,  h: 30,  type: "stairs"   },
      { id: "m211", name: "Elevator",         x: 340, y: 235, w: 30,  h: 30,  type: "elevator" },
    ],
  },
  {
    number: 3, label: "3rd Floor",
    rooms: [
      { id: "m301", name: "Room 301",         x: 20,  y: 80,  w: 80,  h: 60,  type: "classroom"},
      { id: "m302", name: "Room 302",         x: 110, y: 80,  w: 80,  h: 60,  type: "classroom"},
      { id: "m303", name: "Room 303",         x: 200, y: 80,  w: 80,  h: 60,  type: "classroom"},
      { id: "m304", name: "Room 304",         x: 290, y: 80,  w: 80,  h: 60,  type: "classroom"},
      { id: "m305", name: "Room 305",         x: 20,  y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m306", name: "Room 306",         x: 110, y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m307", name: "Room 307",         x: 200, y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m308", name: "Room 308",         x: 290, y: 165, w: 80,  h: 60,  type: "classroom"},
      { id: "m309", name: "Stairs A",         x: 380, y: 80,  w: 35,  h: 35,  type: "stairs"   },
      { id: "m310", name: "Elevator",         x: 380, y: 125, w: 30,  h: 30,  type: "elevator" },
    ],
  },
  {
    number: 4, label: "4th Floor",
    rooms: [
      { id: "m401", name: "Computer Lab 1",   x: 20,  y: 80,  w: 160, h: 80,  type: "lab"      },
      { id: "m402", name: "Computer Lab 2",   x: 190, y: 80,  w: 160, h: 80,  type: "lab"      },
      { id: "m403", name: "Room 401",         x: 20,  y: 175, w: 100, h: 60,  type: "classroom"},
      { id: "m404", name: "Room 402",         x: 130, y: 175, w: 100, h: 60,  type: "classroom"},
      { id: "m405", name: "Faculty Lounge",   x: 240, y: 175, w: 100, h: 60,  type: "office"   },
      { id: "m406", name: "Stairs A",         x: 355, y: 100, w: 35,  h: 35,  type: "stairs"   },
      { id: "m407", name: "Elevator",         x: 355, y: 145, w: 30,  h: 30,  type: "elevator" },
    ],
  },
  {
    number: 5, label: "5th Floor",
    rooms: [
      { id: "m501", name: "Conference Room A", x: 20,  y: 80,  w: 150, h: 100, type: "office"   },
      { id: "m502", name: "Conference Room B", x: 180, y: 80,  w: 150, h: 100, type: "office"   },
      { id: "m503", name: "Room 501",          x: 20,  y: 195, w: 100, h: 60,  type: "classroom"},
      { id: "m504", name: "Room 502",          x: 130, y: 195, w: 100, h: 60,  type: "classroom"},
      { id: "m505", name: "Rooftop Access",    x: 340, y: 80,  w: 80,  h: 80,  type: "stairs"   },
    ],
  },
];

const LRC_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      { id: "l101", name: "Main Entrance",    x: 30,  y: 200, w: 60,  h: 60,  type: "lobby"    },
      { id: "l102", name: "Circulation Desk", x: 100, y: 130, w: 100, h: 70,  type: "office"   },
      { id: "l103", name: "General Reference",x: 210, y: 100, w: 160, h: 100, type: "library"  },
      { id: "l104", name: "Reading Area",     x: 100, y: 210, w: 200, h: 80,  type: "library"  },
      { id: "l105", name: "Restroom ♂",       x: 320, y: 215, w: 35,  h: 30,  type: "restroom" },
      { id: "l106", name: "Restroom ♀",       x: 360, y: 215, w: 35,  h: 30,  type: "restroom" },
      { id: "l107", name: "BDO ATM",          x: 30,  y: 130, w: 55,  h: 55,  type: "office"   },
      { id: "l108", name: "Stairs",           x: 360, y: 100, w: 40,  h: 50,  type: "stairs"   },
    ],
  },
  {
    number: 2, label: "2nd Floor",
    rooms: [
      { id: "l201", name: "Study Rooms 1–4",  x: 30,  y: 100, w: 150, h: 90,  type: "library"  },
      { id: "l202", name: "Digital Resources", x: 190, y: 100, w: 110, h: 90,  type: "lab"      },
      { id: "l203", name: "Media Center",      x: 310, y: 100, w: 90,  h: 90,  type: "library"  },
      { id: "l204", name: "Periodicals",       x: 30,  y: 205, w: 260, h: 80,  type: "library"  },
      { id: "l205", name: "Stairs",            x: 360, y: 205, w: 40,  h: 45,  type: "stairs"   },
    ],
  },
  {
    number: 3, label: "3rd Floor",
    rooms: [
      { id: "l301", name: "Thesis Section",    x: 30,  y: 100, w: 160, h: 100, type: "library"  },
      { id: "l302", name: "Special Collections",x: 200, y: 100, w: 100, h: 100, type: "library"  },
      { id: "l303", name: "Archives",          x: 310, y: 100, w: 90,  h: 100, type: "storage"  },
      { id: "l304", name: "Librarian Office",  x: 30,  y: 210, w: 100, h: 60,  type: "office"   },
      { id: "l305", name: "Silent Study Area", x: 140, y: 210, w: 180, h: 60,  type: "library"  },
      { id: "l306", name: "Stairs",            x: 360, y: 210, w: 40,  h: 40,  type: "stairs"   },
    ],
  },
];

const SSC_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      { id: "s101", name: "Canteen",           x: 30,  y: 100, w: 170, h: 110, type: "canteen"  },
      { id: "s102", name: "Health Clinic",     x: 210, y: 100, w: 110, h: 80,  type: "office"   },
      { id: "s103", name: "Scholarship Office",x: 210, y: 185, w: 110, h: 50,  type: "office"   },
      { id: "s104", name: "Restroom ♂",        x: 330, y: 100, w: 40,  h: 40,  type: "restroom" },
      { id: "s105", name: "Restroom ♀",        x: 330, y: 148, w: 40,  h: 40,  type: "restroom" },
      { id: "s106", name: "Stairs",            x: 330, y: 200, w: 40,  h: 40,  type: "stairs"   },
    ],
  },
  {
    number: 2, label: "2nd Floor",
    rooms: [
      { id: "s201", name: "Student Affairs",   x: 30,  y: 100, w: 130, h: 80,  type: "office"   },
      { id: "s202", name: "Guidance Office",   x: 170, y: 100, w: 120, h: 80,  type: "office"   },
      { id: "s203", name: "OSA",               x: 30,  y: 190, w: 100, h: 70,  type: "office"   },
      { id: "s204", name: "Meeting Room",      x: 140, y: 190, w: 100, h: 70,  type: "office"   },
      { id: "s205", name: "Org Hub",           x: 300, y: 100, w: 70,  h: 160, type: "office"   },
      { id: "s206", name: "Stairs",            x: 380, y: 100, w: 40,  h: 40,  type: "stairs"   },
    ],
  },
  {
    number: 3, label: "3rd Floor",
    rooms: [
      { id: "s301", name: "Training Room",     x: 30,  y: 100, w: 160, h: 90,  type: "lab"      },
      { id: "s302", name: "Conference Room",   x: 200, y: 100, w: 120, h: 90,  type: "office"   },
      { id: "s303", name: "Storage",           x: 330, y: 100, w: 80,  h: 90,  type: "storage"  },
      { id: "s304", name: "Stairs",            x: 380, y: 200, w: 40,  h: 40,  type: "stairs"   },
    ],
  },
];

// ── ADM — Administration Building (4 floors) ─────────────────────────────────
const ADM_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      { id:"a101", name:"Main Lobby",         x:20,  y:90,  w:160, h:110, type:"lobby"    },
      { id:"a102", name:"Cashier",             x:190, y:90,  w:90,  h:60,  type:"office"   },
      { id:"a103", name:"Registrar Window",    x:190, y:158, w:90,  h:42,  type:"office"   },
      { id:"a104", name:"Security Post",       x:20,  y:210, w:60,  h:40,  type:"office"   },
      { id:"a105", name:"Restroom ♂",          x:295, y:90,  w:40,  h:35,  type:"restroom" },
      { id:"a106", name:"Restroom ♀",          x:340, y:90,  w:40,  h:35,  type:"restroom" },
      { id:"a107", name:"Stairs",              x:295, y:135, w:40,  h:35,  type:"stairs"   },
      { id:"a108", name:"Elevator",            x:340, y:135, w:35,  h:35,  type:"elevator" },
    ],
  },
  {
    number: 2, label: "2nd Floor",
    rooms: [
      { id:"a201", name:"Human Resources",     x:20,  y:80,  w:130, h:80,  type:"office"   },
      { id:"a202", name:"Finance Office",      x:160, y:80,  w:120, h:80,  type:"office"   },
      { id:"a203", name:"Budget & Planning",   x:20,  y:170, w:120, h:70,  type:"office"   },
      { id:"a204", name:"Records Section",     x:150, y:170, w:130, h:70,  type:"storage"  },
      { id:"a205", name:"Restroom ♂",          x:295, y:80,  w:40,  h:35,  type:"restroom" },
      { id:"a206", name:"Restroom ♀",          x:340, y:80,  w:40,  h:35,  type:"restroom" },
      { id:"a207", name:"Stairs",              x:295, y:125, w:40,  h:35,  type:"stairs"   },
    ],
  },
  {
    number: 3, label: "3rd Floor",
    rooms: [
      { id:"a301", name:"Office of the President", x:20,  y:80,  w:160, h:90,  type:"office"   },
      { id:"a302", name:"Board Room",              x:190, y:80,  w:120, h:90,  type:"office"   },
      { id:"a303", name:"VP Academic Affairs",     x:20,  y:180, w:130, h:70,  type:"office"   },
      { id:"a304", name:"VP Admin & Finance",      x:160, y:180, w:130, h:70,  type:"office"   },
      { id:"a305", name:"Stairs",                  x:295, y:80,  w:40,  h:35,  type:"stairs"   },
    ],
  },
  {
    number: 4, label: "4th Floor",
    rooms: [
      { id:"a401", name:"Archives Room",       x:20,  y:80,  w:160, h:90,  type:"storage"  },
      { id:"a402", name:"ICTD Office",         x:190, y:80,  w:120, h:90,  type:"office"   },
      { id:"a403", name:"Server Room",         x:20,  y:180, w:80,  h:70,  type:"lab"      },
      { id:"a404", name:"Maintenance Store",   x:110, y:180, w:80,  h:70,  type:"storage"  },
      { id:"a405", name:"Stairs",              x:295, y:80,  w:40,  h:35,  type:"stairs"   },
    ],
  },
];

// ── ELB — Engineering Laboratory Building (4 floors) ─────────────────────────
const ELB_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      { id:"e101", name:"Reception",           x:20,  y:90,  w:80,  h:60,  type:"lobby"    },
      { id:"e102", name:"Computer Lab 1",      x:110, y:90,  w:150, h:80,  type:"lab"      },
      { id:"e103", name:"Computer Lab 2",      x:270, y:90,  w:130, h:80,  type:"lab"      },
      { id:"e104", name:"Faculty Room",        x:20,  y:160, w:100, h:70,  type:"office"   },
      { id:"e105", name:"Storage",             x:130, y:180, w:80,  h:50,  type:"storage"  },
      { id:"e106", name:"Stairs",              x:380, y:90,  w:40,  h:40,  type:"stairs"   },
    ],
  },
  {
    number: 2, label: "2nd Floor",
    rooms: [
      { id:"e201", name:"Electronics Lab",     x:20,  y:80,  w:160, h:90,  type:"lab"      },
      { id:"e202", name:"Circuits Lab",        x:190, y:80,  w:120, h:90,  type:"lab"      },
      { id:"e203", name:"Mechanical Lab",      x:20,  y:180, w:160, h:70,  type:"lab"      },
      { id:"e204", name:"Instrument Room",     x:190, y:180, w:120, h:70,  type:"storage"  },
      { id:"e205", name:"Stairs",              x:380, y:80,  w:40,  h:40,  type:"stairs"   },
    ],
  },
  {
    number: 3, label: "3rd Floor",
    rooms: [
      { id:"e301", name:"Civil Engineering Lab",  x:20,  y:80,  w:170, h:90,  type:"lab"   },
      { id:"e302", name:"Materials Testing",      x:200, y:80,  w:110, h:90,  type:"lab"   },
      { id:"e303", name:"Engineering Faculty",    x:20,  y:180, w:130, h:70,  type:"office"},
      { id:"e304", name:"Drawing Room",           x:160, y:180, w:150, h:70,  type:"classroom"},
      { id:"e305", name:"Stairs",                 x:380, y:80,  w:40,  h:40,  type:"stairs"},
    ],
  },
  {
    number: 4, label: "4th Floor",
    rooms: [
      { id:"e401", name:"Research Laboratory",  x:20,  y:80,  w:200, h:100, type:"lab"     },
      { id:"e402", name:"Seminar Room",         x:230, y:80,  w:110, h:100, type:"classroom"},
      { id:"e403", name:"Equipment Storage",    x:20,  y:190, w:150, h:60,  type:"storage" },
      { id:"e404", name:"Thesis Defense Room",  x:180, y:190, w:160, h:60,  type:"office"  },
      { id:"e405", name:"Stairs",               x:380, y:80,  w:40,  h:40,  type:"stairs"  },
    ],
  },
];

// ── GYM — Gymnasium & Sports Complex (2 floors) ───────────────────────────────
const GYM_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      { id:"g101", name:"Main Court",          x:20,  y:80,  w:240, h:150, type:"lobby"    },
      { id:"g102", name:"Bleachers West",      x:20,  y:238, w:110, h:30,  type:"corridor" },
      { id:"g103", name:"Bleachers East",      x:150, y:238, w:110, h:30,  type:"corridor" },
      { id:"g104", name:"Locker Room ♂",       x:275, y:80,  w:80,  h:70,  type:"restroom" },
      { id:"g105", name:"Locker Room ♀",       x:275, y:160, w:80,  h:70,  type:"restroom" },
      { id:"g106", name:"Equipment Room",      x:275, y:238, w:80,  h:30,  type:"storage"  },
      { id:"g107", name:"Ticket Booth",        x:20,  y:50,  w:50,  h:25,  type:"office"   },
      { id:"g108", name:"Stairs",              x:370, y:80,  w:40,  h:40,  type:"stairs"   },
    ],
  },
  {
    number: 2, label: "2nd Floor",
    rooms: [
      { id:"g201", name:"Fitness Room",        x:20,  y:80,  w:160, h:120, type:"gym"      },
      { id:"g202", name:"Aerobics Room",       x:190, y:80,  w:120, h:120, type:"gym"      },
      { id:"g203", name:"Storage",             x:325, y:80,  w:60,  h:60,  type:"storage"  },
      { id:"g204", name:"Stairs",              x:370, y:80,  w:40,  h:40,  type:"stairs"   },
    ],
  },
];


// ── CABA — College of Accountancy & Business Administration (1 floor) ──────
const CABA_FLOORS: Floor[] = [
  {
    number: 1, label: "Ground Floor",
    rooms: [
      // ── Upper Row (above hallway) ──────────────────────────────────
      { id: "caba_r_stairs_l", name: "Stairs (Left)",             x: 8,   y: 10,  w: 34,  h: 80,  type: "stairs"   },
      { id: "caba_r_elec",     name: "Electrical Room",           x: 42,  y: 10,  w: 50,  h: 36,  type: "storage"  },
      { id: "caba_r_stor1",    name: "Storage (Left)",            x: 42,  y: 46,  w: 50,  h: 44,  type: "storage"  },
      { id: "caba_r102",       name: "CABA-102",                  x: 92,  y: 10,  w: 106, h: 80,  type: "classroom" },
      { id: "caba_r103",       name: "CABA-103",                  x: 198, y: 10,  w: 106, h: 80,  type: "classroom" },
      { id: "caba_r104",       name: "CABA-104",                  x: 304, y: 10,  w: 106, h: 80,  type: "classroom" },
      { id: "caba_r_cr_f",     name: "Female CR",                 x: 410, y: 10,  w: 26,  h: 80,  type: "restroom" },
      { id: "caba_r_cr_m",     name: "Male CR",                   x: 436, y: 10,  w: 27,  h: 45,  type: "restroom" },
      { id: "caba_r_pwd",      name: "PWD CR",                    x: 436, y: 55,  w: 27,  h: 35,  type: "restroom" },
      { id: "caba_r_elev",     name: "Elevator",                  x: 463, y: 35,  w: 45,  h: 55,  type: "elevator" },
      { id: "caba_r_stor_rt",  name: "Storage Room (Right Top)",  x: 508, y: 10,  w: 50,  h: 36,  type: "storage"  },
      { id: "caba_r_stor_rb",  name: "Storage (Right)",           x: 508, y: 46,  w: 50,  h: 44,  type: "storage"  },
      { id: "caba_r_stairs_r", name: "Stairs (Right)",            x: 558, y: 10,  w: 34,  h: 80,  type: "stairs"   },

      // ── Middle Corridor / Hallway ─────────────────────────────────
      { id: "caba_r_hallway",  name: "Hallway",                   x: 8,   y: 90,  w: 584, h: 40,  type: "corridor" },

      // ── Lower Row (below hallway) ──────────────────────────────────
      { id: "caba_r_biz",      name: "Business Office Sim Room",  x: 8,   y: 130, w: 90,  h: 80,  type: "lab"      },
      { id: "caba_r101",       name: "CABA-101",                  x: 98,  y: 130, w: 106, h: 80,  type: "classroom" },
      { id: "caba_r_lobby",    name: "Lobby",                     x: 204, y: 130, w: 106, h: 80,  type: "lobby"    },
      { id: "caba_r_veranda",  name: "Veranda",                   x: 204, y: 210, w: 106, h: 35,  type: "lobby"    },
      { id: "caba_r_grad",     name: "Graduate Studies Office",   x: 310, y: 130, w: 78,  h: 80,  type: "office"   },
      { id: "caba_r_sim",      name: "Simulation Room",           x: 388, y: 130, w: 170, h: 80,  type: "lab"      },
    ],
  },
];

export const FLOOR_PLANS: Record<string, FloorPlanData> = {
  b1: { buildingId: "b1", buildingName: "Main Academic Building",              floors: MAB_FLOORS },
  b2: { buildingId: "b2", buildingName: "Administration Building",             floors: ADM_FLOORS },
  b3: { buildingId: "b3", buildingName: "Library & Learning Resource Center",  floors: LRC_FLOORS },
  b4: { buildingId: "b4", buildingName: "Engineering Laboratory Building",     floors: ELB_FLOORS },
  b5: { buildingId: "b5", buildingName: "Gymnasium & Sports Complex",          floors: GYM_FLOORS },
  b6: { buildingId: "b6", buildingName: "Student Services Center",             floors: SSC_FLOORS },
  b7: { buildingId: "b7", buildingName: "College of Accountancy & Business Administration", floors: CABA_FLOORS },
};

export const ROOM_COLORS: Record<RoomType, { fill: string; stroke: string; text: string }> = {
  classroom: { fill: "#dbeafe", stroke: "#3b82f6", text: "#1e40af" },
  office:    { fill: "#e0e7ff", stroke: "#6366f1", text: "#3730a3" },
  lab:       { fill: "#dcfce7", stroke: "#22c55e", text: "#166534" },
  lobby:     { fill: "#fef3c7", stroke: "#f59e0b", text: "#92400e" },
  restroom:  { fill: "#f1f5f9", stroke: "#94a3b8", text: "#475569" },
  stairs:    { fill: "#fce7f3", stroke: "#ec4899", text: "#9d174d" },
  elevator:  { fill: "#f3e8ff", stroke: "#a855f7", text: "#7e22ce" },
  library:   { fill: "#cffafe", stroke: "#06b6d4", text: "#155e75" },
  corridor:  { fill: "#f8fafc", stroke: "#cbd5e1", text: "#64748b" },
  storage:   { fill: "#fef9c3", stroke: "#eab308", text: "#854d0e" },
  canteen:   { fill: "#ffedd5", stroke: "#f97316", text: "#9a3412" },
};

// Dark mode room colors
export const ROOM_COLORS_DARK: Record<RoomType, { fill: string; stroke: string; text: string }> = {
  classroom: { fill: "#1e3a5f", stroke: "#60a5fa", text: "#93c5fd" },
  office:    { fill: "#1e1b4b", stroke: "#818cf8", text: "#a5b4fc" },
  lab:       { fill: "#052e16", stroke: "#4ade80", text: "#86efac" },
  lobby:     { fill: "#451a03", stroke: "#fbbf24", text: "#fde68a" },
  restroom:  { fill: "#0f172a", stroke: "#475569", text: "#94a3b8" },
  stairs:    { fill: "#500724", stroke: "#f472b6", text: "#fbcfe8" },
  elevator:  { fill: "#3b0764", stroke: "#c084fc", text: "#e9d5ff" },
  library:   { fill: "#083344", stroke: "#22d3ee", text: "#67e8f9" },
  corridor:  { fill: "#0f172a", stroke: "#334155", text: "#64748b" },
  storage:   { fill: "#422006", stroke: "#fbbf24", text: "#fde68a" },
  canteen:   { fill: "#431407", stroke: "#fb923c", text: "#fdba74" },
};
