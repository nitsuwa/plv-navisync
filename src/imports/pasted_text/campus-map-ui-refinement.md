I actually think you're **very close**. The issue isn't that the design is bad—it's that **too many panels are competing for attention at the same time**. Right now the user doesn't know where to look first because there are three large floating panels, a right sidebar, a top toolbar, and the map itself all visible simultaneously.

If I were designing this as a production application, I'd simplify it considerably while keeping all the functionality.

Here's a message you can send directly to Figma Make:

---

# Refine the Interactive Campus Map UI

The current map interface feels visually crowded because too many panels and controls are displayed simultaneously. Please redesign the interface with a stronger visual hierarchy so the map remains the primary focus at all times.

The goal is to make the application feel closer to Google Maps, Apple Maps, or the Ayala Malls Interactive Directory, where tools appear only when needed instead of always occupying screen space.

---

## Reduce Visual Clutter

Do not display every floating panel simultaneously.

Only show interface elements when they are relevant to the user's current task.

For example:

* When no navigation is active, the Navigation Progress Card should remain hidden.
* The Directions Panel should only appear after the user clicks the Directions button.
* The Smart Information Panel should only appear after selecting a building, room, event, or facility.
* Only one major panel should be open at a time whenever possible.

The interactive map should always occupy most of the user's attention.

---

## Make Every Map Consistent

Treat every map in the system exactly the same.

This includes:

* PLV Main Campus Map
* Individual Building Maps
* Floor Plans
* Indoor Navigation Maps

Do not create different layouts for different map types.

The floor plans should behave exactly like the main campus map.

They should all contain:

* Floating Search Bar
* Directions Button
* Accessibility Toggle
* SOS Toggle
* Layer Controls
* Current Location Button
* Zoom Controls
* Floor Selector
* Smart Information Panel
* Navigation Mode

Switching from the campus map to a building floor should feel like moving into another map rather than opening a completely different page.

---

## Preserve Navigation Controls

When entering a building or changing floors, do not remove important controls.

The following controls should always remain available regardless of whether the user is viewing the campus or an indoor floor plan:

* Search
* Directions
* Standard Route
* Accessible Route
* SOS Mode
* Zoom Controls
* Current Location
* Layer Controls
* Floor Selector

The experience should feel continuous across every map.

---

## Improve the Search Experience

The floating search bar should always remain visible.

Searching from any map should work exactly the same.

Users should be able to search:

* Buildings
* Rooms
* Offices
* Laboratories
* Facilities
* Restrooms
* Elevators
* Staircases
* Emergency Exits

Search results should automatically switch to the correct campus, building, and floor before highlighting the selected destination.

---

## Simplify the Directions Panel

The Directions panel currently occupies too much space.

Reduce its size and only show the essential controls:

* Departure
* Destination
* Swap Button
* Accessibility Options

After a route is generated, automatically collapse the panel into a compact navigation summary.

The full panel should only reopen if the user edits the route.

---

## Redesign the Navigation Progress Card

The current Navigation Card feels too large.

Replace it with a compact floating card.

Example information:

Destination:
Administration Building

Distance:
219 meters

Walking Time:
3 minutes

Next Action:
Walk straight for 20 meters.

Upcoming:
Use Staircase A to reach Floor 2.

Only expand the card when additional details are needed.

---

## Improve Vertical Navigation (Stairs & Elevators)

Vertical navigation between floors should be much clearer.

Instead of using simple icons, create dedicated navigation markers.

Recommended marker styles:

* Staircase Up — Blue circular marker with an upward staircase icon.
* Staircase Down — Orange circular marker with a downward staircase icon.
* Elevator Up — Green circular marker with an elevator icon and upward arrow.
* Elevator Down — Purple circular marker with an elevator icon and downward arrow.
* Two-Way Elevator — Dual-arrow elevator marker indicating both upward and downward travel.

When navigation reaches one of these markers, display a floating prompt above it.

Examples:

Continue to Floor 2

Go Down to Floor 1

Take Elevator to Floor 3

The user should tap the marker to continue navigation instead of automatically switching floors.

This creates a more intuitive indoor navigation experience.

---

## Improve the Floor Selector

The floor selector should remain visible on every indoor map.

It should always stay in the same location on the screen regardless of which building is being viewed.

Switching floors should animate smoothly while preserving the user's zoom level and map position.

If navigation is active, the route should continue seamlessly after changing floors.

---

## Smart Information Panel

Simplify the right-side information panel.

Instead of displaying every piece of information at once, organize the content into tabs.

Suggested tabs:

* Overview
* Departments
* Facilities
* Accessibility
* Route

Only load the information for the selected tab.

This keeps the interface cleaner and easier to scan.

---

## Keep the Map as the Main Focus

The map should always be the centerpiece of the interface.

Every floating component should feel lightweight and temporary.

Avoid opening multiple large panels at once.

Users should always feel like they are interacting with the map rather than navigating through separate pages.

---

## Overall Design Goal

The interface should feel clean, spacious, modern, and intuitive.

Reduce visual clutter by using contextual panels, compact navigation cards, and consistent controls across every map. The PLV Main Campus map and all building floor plans should share the same interface and behavior so users never have to learn a different layout when navigating indoors. This creates a seamless navigation experience similar to professional mapping applications while remaining simple enough for first-time users.
