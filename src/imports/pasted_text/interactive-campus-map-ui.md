Update the Interactive Campus Map UI

Redesign the Interactive Campus Map to provide a modern navigation experience similar to Google Maps, Apple Maps, and the Ayala Malls Interactive Directory. The map should always remain the primary focus of the page, with controls floating above it instead of being permanently placed in a sidebar.

The interface should be clean, minimal, intuitive, responsive, and easy to use.

Floating Search Bar

Move the search bar from the right sidebar directly onto the map.

Position it in the top-left corner as a floating component with rounded corners, subtle shadows, and a modern glassmorphism effect.

The search bar should always remain visible while users interact with the map.

When the user clicks the search bar, display a custom-designed dropdown panel instead of the browser's default dropdown.

The dropdown should contain:

Recent Searches
Popular Destinations
Campus Buildings
Offices
Classrooms
Laboratories
Facilities

Each search result should display:

Building icon
Building name
Building code
Category
Floor number (if applicable)

Selecting a location should automatically center the map on that destination and open the Smart Information Panel.

Directions Mode

Place a floating Directions icon beside the search bar.

When clicked, smoothly transform the search bar into a larger floating navigation panel.

The navigation panel should contain:

A title labeled Directions
A searchable Departure field
A searchable Destination field
A Swap Locations button positioned between the two fields
Modern accessibility toggles below the destination fields

Accessibility options should include:

Wheelchair Accessible Route
Prefer Elevator
Avoid Stairs

These options should automatically influence the generated navigation route.

Both the Departure and Destination fields should use custom-designed dropdown panels instead of generic browser select components.

Smart Route Visualization

After the user selects both the departure and destination, the system should automatically calculate the best route.

Display the route directly on the map using an animated navigation path.

Instead of a static highlighted line, animate arrows moving along the route to clearly indicate the walking direction.

Display a compact navigation card showing:

Estimated Walking Time
Estimated Distance
Current Floor
Destination

The route should animate smoothly whenever the destination changes.

Multi-Floor Navigation

The system should support navigation across multiple floors.

When the calculated route requires changing floors, do not automatically switch maps.

Instead, guide the user step-by-step.

When the user reaches a staircase or elevator, display a floating circular button above that location.

Examples:

Continue to Floor 2
Go Down to Floor 1

Clicking the button should smoothly transition the map to the next floor while continuing the active navigation route.

The navigation animation should continue seamlessly after switching floors.

Staircase and Elevator Indicators

Use unique icons and colors to distinguish different vertical navigation points.

Suggested design:

Staircase Up — Blue circular marker with an upward staircase icon.
Staircase Down — Orange circular marker with a downward staircase icon.
Elevator Up — Green circular marker with an elevator icon and upward arrow.
Elevator Down — Purple circular marker with an elevator icon and downward arrow.
Two-Way Elevator — Dual-arrow elevator icon indicating travel in both directions.

Hovering or tapping one of these markers should display a tooltip such as:

Go to Floor 2
Return to Floor 1
Elevator to Floor 3

Selecting the marker should switch the map to the appropriate floor while keeping navigation active.

Floor Selector

Add a floating Floor Selector similar to the Ayala Malls interface.

Place it near the top-right corner of the map.

Instead of a standard dropdown, use a custom floating selector.

Example:

Floor 1 ▼

Expanding the selector should display:

Basement
Ground Floor
Floor 2
Floor 3
Floor 4

Changing floors should animate smoothly while preserving the user's map position.

If navigation is active, the route should continue automatically on the selected floor.

Floating Map Controls

Keep all map controls floating above the map instead of placing them in a sidebar.

Include:

Zoom In
Zoom Out
Current Location
Compass
Layer Selector
Fullscreen Toggle

These controls should remain fixed while the map moves underneath them.

Smart Information Panel

Replace the permanent building list with a contextual Smart Information Panel.

The panel should remain hidden until a building, event, or facility is selected.

When opened, display:

Building Photo
Building Name
Building Category
Description
Office Hours
Departments
Facilities
Accessibility Information
Emergency Information
Current Status

Action buttons should include:

Get Directions
Save Location (Students only)
Report Issue (Students only)
Share Location

Closing the panel should return the user's focus to the map.

Navigation Progress Card

When navigation is active, display a floating Navigation Progress Card.

The card should always show the user's current progress.

Display:

Destination Name
Estimated Walking Time
Estimated Distance
Current Floor
Current Step
Next Action

Example:

Destination:
Registrar Office

Walking Time:
3 minutes

Distance:
180 meters

Current Floor:
Floor 1

Next Action:
Walk straight for 20 meters.

Upcoming:
Use Staircase A to continue to Floor 2.

Include an End Navigation button.

When the user reaches a staircase or elevator, the Next Action should automatically update to instruct the user to tap the appropriate marker to continue to the next floor.