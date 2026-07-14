PLV NaviSync Administrator System

The Administrator System is the control center of PLV NaviSync. Its primary purpose is not to manage university operations, but to create, maintain, validate, and publish the digital campus navigation system used by students, faculty, visitors, and staff. Every feature should directly support campus navigation, accessibility, and map accuracy.

1. Dashboard

The Dashboard serves as the administrator's homepage and provides a real-time overview of the navigation system instead of general university statistics. Rather than displaying unrelated information such as visitor counts or registered users, it presents information that reflects the health of the campus map.

Administrators can immediately see how many campus buildings have been mapped, how many floor plans exist, how many navigation routes are active, how many accessible routes have been created, how many campus assets have been added, and whether there are pending updates waiting to be published.

The dashboard also displays a recent activity timeline that records edits made to buildings, floor plans, routes, announcements, and campus assets. If multiple administrators are working together, everyone can see who made the latest changes.

Quick action buttons allow administrators to immediately begin common tasks such as opening the Map Builder, creating a new building, uploading a floor plan, testing navigation, reviewing student reports, or publishing the latest version of the campus map.

2. Campus Map Builder

The Campus Map Builder is the core feature of the entire administrator system. Nearly every administrative task begins here.

Administrators can design and edit the outdoor campus map using a visual drag-and-drop interface similar to professional design software. Instead of manually entering coordinates into tables, they interact directly with the map by placing and modifying objects.

The builder allows administrators to create campus buildings, pathways, walkways, roads, entrances, parking lots, gardens, waiting areas, landmarks, emergency stations, canteens, clinics, ATMs, security offices, water stations, and other points of interest.

Every object can be moved, resized, renamed, recolored, categorized, and assigned custom properties through a properties panel.

The builder also supports multiple editing tools such as selection, panning, zooming, marker placement, polygon drawing, pathway creation, deletion, undo, redo, snapping, alignment guides, and layer management.

Before publishing, administrators can preview exactly how students will see the map.

3. Building and Floor Plan Editor

Instead of maintaining a simple list of buildings, each building becomes an editable navigation project.

When administrators select a building, they can create and manage all of its floors individually. Every floor has its own interactive editor that uses the same interface as the outdoor map builder to maintain consistency.

Within each floor, administrators can draw classrooms, laboratories, offices, hallways, restrooms, elevators, stairs, ramps, emergency exits, faculty rooms, storage rooms, and other indoor locations.

Each room can be assigned information such as its room number, department, accessibility features, description, and searchable keywords so students can easily locate it.

Administrators can also define connections between floors by linking staircases and elevators to ensure indoor navigation functions correctly.

4. Navigation and Pathfinding Manager

This module allows administrators to create and maintain the campus navigation network.

Instead of manually typing routes, administrators visually connect pathways, hallways, entrances, and rooms to build the navigation graph used by the pathfinding algorithm.

Each path can have different properties such as walking-only, wheelchair accessible, emergency-only, temporarily closed, or maintenance restricted.

Administrators can also define path costs, estimated walking times, one-way routes, and preferred accessible paths to improve navigation accuracy.

Whenever campus layouts change, administrators can update the network so students always receive the most efficient route.

5. Accessibility Management

Accessibility is a major component of PLV NaviSync and deserves its own management module.

Administrators can identify which routes, entrances, elevators, ramps, and facilities are wheelchair accessible.

They can indicate whether elevators are operational, whether ramps meet accessibility standards, whether accessible restrooms are available, and whether certain pathways should be avoided by wheelchair users.

The system automatically uses this information to generate accessible routes whenever students enable Accessibility Mode.

6. Campus Assets Management

Rather than simply storing buildings, this module manages every navigable object within the campus.

Administrators can add and edit campus facilities such as ATMs, canteens, clinics, libraries, laboratories, water stations, parking areas, waiting sheds, security offices, comfort rooms, study areas, bicycle parking, charging stations, emergency phones, and other landmarks.

Each asset contains its own name, description, category, operating hours, searchable keywords, location, icon, and accessibility information.

These assets automatically become searchable destinations within the student application.

7. Dynamic Event Map Management

One of the unique features of PLV NaviSync is its ability to temporarily change the campus map during special events.

Administrators can create event-specific versions of the map without modifying the original campus layout.

For example, during Foundation Day, administrators can add temporary entrances, food booths, registration tents, first aid stations, temporary restrooms, stage locations, restricted areas, and event pathways.

Students automatically receive event-specific navigation while the event is active.

Once the event ends, the system automatically returns to the standard campus map.

This makes the navigation system flexible enough to accommodate changing campus environments.

8. Campus Notices and Emergency Alerts

Administrators can create announcements that appear within the student application.

Unlike traditional announcement systems, notices can be connected directly to locations on the map.

For example, if a building is temporarily closed for maintenance, the announcement automatically highlights the affected building and reroutes students around it.

Emergency alerts such as class suspensions, fire drills, or road closures can immediately affect navigation recommendations.

This creates an intelligent connection between campus information and navigation.

9. Student Reports Management ⭐

This is one of the most valuable modules because it keeps the navigation system accurate over time.

Students can report incorrect information they encounter while using the application.

Examples include missing classrooms, incorrect room names, blocked walkways, broken elevators, inaccessible ramps, outdated building information, incorrect navigation routes, damaged facilities, missing markers, or temporary campus changes.

Every report is submitted to the administrator review system.

Administrators can view each report along with its location, description, attached image (if provided), date submitted, and reporting status.

Reports move through a workflow such as Pending Review, Under Investigation, Approved, Rejected, or Resolved.

Administrators can directly open the affected map location from the report, make the necessary corrections using the Map Builder, and mark the issue as resolved.

This feature transforms students into contributors who help maintain an accurate navigation system and demonstrates a practical feedback loop in your capstone.

10. Navigation Testing and Validation

Before publishing map updates, administrators can verify that the navigation system works correctly.

The testing module allows administrators to simulate navigation between any two locations.

The system displays the generated route, estimated travel time, total distance, and accessibility information exactly as students would see it.

Automatic validation also checks for disconnected pathways, unreachable buildings, broken floor connections, duplicate markers, missing entrances, and invalid navigation nodes.

This ensures the published map is complete and functional.

11. Publishing and Version Control

All modifications are first saved as drafts.

Administrators can freely edit maps without affecting the live student application.

Once changes have been reviewed, administrators publish the latest version of the campus map.

The system stores previous versions so administrators can compare changes, restore older maps, or roll back updates if problems are discovered.

This protects the integrity of the navigation system while supporting continuous improvements.

12. User and Role Management

Although this module is smaller than the others, it controls who can access the administrator system.

Rather than supporting many unnecessary university roles, the system focuses on navigation management.

Different permission levels may include System Administrator, who has full control over the platform; Map Editor, who can create and edit maps and routes; and Content Editor, who manages announcements, events, and campus information.

This simplifies administration while maintaining proper access control.

Overall Vision

When viewed as a whole, the administrator system should feel less like a generic school management dashboard and more like a GIS (Geographic Information System) combined with a campus digital twin. Its central responsibility is to ensure that every building, floor plan, route, facility, and point of interest is accurately represented and continuously maintained. Features such as dynamic event maps, accessibility management, route testing, version control, and especially student-submitted map reports demonstrate that the system is not static—it evolves with the campus. This focus aligns directly with your capstone's objective of providing an intelligent, reliable, and maintainable smart campus navigation platform rather than simply storing campus information.