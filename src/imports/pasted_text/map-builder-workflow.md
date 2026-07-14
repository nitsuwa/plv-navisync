PLV NaviSync — Map Builder Workflow

The Map Builder should function like a project manager. Administrators should not directly start drawing on a blank canvas. Instead, they should first create a campus, then create buildings inside that campus, and finally create floor plans for each building.

This makes the system scalable because future campuses can easily be added without redesigning the application.

Step 1 — Create Campus

The first step is creating a campus.

The administrator clicks Create New Campus.

The setup wizard should ask for:

Basic Information
Campus Name
Campus Code
Description
Address
Latitude & Longitude (optional)
Campus Thumbnail
Cover Image
Map Size

Choose the working canvas size.

Examples:

Small Campus
Medium Campus
Large Campus
Custom Width
Custom Height

Display a live preview before continuing.

Campus Settings

Configure basic options.

Campus Status (Active / Hidden)
Default Zoom Level
Enable GPS
Enable Accessibility Features
Enable Emergency Features
Enable Event Layer

After pressing Create Campus, the administrator is taken to the Campus Editor.

Step 2 — Campus Editor

This is where the administrator designs the outdoor campus map.

The interface should resemble Canva.

Left Sidebar:

Buildings
Roads
Paths
Gates
Parking
Open Areas
Trees
Facilities
Accessibility
Emergency
Events
Custom Icons

Center:

Large editable map canvas.

Right Sidebar:

Properties panel for the selected object.

Top Toolbar:

Undo

Redo

Zoom

Save

Preview

Publish

Buildings

Adding a building should not immediately place a floor plan.

Instead, selecting Building should open a wizard.

Administrator enters:

Building Name
Building Code
Description
Category
Number of Floors
Building Photo
Office Hours
Contact Information

After saving, the building appears on the campus map.

Each building should now contain its own folder.

Example:

Main Campus

├── Main Academic Building
│      ├── Floor 1
│      ├── Floor 2
│      ├── Floor 3
│      ├── Floor 4
│
├── Engineering Building
│      ├── Floor 1
│      ├── Floor 2
│      ├── Floor 3
│
├── Library
│      ├── Ground Floor
│      ├── Second Floor

This hierarchy keeps everything organized.

Step 3 — Create Floor Plans

Clicking a building should display:

Engineering Laboratory Building

Floors

+ Add Floor

Ground Floor

Floor 2

Floor 3

Floor 4

Selecting Add Floor opens another setup wizard.

Administrator enters:

Floor Name
Floor Number
Floor Image or Blueprint
Scale
Floor Description

After saving, the Floor Editor opens.

Floor Editor

The Floor Editor should look almost identical to the Campus Editor.

This is important because administrators only need to learn one interface.

The only difference is that the canvas now represents the inside of a building.

The same tools should remain available.

Rooms

Administrator can place:

Classroom
Laboratory
Office
Faculty Room
Comfort Room
Elevator
Staircase
Exit
Hallway
Lobby
Waiting Area
Storage
Clinic
Pantry
Custom Room

Each room should have editable properties.

Examples:

Room Number

Department

Capacity

Description

Photo

Opening Hours

Accessibility

Paths

Administrator draws walking paths between rooms.

The navigation engine will later use these paths to generate routes.

Every path should automatically connect to nearby nodes to create a complete navigation graph.

Staircases

Instead of one staircase icon, administrators should create a Staircase Connection.

Properties:

Name

Connects Floor

Direction

Type

Example:

Staircase A

Current Floor:
Floor 2

Connect To:
Floor 3

Type:
Up

When the navigation reaches this staircase, the system knows exactly which floor to switch to.

Elevators

Elevators should also use linked connections rather than simple icons.

Properties:

Elevator Name

Floors Served

Accessible

Operating Hours (optional)

Capacity (optional)

Emergency Mode Enabled

Example:

Elevator A

Serves

Ground

Floor 2

Floor 3

Floor 4

Accessible

Yes

During navigation, users can select elevator-preferred routes if accessibility mode is enabled.

Accessibility Layer

Accessibility should be created as its own editable layer.

Administrators should place:

Wheelchair Ramps

Accessible Entrances

Accessible Toilets

Braille Signage

Elevators

Automatic Doors

Accessible Parking

These can be toggled on or off in the map.

Emergency Layer

Emergency objects should also have their own layer.

Examples:

Emergency Exits

Assembly Areas

Fire Extinguishers

Fire Alarms

First Aid Kits

Clinic

Security Office

Emergency Phones

AED Stations

Fire Hose Cabinets

Emergency Staircases

These should only appear when Emergency Mode is enabled or when the administrator chooses to display them.

Event Layer

Events should not be permanently placed on the map.

Administrators simply pin temporary event markers.

Each event contains:

Title

Description

Poster

Organizer

Start Date

End Date

Venue

Visibility

Expired events disappear automatically.

Navigation Connections

This is one of the most important features.

Every room, hallway, staircase, elevator, gate, entrance, and outdoor path should connect through invisible navigation nodes.

Think of it like Google Maps.

Administrators only draw the paths.

The system automatically generates the navigation graph.

This enables:

Shortest Path
Accessible Route
Elevator Route
Emergency Evacuation Route
Alternative Route

without manually programming every route.

Preview Mode

Before publishing, administrators should be able to enter Preview Mode.

Preview should simulate exactly what a student will experience.

Administrators should be able to:

Search for buildings
Search for rooms
Generate routes
Test accessibility routes
Test elevator navigation
Test emergency routes
Switch floors
Test QR navigation
Test event markers

without publishing changes.

Publish

Once everything has been tested, the administrator presses Publish.

The new campus map immediately becomes available to students.

Why this workflow is capstone-worthy

This structure makes PLV NaviSync much more than a campus map. It becomes a complete indoor and outdoor campus mapping platform that can support multiple campuses, multiple buildings, unlimited floor plans, accessibility, emergency preparedness, and intelligent navigation—all managed through a single, organized Map Builder. This is the kind of architecture that panelists usually appreciate because it demonstrates scalability, maintainability, and thoughtful system design rather than just a visually appealing interface.