For PLV NaviSync, almost everything revolves around building and maintaining the map. Because of that, I would simplify the sidebar significantly.

Instead of having separate pages for Buildings, Announcements, Events, and Map Builder, I would make Map Builder the heart of the system. Buildings, floor plans, events, accessibility, emergency routes, and navigation should all be managed inside the Map Builder itself.

I would redesign the sidebar like this:

Dashboard

Map Builder

Reports

Users

Settings

Logout

That's it.

The Dashboard remains a quick overview of the system. Map Builder becomes the complete editor for the campus. Reports allows administrators to review issues submitted by users. Users is where administrators manage student, faculty, staff, and administrator accounts if needed. Settings contains system preferences.

Everything else should live inside the Map Builder instead of becoming separate sidebar pages.

Complete Admin Map Builder Workflow

The Map Builder should become the largest and most important module in the administrator portal because it controls everything students see on the campus map. Instead of opening a blank editing canvas immediately, the administrator should be guided through a structured workflow that mirrors how a real university campus is organized.

The system should follow a hierarchy consisting of Campus → Buildings → Floor Plans. Every feature such as navigation, accessibility, emergency routes, events, QR codes, and issue reporting should be attached somewhere within this hierarchy.

Step 1 — Empty State

When an administrator opens the Map Builder for the first time, the page should display an empty state instead of a blank canvas.

The page should clearly explain that no campus has been created yet and that the administrator must first create a campus before buildings and floor plans can be added.

The interface should contain a single large Create Campus button in the center.

If a campus already exists, this page instead displays all campuses as cards. Since PLV currently has only one campus, only one card will usually appear. The design should still support multiple campuses in the future.

Example:

Main Campus

12 Buildings
38 Floor Plans

Last updated:
July 8, 2026

Edit Campus
Step 2 — Campus Creation Wizard

After selecting Create Campus, the administrator is guided through a simple setup wizard.

The wizard should only ask for information necessary to create the campus.

The administrator enters the campus name, campus code, campus address, description, and optionally uploads a thumbnail image.

The administrator then chooses the editing canvas size and background.

The available backgrounds should include:

Blank Canvas
Grid Canvas (Recommended)
Satellite Image
Uploaded Campus Blueprint

The Grid Canvas should be selected by default because it makes alignment easier while designing.

After completing the wizard, the campus is automatically created and the administrator enters the Campus Builder.

Step 3 — Campus Builder

The Campus Builder is where the administrator designs the overall layout of the university.

Initially the canvas is empty except for the selected background.

The interface should resemble Canva or Figma rather than AutoCAD. Every object should be placed using drag-and-drop with resize, rotate, duplicate, align, snap-to-grid, undo, redo, and layer controls.

The administrator can place outdoor objects such as buildings, roads, walkways, parking lots, gates, gardens, open fields, monuments, waiting sheds, and landmarks.

Buildings at this stage are only placeholders representing the building's position within the campus. No classrooms or floor layouts are created here.

The campus canvas should remain clean and focus only on outdoor navigation.

Step 4 — Building Properties

Whenever the administrator places a building onto the campus, clicking the building opens its Building Properties panel.

This panel allows the administrator to configure all information related to that building.

The administrator enters the building name, building code, category, description, operating hours, building thumbnail, departments, offices, and the total number of floors.

The system also automatically generates a QR code that can later be printed and installed at the building entrance.

One of the most important buttons inside this panel should be Manage Floor Plans.

Clicking this button opens the Floor Manager.

Step 5 — Floor Manager

Each building contains its own Floor Manager.

Rather than editing every classroom directly on the campus map, the administrator first selects which floor they wish to edit.

For example, the Engineering Laboratory Building may contain Ground Floor, Second Floor, Third Floor, and Fourth Floor.

The administrator can create new floors, rename them, duplicate an existing floor, change their order, or remove them.

Each floor functions as an independent interactive map.

This separation keeps the campus builder simple while allowing detailed indoor navigation.

Step 6 — Floor Plan Builder

Selecting a floor opens the Floor Plan Builder.

Although it is technically a different editor, it should look and behave almost exactly like the Campus Builder so administrators never need to learn another interface.

Instead of outdoor objects, the toolbox now contains indoor components such as classrooms, laboratories, offices, hallways, walls, doors, elevators, staircases, restrooms, emergency exits, waiting areas, first aid stations, fire extinguishers, and information desks.

Each object can be dragged, resized, recolored, renamed, and categorized.

The administrator simply builds the floor plan visually rather than drawing complex blueprints.

Step 7 — Connecting Floors

One feature that makes PLV NaviSync unique is the Floor Connection system.

Staircases and elevators are not just icons placed on the map. They are actual navigation nodes that connect multiple floors together.

For example, Staircase A on the Ground Floor is connected to Staircase A on the Second Floor.

Elevator 1 can connect Ground Floor, Second Floor, Third Floor, and Fourth Floor.

Because these connections are configured by the administrator, the navigation system automatically understands how users move vertically between floors.

When a student reaches a staircase during navigation, the system knows which floor to load next.

Step 8 — Navigation Layer

Once the campus and floor layouts are complete, the administrator enters Navigation Mode.

Instead of placing buildings or classrooms, the administrator now draws the invisible walkable paths that the routing engine follows.

Outdoor navigation paths include sidewalks, roads, pedestrian crossings, and entrances.

Indoor navigation paths include hallways, room entrances, staircases, elevators, and connecting corridors.

Students never see these editing lines, but every navigation request depends on them.

Step 9 — Accessibility Layer

Accessibility should be handled as a separate editing mode rather than requiring duplicate maps.

The administrator simply selects existing objects and assigns accessibility information.

Ramps can be marked as wheelchair accessible, elevators can be marked as accessible transportation between floors, restrooms can be labeled as accessible facilities, and entrances can indicate automatic doors.

When a student activates Accessible Navigation, the routing engine automatically prioritizes ramps and elevators while avoiding stairs whenever possible.

Step 10 — Emergency Layer

The Emergency Layer allows administrators to prepare the campus for emergencies.

Instead of changing the normal navigation routes, the administrator places emergency exits, assembly areas, fire extinguishers, first aid stations, AEDs, emergency telephones, and evacuation paths.

These elements remain hidden during normal navigation but instantly become visible whenever a user activates Emergency Mode.

This provides a dedicated emergency navigation experience without cluttering the normal map.

Step 11 — Events Layer

Campus events should also be managed inside the Map Builder rather than through a separate Events page.

The administrator simply places an Event Marker directly onto the campus map or a floor plan.

Each event contains its title, description, organizer, schedule, category, banner image, and duration.

When published, students immediately see the event marker on the interactive map. Selecting it opens the event details and provides directions to its location.

This removes the need for a standalone Events module.

Step 12 — Publish Campus

After all modifications have been completed, the administrator simply presses Publish.

The student application immediately updates to display the latest campus layout, buildings, floor plans, navigation paths, accessibility information, emergency routes, QR code destinations, event markers, and searchable locations.

No coding or redeployment is required whenever changes are made.