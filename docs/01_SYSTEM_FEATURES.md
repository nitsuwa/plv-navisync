# 6. Core System Modules

The project consists of the following modules.

## Core Modules (Must Be Fully Implemented)

### Module 1
Authentication and User Management

Purpose:
Provides secure access control and role-based permissions for all users.

Priority:
Critical

---

### Module 2
Interactive Campus Navigation

Purpose:
Allows users to explore the campus and navigate between locations.

Priority:
Critical

---

### Module 3
Smart Search

Purpose:
Allows users to instantly locate any mapped destination.

Priority:
Critical

---

### Module 4
Visual Campus Map Builder

Purpose:
Allows administrators to create and maintain the digital campus through a visual editor.

Priority:
Critical

---

## Operational Modules (Required)

### Module 5
Campus Events and Announcements

Purpose:
Displays campus events, announcements, and temporary campus changes on the map.

Priority:
High

---

### Module 6
Campus Issue Reporting

Purpose:
Allows authenticated students to report mapped campus issues and administrators to manage them.

Priority:
High

---

### Module 7
Admin Dashboard and Analytics

Purpose:
Provides administrators with operational summaries, recent activity, and system health information.

Priority:
High

---

### Module 8
Map Validation and Publishing

Purpose:
Validates campus data, protects drafts, and publishes safe map versions.

Priority:
High

---

### Module 9
System Configuration and Settings

Purpose:
Provides approved campus branding, account, application, and export settings.

Priority:
High

---

## Enhancement Modules

These improve usability but are not essential to the primary objectives.

- Favorites
- Recent Destinations
- QR Location Sharing
- Dark Mode
- Remember Last Viewed Building
- Progressive Web App Installation

Priority:
Medium

---

# 7. System-Wide Functional Requirements

Every implemented feature must satisfy the following requirements.

- Responsive on desktop, tablet, and mobile devices.
- Support modern Chromium-based browsers.
- Provide clear loading states.
- Provide informative empty states.
- Display meaningful error messages.
- Validate user input before submission.
- Prevent invalid operations whenever possible.
- Follow role-based access restrictions.
- Maintain consistent UI components.
- Preserve data integrity.
- Support future database scalability.

---

# 8. ISO/IEC 25010 Quality Objectives

All modules shall contribute to the following quality characteristics:

- Functional Suitability
- Performance Efficiency
- Compatibility
- Interaction Capability
- Reliability
- Security
- Maintainability
- Flexibility
- Safety

Every feature specification in this document will indicate which ISO quality characteristics it supports.

---

# END OF PART 1


# ============================================================================
# MODULE 1 - AUTHENTICATION & USER MANAGEMENT
# ============================================================================

## Purpose

This module provides secure authentication and role-based authorization for all users of PLV NaviSync. It ensures that only authorized users can access administrative functions while allowing guests to browse public navigation features.

---

## Business Value

This module protects campus data from unauthorized access and ensures accountability for all administrative actions. It also provides a personalized experience based on user roles.

---

## Users

### Guest

Can:

- Browse campus map
- Search locations
- Navigate campus
- View events
- View announcements

Cannot:

- Submit reports
- Access dashboard
- Access administration features

---

### Student

Can:

- Login
- Logout
- Browse campus
- Search locations
- Navigate campus
- Submit issue reports
- View announcements
- View events

Cannot:

- Modify campus data
- Publish maps
- Access administration pages

---

### Administrator

Has unrestricted access to every administration module.

Administrators can:

- Manage campus
- Manage buildings
- Manage floors
- Manage facilities
- Manage routes
- Manage events
- Manage announcements
- Review reports
- Publish map changes
- Manage users
- Configure system settings

---

# Screens

Public

- Login Page

Administration

- User Management
- User Profile
- Change Password
- Account Settings

---

# Features

## Login

Users authenticate using their registered account.

Supported authentication:

- Email
- Password

Future enhancements such as Single Sign-On (SSO) are outside the scope of this capstone.

---

## Logout

Users can securely terminate their session.

The system shall:

- Clear authentication tokens
- Redirect users appropriately
- Prevent unauthorized access after logout

---

## Session Persistence

Authenticated users remain logged in until:

- Logout
- Session expiration
- Manual invalidation

Refreshing the browser should not log users out unnecessarily.

---

## Role-Based Access Control (RBAC)

The system shall restrict access according to user roles.

Guests cannot access protected routes.

Students cannot access administration pages.

Administrators have full permissions.

Unauthorized access attempts shall redirect to the appropriate page.

---

## User Profile

Authenticated users can view:

- Name
- Email
- Role
- Profile picture (optional enhancement)

Administrators may edit user information.

Students may only edit their own profile where permitted.

---

## User Management

Administrator only.

Features include:

- Create user
- Update user
- Disable user
- Enable user
- Reset password
- Assign role
- Search users
- Filter users

Deleting users permanently is discouraged to preserve audit history.

Soft deletion or deactivation is preferred.

---

# Workflow

Guest opens system

↓

Select Login

↓

Enter credentials

↓

System validates credentials

↓

Authentication successful

↓

Role determined

↓

Redirect to appropriate interface

↓

Session created

↓

Access granted

---

# Functional Requirements

FR-1

The system shall authenticate registered users.

FR-2

The system shall maintain authenticated sessions.

FR-3

The system shall implement role-based authorization.

FR-4

The system shall prevent unauthorized access.

FR-5

Administrators shall manage user accounts.

FR-6

Passwords shall never be stored in plain text.

FR-7

Only authenticated administrators may access administration modules.

---

# Validation Rules

Email

- Required
- Valid email format

Password

- Required
- Minimum length determined by Supabase Authentication

Role

Must be one of:

- Administrator
- Student

Duplicate email addresses are not allowed.

---

# Dependencies

Supabase Authentication

User Database

Role Management

Administration Dashboard

---

# Database Tables

users

profiles

roles

audit_logs

---

# Definition of Done

This module is considered complete when:

✅ Login works

✅ Logout works

✅ Session persists

✅ Unauthorized users cannot access protected pages

✅ Role-based access functions correctly

✅ User management performs CRUD operations

✅ Validation messages display correctly

✅ Responsive on desktop and mobile

✅ Connected to Supabase Authentication

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional completeness

✔ Functional correctness

✔ Functional appropriateness

Security

✔ Confidentiality

✔ Accountability

✔ Authenticity

✔ Integrity

Interaction Capability

✔ Operability

✔ User Error Protection

Reliability

✔ Availability

✔ Faultlessness

Maintainability

✔ Modularity

✔ Testability

✔ Modifiability

# ============================================================================
# MODULE 2 – INTERACTIVE CAMPUS NAVIGATION
# ============================================================================

## Purpose

The Interactive Campus Navigation module is the primary feature of PLV NaviSync. It enables students, faculty, staff, and visitors to easily locate destinations and navigate throughout the campus using an interactive digital map.

This module transforms the traditional printed campus map into a dynamic navigation system capable of displaying buildings, rooms, facilities, routes, accessibility paths, emergency exits, and navigation instructions.

---

# Business Value

This module reduces confusion when locating buildings, classrooms, laboratories, offices, and campus facilities.

It improves campus accessibility, minimizes time spent searching for destinations, and provides a modern digital navigation experience for students and visitors.

---

# Users

Guest

Student

Administrator

All users may use navigation features.

Only administrators may edit navigation data.

---

# Screens

Public

• Campus Map

• Navigation Panel

• Route Details

• Building Information

• Location Information

• Search Results

• Floor Selector

---

# Features

## Interactive Campus Map

The system shall display an interactive campus map.

Users can:

• Zoom

• Pan

• Reset View

• Select buildings

• View landmarks

• View pathways

• Switch floors

The map shall remain responsive on desktop and mobile devices.

---

## Building Navigation

Selecting a building shall display:

• Building Name

• Building Description

• Number of Floors

• Available Facilities

• Building Photo (optional)

• Available Offices

• Accessibility Information

Users may begin navigation directly from the building information panel.

---

## Floor Navigation

Buildings with multiple floors shall support floor switching.

Users may:

• Change floors

• View rooms

• View facilities

• View navigation paths

Changing floors shall immediately update the displayed map.

---

## Location Information

Every mapped location shall contain navigation-related information.

Examples:

• Classroom

• Laboratory

• Office

• Restroom

• Elevator

• Staircase

• Exit

• Entrance

• Parking Area

• Clinic

• Library

Each location shall contain:

• Name

• Category

• Building

• Floor

• Description

• Accessibility Information

• Coordinates

---

## Route Generation

Users shall select:

Current Location

Destination

The system shall calculate the shortest available route.

The calculated route shall display:

• Highlighted path

• Total distance

• Estimated walking time

• Number of floor transitions

• Accessibility status

---

## Estimated Walking Time

Walking time shall be calculated using total route distance.

The system shall automatically estimate travel duration.

Example

Distance

210 meters

Estimated Time

3 minutes

This calculation does not require GPS.

---

## Step-by-Step Navigation

After route generation the system shall generate readable navigation instructions.

Example

Start at Main Entrance.

↓

Walk straight for approximately 25 meters.

↓

Turn left.

↓

Continue through the hallway.

↓

Take the staircase to the Second Floor.

↓

Turn right.

↓

Room 204 will be on your left.

Instructions shall automatically update whenever a different route is selected.

---

## Route Visualization

The calculated route shall be highlighted on the map.

The visualization shall include:

• Starting Point

• Destination

• Navigation Path

• Floor Transition Indicators

• Accessibility Indicators

The highlighted route shall remain visible until cancelled.

---

## Accessibility Navigation

Users may enable Accessibility Mode.

Accessibility Mode prioritizes:

• Elevators

• Ramps

• Accessible Entrances

Accessibility Mode avoids:

• Staircases

• Restricted Areas

The system shall automatically calculate the safest accessible route.

---

## Emergency Navigation

Emergency Mode shall display the safest evacuation route.

Supported emergencies:

• Fire

• Earthquake

The system shall display:

Nearest Exit

Assembly Area

Evacuation Route

Emergency routes are maintained by administrators.

---

## Route Cancellation

Users may cancel navigation at any time.

Cancelling navigation shall:

• Remove highlighted route

• Clear instructions

• Reset navigation panel

---

# Workflow

User opens campus map

↓

Searches destination

↓

Selects destination

↓

System highlights destination

↓

User selects Navigate

↓

System calculates shortest route

↓

Route displayed

↓

Distance displayed

↓

Estimated walking time displayed

↓

Step-by-step directions displayed

↓

User reaches destination

---

# Functional Requirements

FR-8

The system shall display an interactive campus map.

FR-9

The system shall allow building selection.

FR-10

The system shall support floor switching.

FR-11

The system shall calculate the shortest navigation path.

FR-12

The system shall estimate walking time.

FR-13

The system shall display step-by-step navigation instructions.

FR-14

The system shall support accessibility-aware routing.

FR-15

The system shall support emergency evacuation routing.

FR-16

The system shall display route visualization.

---

# Validation Rules

A route cannot be generated unless:

• Current Location exists

• Destination exists

• Valid navigation graph exists

If no valid route exists:

Display

"No available route found."

The system shall never crash due to disconnected navigation nodes.

---

# Dependencies

Campus Map

Map Builder

Navigation Graph

Buildings

Floors

Search Module

Accessibility Data

Emergency Routes

---

# Database Tables

buildings

floors

rooms

facilities

navigation_nodes

navigation_edges

routes

accessibility_routes

emergency_routes

---

# Definition of Done

This module is complete when:

✅ Campus map renders correctly

✅ Buildings are selectable

✅ Floor switching works

✅ Route generation functions correctly

✅ Estimated distance is accurate

✅ Estimated walking time is displayed

✅ Step-by-step instructions are generated

✅ Accessibility routing functions correctly

✅ Emergency routing functions correctly

✅ Route visualization updates correctly

✅ Mobile interaction is smooth

✅ Desktop interaction is smooth

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Correctness

✔ Functional Appropriateness

Performance Efficiency

✔ Time Behaviour

✔ Resource Utilization

Interaction Capability

✔ Learnability

✔ Operability

✔ User Engagement

✔ Inclusivity

Reliability

✔ Availability

✔ Faultlessness

Safety

✔ Risk Identification

✔ Hazard Warning

✔ Operational Constraint

✔ Fail Safe

Maintainability

✔ Modularity

✔ Testability

✔ Modifiability

# ============================================================================
# MODULE 3 – SMART SEARCH & CAMPUS DIRECTORY
# ============================================================================

## Purpose

The Smart Search & Campus Directory module enables users to quickly locate any mapped destination within the campus and view detailed navigation-related information about that location.

This module acts as the primary entry point into the navigation system. Rather than manually exploring the map, users can search for a destination and immediately begin navigation.

---

# Business Value

Searching is the fastest way for users to find unfamiliar locations.

This module reduces confusion, improves navigation efficiency, and provides relevant information about every mapped location before the user starts navigating.

---

# Users

Guest

Student

Administrator

All users can access this module.

---

# Screens

Public

• Search Panel

• Search Results

• Location Information

• Building Information

• Room Information

• Facility Information

---

# Features

## Universal Search

The search system shall allow users to search every mapped destination.

Supported searchable items include:

• Buildings

• Floors

• Rooms

• Offices

• Laboratories

• Classrooms

• Restrooms

• Elevators

• Staircases

• Clinics

• Libraries

• Parking Areas

• Facilities

• Landmarks

• Event Venues

The search bar shall remain accessible from the navigation interface.

---

## Search Suggestions

As users type, the system shall display suggested matches.

Suggestions shall be based on:

• Building names

• Room numbers

• Facility names

• Office names

Suggestions shall update dynamically.

---

## Search Results

Selecting a result shall immediately:

• Highlight the destination

• Center the map

• Open the information panel

• Display the Navigate button

Multiple matching results shall be displayed when necessary.

---

## Campus Directory

Every mapped destination shall have an information page.

Depending on the destination type, information may include:

• Name

• Category

• Description

• Building

• Floor

• Room Number

• Office Hours (optional)

• Contact Information (optional)

• Accessibility Information

• Associated Image (optional)

Only navigation-related information shall be stored.

The system shall not function as a university information portal.

---

## Building Directory

Building pages may contain:

• Building Name

• Description

• Number of Floors

• Facilities

• Building Image

• Building Entrances

• Accessibility Features

• Navigate Button

---

## Room Directory

Room pages may contain:

• Room Name

• Room Number

• Building

• Floor

• Category

• Description

• Navigate Button

---

## Facility Directory

Facilities such as:

• Comfort Rooms

• Elevators

• Staircases

• Clinics

• Libraries

• Parking

shall display their location and allow navigation.

---

## Quick Navigation

Every search result shall provide a Navigate button.

Selecting Navigate immediately transfers the destination into the Navigation Module.

---

## Search Filtering

Users may filter search results by category.

Supported filters:

• Buildings

• Rooms

• Offices

• Facilities

• Events

• Landmarks

---

## Empty Search Handling

If no results exist:

Display

"No matching locations were found."

The system shall never produce blank pages.

---

# Workflow

User opens search

↓

Types keyword

↓

Suggestions appear

↓

User selects destination

↓

Map centers on location

↓

Location information opens

↓

User selects Navigate

↓

Navigation module calculates route

---

# Functional Requirements

FR-17

The system shall provide a universal search.

FR-18

The system shall display search suggestions.

FR-19

The system shall display detailed location information.

FR-20

The system shall allow direct navigation from search results.

FR-21

The system shall support category filtering.

FR-22

The system shall gracefully handle empty search results.

---

# Validation Rules

Search input may be empty.

Empty searches shall display recent or popular locations (optional enhancement).

Search shall ignore capitalization.

Partial matches shall be supported.

Duplicate search results shall not appear.

---

# Dependencies

Campus Navigation

Buildings

Rooms

Facilities

Events

Campus Map

---

# Database Tables

buildings

floors

rooms

facilities

events

directory_categories

---

# Definition of Done

This module is complete when:

✅ Buildings are searchable

✅ Rooms are searchable

✅ Offices are searchable

✅ Facilities are searchable

✅ Events are searchable

✅ Suggestions function correctly

✅ Search filters work

✅ Selecting a result centers the map

✅ Information panels display correctly

✅ Navigation launches from search

✅ Responsive on desktop and mobile

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Appropriateness

Interaction Capability

✔ Learnability

✔ Operability

✔ Self-Descriptiveness

✔ User Assistance

Performance Efficiency

✔ Time Behaviour

Reliability

✔ Availability

Maintainability

✔ Modularity

✔ Testability

# ============================================================================
# MODULE 4 – VISUAL CAMPUS MAP BUILDER
# ============================================================================

## Purpose

The Visual Campus Map Builder is the core administration module of PLV NaviSync. It enables administrators to create, edit, organize, validate, and publish the entire digital campus without modifying the application's source code.

The editor follows a simple "Canva-like" approach rather than a technical CAD application. Administrators interact with a visual floor plan by placing rooms, facilities, pathways, and navigation points using drag-and-drop tools.

---

# Business Value

Without this module, every campus change would require a software developer.

With this module, campus administrators can independently maintain the digital map whenever classrooms, offices, facilities, or pathways change.

This greatly improves the long-term sustainability of the system.

---

# Users

Administrator only.

---

# Screens

• Campus Management

• Building Management

• Floor Management

• Map Builder

• Navigation Graph Editor

• Accessibility Editor

• Emergency Route Editor

• Publish Manager

---

# Feature 1 – Campus Management

This section manages the overall campus structure.

Administrators can:

- Create a campus (default: PLV Main Campus)
- Edit campus information
- Upload campus logo
- Upload campus overview image (optional)
- Configure default map settings

Only one active campus is supported in this capstone.

---

# Feature 2 – Building Management

Administrators can manage all campus buildings.

Supported operations:

- Create building
- Edit building
- Archive building
- Restore archived building

Each building contains:

- Name
- Code
- Description
- Number of Floors
- Thumbnail Image
- Status (Active / Hidden)

Buildings should never be permanently deleted if they contain map data.

---

# Feature 3 – Floor Management

Each building may contain multiple floors.

Administrators can:

- Add floor
- Edit floor
- Reorder floors
- Archive floor

Each floor stores:

- Floor Name
- Floor Number
- Floor Plan Image
- Scale (optional)
- Status

Uploading a new floor plan shall not delete existing map objects unless confirmed.

---

# Feature 4 – Floor Plan Import

Administrators upload a floor plan image.

Supported formats:

- PNG
- JPG
- JPEG
- WEBP

The uploaded image becomes the editable background of the visual editor.

The original image shall remain unchanged.

---

# Feature 5 – Visual Map Editor

This is the primary editing workspace.

The editor shall support:

- Pan
- Zoom
- Grid display
- Snap to grid (optional)
- Drag-and-drop placement
- Object selection
- Multi-selection
- Duplicate
- Delete
- Move
- Resize

The editor shall remain responsive even with many objects.

---

# Feature 6 – Map Objects

Administrators can place map objects onto the floor plan.

Supported object types include:

- Classroom
- Laboratory
- Office
- Hallway
- Restroom
- Elevator
- Staircase
- Entrance
- Exit
- Clinic
- Library
- Parking Area
- Cafeteria
- Landmark
- Custom Facility

Each object stores:

- Name
- Category
- Coordinates
- Width
- Height
- Floor
- Building
- Description
- Visibility

---

# Feature 7 – Object Properties Panel

Selecting an object opens its properties.

Administrators can edit:

- Name
- Description
- Category
- Coordinates
- Accessibility
- Visibility
- Search Keywords

Changes are reflected immediately in the editor.

---

# Feature 8 – Navigation Graph Editor

Navigation routes are created by connecting navigation nodes.

Administrators can:

- Place navigation nodes
- Move nodes
- Delete nodes
- Connect nodes
- Disconnect nodes

Each connection stores:

- Distance
- Route Type
- Accessibility

The graph is used by the navigation algorithm.

---

# Feature 9 – Accessibility Editor

Administrators can classify map elements for accessibility.

Examples:

- Wheelchair Accessible
- Ramp
- Elevator
- Stairs
- Restricted Area

Accessibility routing uses this data when calculating routes.

---

# Feature 10 – Emergency Route Editor

Administrators define evacuation information.

Supported items:

- Emergency Exit
- Assembly Area
- Fire Exit
- Safe Zone

Emergency routes are separate from normal navigation routes.

---

# Feature 11 – Draft and Published Versions

Map edits are not immediately visible to users.

Administrators work in Draft Mode.

Publishing makes all validated changes visible to users.

This prevents incomplete edits from appearing in production.

---

# Feature 12 – Validation

Before publishing, the system validates the map.

Validation checks include:

- Missing building names
- Missing floor plans
- Duplicate room names
- Orphan navigation nodes
- Disconnected routes
- Missing destinations
- Invalid accessibility links

The system displays validation errors before allowing publication.

---

# Feature 13 – Publish Manager

Administrators may:

- Save Draft
- Publish Changes
- Cancel Changes

Publishing updates the student-facing map.

---

# Functional Requirements

FR-23

The system shall manage campus buildings.

FR-24

The system shall manage building floors.

FR-25

The system shall import floor plans.

FR-26

The system shall provide a visual drag-and-drop editor.

FR-27

The system shall manage map objects.

FR-28

The system shall manage navigation nodes and edges.

FR-29

The system shall validate map integrity.

FR-30

The system shall support draft and published versions.

FR-31

The system shall publish validated maps.

---

# Validation Rules

A floor cannot be published without:

- A floor plan
- At least one navigable object
- A valid navigation graph

Duplicate room names within the same floor are not allowed.

Disconnected navigation graphs shall generate validation errors.

---

# Dependencies

Authentication

Buildings

Floors

Navigation Module

Search Module

Database

Supabase Storage

---

# Database Tables

campuses

buildings

floors

map_objects

navigation_nodes

navigation_edges

accessibility_data

emergency_routes

draft_versions

published_versions

---

# Definition of Done

This module is complete when:

✅ Buildings can be managed

✅ Floors can be managed

✅ Floor plans upload correctly

✅ Map objects can be added, edited, moved, resized, and deleted

✅ Navigation graph can be created

✅ Accessibility data can be configured

✅ Emergency routes can be configured

✅ Validation detects common errors

✅ Draft and Publish workflow functions correctly

✅ Published changes appear on the student map

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Correctness

✔ Functional Appropriateness

Interaction Capability

✔ Operability

✔ Learnability

✔ User Error Protection

Reliability

✔ Faultlessness

✔ Recoverability

Maintainability

✔ Modularity

✔ Modifiability

✔ Testability

Flexibility

✔ Adaptability

✔ Scalability

Safety

✔ Risk Identification

✔ Safe Integration

# ============================================================================
# MODULE 5 – CAMPUS EVENTS & ANNOUNCEMENTS
# ============================================================================

## Purpose

The Campus Events & Announcements module allows administrators to publish campus events, temporary notices, and location-based announcements that may affect campus navigation.

The module ensures that students and visitors are informed about ongoing activities, temporary facility changes, and special events directly from the campus map.

---

# Business Value

Campus events often change the normal use of buildings, rooms, and walkways.

This module keeps users informed of these temporary changes while allowing administrators to guide users toward event venues and alternative routes when necessary.

---

# Users

Guest

Student

Administrator

All users can view published events and announcements.

Only administrators can create, edit, publish, or archive them.

---

# Screens

• Events List

• Event Details

• Announcement List

• Announcement Details

• Event Management

• Announcement Management

---

# Feature 1 – Event Management

Administrators can:

- Create event
- Edit event
- Archive event
- Publish event

Each event includes:

- Title
- Description
- Category
- Start Date
- End Date
- Start Time
- End Time
- Location
- Cover Image (optional)
- Status (Draft / Published / Archived)

---

# Feature 2 – Event Location Mapping

Events may be linked to one or more mapped locations.

Examples:

- Main Stage
- Enrollment Area
- Research Fair Booth
- Gymnasium
- Student Plaza

Linked locations shall automatically display event indicators on the campus map.

---

# Feature 3 – Event Navigation

Users viewing an event may immediately start navigation to its location.

The system shall redirect the selected destination to the Navigation Module.

---

# Feature 4 – Announcements

Administrators may publish announcements related to campus navigation.

Examples include:

- Building temporarily closed
- Room relocated
- Elevator under maintenance
- Hallway inaccessible
- Water interruption
- Scheduled maintenance

Announcements should primarily communicate information that affects navigation or campus movement.

---

# Feature 5 – Temporary Route Notices

Announcements may optionally affect navigation.

Examples:

- Hallway Closed
- Staircase Closed
- Entrance Unavailable
- Temporary Exit

Affected routes shall display warning indicators on the map.

---

# Feature 6 – Event Filtering

Users may filter events by:

- Date
- Category
- Building

Only currently active events shall appear by default.

---

# Feature 7 – Automatic Event Status

The system shall automatically determine event status.

Possible statuses:

- Upcoming
- Ongoing
- Finished

Finished events shall no longer appear as active unless manually republished.

---

# Functional Requirements

FR-32

The system shall manage campus events.

FR-33

The system shall manage campus announcements.

FR-34

The system shall associate events with mapped locations.

FR-35

The system shall allow direct navigation to event venues.

FR-36

The system shall display navigation-related announcements.

FR-37

The system shall automatically determine event status.

---

# Validation Rules

Event title is required.

Start date must not occur after end date.

Mapped locations must exist before they can be assigned to an event.

Announcements affecting navigation must reference an existing mapped location.

---

# Dependencies

Campus Navigation

Smart Search

Buildings

Map Builder

Authentication

---

# Database Tables

events

event_locations

announcements

announcement_locations

---

# Definition of Done

This module is complete when:

✅ Events support full CRUD operations

✅ Announcements support full CRUD operations

✅ Events appear on the map

✅ Event locations launch navigation

✅ Navigation-related announcements display correctly

✅ Event status updates automatically

✅ Responsive on desktop and mobile

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Correctness

✔ Functional Appropriateness

Interaction Capability

✔ Operability

✔ User Engagement

✔ Self-Descriptiveness

Reliability

✔ Availability

Maintainability

✔ Modifiability

✔ Testability

Safety

✔ Hazard Warning

# ============================================================================
# MODULE 6 – CAMPUS ISSUE REPORTING
# ============================================================================

## Purpose

The Campus Issue Reporting module allows students and administrators to report navigation-related and facility-related issues directly from the interactive campus map. Each report is associated with a specific mapped location, enabling administrators to quickly identify, monitor, and resolve campus concerns.

The module promotes faster maintenance coordination while improving the accuracy and reliability of the campus navigation system.

---

# Business Value

Campus facilities occasionally become damaged, inaccessible, or temporarily unavailable. This module provides a centralized way for students to notify administrators about these issues, ensuring that reported problems are tracked and resolved efficiently.

By linking reports to map locations, administrators can immediately identify where problems occur without relying solely on written descriptions.

---

# Users

Student

Administrator

Guests cannot submit reports.

---

# Screens

• Submit Report

• Report Details

• My Reports

• Report Management

• Report Analytics

---

# Feature 1 – Submit Issue Report

Students can submit reports regarding campus facilities.

Each report includes:

- Issue Category
- Title
- Description
- Mapped Location
- Optional Photo
- Date Submitted
- Reporter (optional anonymous mode if enabled)

---

# Feature 2 – Map-Based Reporting

Instead of manually typing locations, users select the affected location directly from the campus map.

Supported report targets include:

- Buildings
- Rooms
- Hallways
- Staircases
- Elevators
- Restrooms
- Laboratories
- Offices
- Other mapped facilities

The selected location is automatically attached to the report.

---

# Feature 3 – Issue Categories

Supported categories include:

- Broken Equipment
- Damaged Facility
- Electrical Issue
- Water Leak
- Cleanliness
- Accessibility Concern
- Safety Concern
- Navigation Error
- Other

Administrators may expand categories in future versions.

---

# Feature 4 – Report Status Tracking

Each report has a status.

Supported statuses:

- Pending
- Under Review
- In Progress
- Resolved
- Rejected

Students can view the current status of their submitted reports.

---

# Feature 5 – Report Management

Administrators can:

- View reports
- Filter reports
- Search reports
- Update report status
- Assign internal notes
- Archive resolved reports

Reports should never be permanently deleted unless necessary.

---

# Feature 6 – Photo Attachments

Students may upload one or more photos to support their report.

Supported formats:

- JPG
- PNG
- WEBP

Photos are stored in Supabase Storage.

---

# Feature 7 – Report History

Each report maintains a history of important actions.

Examples:

- Submitted
- Status Updated
- Resolved
- Archived

This provides accountability and simplifies tracking.

---

# Functional Requirements

FR-38

The system shall allow authenticated students to submit issue reports.

FR-39

The system shall associate reports with mapped locations.

FR-40

The system shall support optional photo attachments.

FR-41

The system shall support report status tracking.

FR-42

The system shall allow administrators to manage reports.

FR-43

The system shall maintain report history.

---

# Validation Rules

A report must contain:

- Category
- Title
- Description
- Valid mapped location

Photo attachments are optional.

The selected location must exist in the campus map.

---

# Dependencies

Authentication

Campus Map

Map Builder

Supabase Storage

Database

---

# Database Tables

reports

report_images

report_history

report_categories

---

# Definition of Done

This module is complete when:

✅ Students can submit reports

✅ Reports are linked to map locations

✅ Photos upload successfully

✅ Administrators can manage reports

✅ Status tracking functions correctly

✅ Report history is recorded

✅ Responsive on desktop and mobile

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Correctness

✔ Functional Appropriateness

Interaction Capability

✔ Operability

✔ User Assistance

✔ User Error Protection

Reliability

✔ Availability

✔ Recoverability

Security

✔ Accountability

✔ Integrity

Maintainability

✔ Modifiability

✔ Testability

# ============================================================================
# MODULE 7 – ADMIN DASHBOARD & ANALYTICS
# ============================================================================

## Purpose

The Admin Dashboard serves as the central management interface of PLV NaviSync. It provides administrators with an overview of the system's current status, recent activities, campus statistics, and operational insights, allowing them to efficiently monitor and manage the digital campus.

Rather than focusing on complex business intelligence, the dashboard presents practical information that helps administrators maintain the campus map and respond to reports.

---

# Business Value

Administrators should immediately understand the current state of the system after logging in.

The dashboard reduces the need to manually inspect every module by presenting important information in a single interface.

---

# Users

Administrator only.

---

# Screens

• Dashboard

• Analytics

• Recent Activity

• System Overview

---

# Feature 1 – Dashboard Overview

The dashboard displays a summary of the entire system.

Displayed information includes:

- Total Buildings
- Total Floors
- Total Rooms
- Total Facilities
- Total Published Maps
- Total Active Events
- Total Pending Reports
- Total Registered Users

Statistics shall update automatically as data changes.

---

# Feature 2 – Recent Activity

Administrators can view the latest system activities.

Examples include:

- Building Added
- Floor Updated
- Map Published
- Report Submitted
- Report Resolved
- Event Published
- User Created

Each activity records:

- Action
- User
- Date
- Time

---

# Feature 3 – Pending Reports Summary

The dashboard displays:

- Pending Reports
- Reports Under Review
- Reports In Progress
- Resolved Reports

Administrators can open the Report Management page directly from each summary.

---

# Feature 4 – Event Summary

Displays:

- Upcoming Events
- Ongoing Events
- Finished Events

Administrators may quickly open event management from the dashboard.

---

# Feature 5 – Campus Statistics

Displays campus information such as:

- Number of Buildings
- Number of Floors
- Number of Rooms
- Number of Facilities
- Number of Navigation Nodes
- Number of Navigation Routes

These statistics help verify that the digital campus remains complete.

---

# Feature 6 – Quick Actions

The dashboard provides shortcuts to common administrative tasks.

Examples:

- Add Building
- Add Floor
- Open Map Builder
- Publish Changes
- Create Event
- Review Reports

This reduces unnecessary navigation.

---

# Feature 7 – System Health

Displays important system indicators.

Examples:

- Database Connected
- Storage Connected
- Authentication Active
- Last Published Map
- Last Backup (optional)

The dashboard should clearly indicate if any required service is unavailable.

---

# Functional Requirements

FR-44

The system shall display campus summary statistics.

FR-45

The system shall display recent administrative activities.

FR-46

The system shall summarize issue reports.

FR-47

The system shall summarize campus events.

FR-48

The system shall provide quick administrative actions.

FR-49

The system shall display system health indicators.

---

# Validation Rules

Dashboard statistics shall never display negative values.

Only authenticated administrators may access the dashboard.

If a data source is unavailable, the dashboard shall display an informative message rather than failing.

---

# Dependencies

Authentication

Buildings

Floors

Map Builder

Reports

Events

Database

Supabase

---

# Database Tables

activity_logs

system_statistics (generated)

reports

events

users

---

# Definition of Done

This module is complete when:

✅ Dashboard statistics display correctly

✅ Recent activities are recorded

✅ Report summaries update automatically

✅ Event summaries update automatically

✅ Quick actions function correctly

✅ System health indicators display accurately

✅ Responsive on desktop and tablet

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Appropriateness

Interaction Capability

✔ Operability

✔ Self-Descriptiveness

✔ User Assistance

Reliability

✔ Availability

Maintainability

✔ Analysability

✔ Modifiability

Performance Efficiency

✔ Time Behaviour

# ============================================================================
# MODULE 8 – MAP VALIDATION & PUBLISHING
# ============================================================================

## Purpose

The Map Validation & Publishing module ensures that only complete, accurate, and validated campus map data is published to the student-facing application. It prevents incomplete, inconsistent, or invalid map configurations from becoming publicly available.

This module acts as the final quality control step before administrators publish any campus changes.

---

# Business Value

Campus navigation depends on accurate map data.

Publishing incomplete buildings, disconnected routes, or missing destinations may result in incorrect navigation.

Validation protects the integrity of the campus map while allowing administrators to confidently publish updates.

---

# Users

Administrator only.

---

# Screens

• Validation Center

• Validation Results

• Publish Manager

• Version History

---

# Feature 1 – Automatic Map Validation

Before publication, the system automatically analyzes the entire campus map.

Validation includes:

- Buildings
- Floors
- Rooms
- Facilities
- Navigation Nodes
- Navigation Routes
- Accessibility Routes
- Emergency Routes

The system generates a validation report before publishing.

---

# Feature 2 – Validation Rules

The system checks for:

• Buildings without floors

• Floors without floor plans

• Rooms without names

• Duplicate room names within the same floor

• Missing navigation nodes

• Disconnected navigation graphs

• Routes pointing to deleted locations

• Missing accessibility information

• Missing emergency exits

• Invalid coordinates

Errors shall prevent publication.

Warnings may still allow publication after administrator confirmation.

---

# Feature 3 – Validation Report

The validation report displays:

- Errors
- Warnings
- Passed Checks
- Total Validation Score

Each issue includes:

- Description

- Affected Location

- Suggested Resolution

Administrators may navigate directly to the affected object.

---

# Feature 4 – Draft Management

All edits remain in Draft mode until published.

Administrators may:

- Continue editing
- Save Draft
- Discard Draft
- Compare with Published Version

Students never see draft changes.

---

# Feature 5 – Publish Manager

Publishing performs the following sequence:

1. Validate data
2. Display validation results
3. Request confirmation
4. Publish validated data
5. Record publication history
6. Refresh the student-facing map

---

# Feature 6 – Version History

The system stores a history of published map versions.

Each version records:

- Version Number
- Published By
- Publication Date
- Publication Time
- Summary of Changes

Administrators may review previous publications for reference.

Rollback functionality is considered a future enhancement and is outside the scope of this capstone.

---

# Feature 7 – Publication Summary

After publishing, the system displays a summary including:

- Buildings Updated
- Floors Updated
- Rooms Updated
- Facilities Updated
- Routes Updated
- Total Objects Published

This confirms that publication completed successfully.

---

# Functional Requirements

FR-50

The system shall validate campus map data before publication.

FR-51

The system shall prevent publication when validation errors exist.

FR-52

The system shall generate a validation report.

FR-53

The system shall maintain draft and published map states.

FR-54

The system shall record publication history.

FR-55

The system shall display a publication summary after successful publishing.

---

# Validation Rules

Publication shall be blocked when:

- Required building information is missing.
- Required floor plans are missing.
- Navigation graphs are disconnected.
- Invalid destination references exist.
- Duplicate identifiers exist.
- Critical validation errors remain unresolved.

Warnings do not block publication but require administrator confirmation.

---

# Dependencies

Authentication

Map Builder

Campus Navigation

Buildings

Floors

Supabase Database

Activity Logs

---

# Database Tables

draft_maps

published_maps

validation_results

publication_history

activity_logs

---

# Definition of Done

This module is complete when:

✅ Validation detects incomplete map data.

✅ Critical errors prevent publication.

✅ Validation reports display correctly.

✅ Drafts remain private.

✅ Published maps become visible to students.

✅ Publication history is recorded.

✅ Publication summary displays successfully.

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

✔ Functional Correctness

✔ Functional Appropriateness

Reliability

✔ Faultlessness

✔ Recoverability

Security

✔ Integrity

✔ Accountability

Maintainability

✔ Analysability

✔ Testability

✔ Modifiability

Safety

✔ Operational Constraint

✔ Safe Integration

✔ Hazard Warning

# ============================================================================
# MODULE 9 – SYSTEM CONFIGURATION & SETTINGS
# ============================================================================

## Purpose

The System Configuration & Settings module allows administrators to configure global system preferences, campus branding, and application behavior without modifying the source code. This module centralizes settings that affect the entire system while keeping the application maintainable and easy to manage after deployment.

---

# Business Value

Instead of requiring developers to change code for simple configuration updates, administrators can manage system-wide settings through the administration interface.

This improves maintainability and long-term sustainability.

---

# Users

Administrator only.

---

# Screens

• General Settings

• Campus Branding

• Account Settings

• System Preferences

---

# Feature 1 – General Settings

Administrators can configure:

- Campus Name
- Campus Logo
- Campus Description
- Contact Information

---

# Feature 2 – Campus Branding

Administrators can manage:

- System Logo
- Favicon
- Primary Color
- Secondary Color

Branding changes should automatically update the user interface.

---

# Feature 3 – Account Settings

Administrators can:

- Change Password
- Update Profile
- Update Email
- Change Profile Picture

---

# Feature 4 – System Preferences

Administrators can configure:

- Default Map Zoom
- Default Landing Page
- Theme (Light/Dark/System)
- Session Timeout

---

# Feature 5 – Backup & Export

Administrators may:

- Export database (future enhancement)
- Export map data
- Export reports

Database restoration is outside the scope of this capstone.

---

# Functional Requirements

FR-56

The system shall allow administrators to configure global system settings.

FR-57

The system shall support campus branding customization.

FR-58

The system shall allow administrators to manage their account.

FR-59

The system shall support exporting selected system data.

---

# Dependencies

Authentication

Database

Supabase Storage

---

# Database Tables

system_settings

user_profiles

---

# Definition of Done

This module is complete when:

✅ Global settings can be modified

✅ Branding updates are reflected throughout the system

✅ Administrators can update their accounts

✅ Export functions operate correctly

---

# ISO/IEC 25010 Mapping

Functional Suitability

✔ Functional Completeness

Interaction Capability

✔ Operability

Maintainability

✔ Modifiability

✔ Adaptability

Security

✔ Authenticity

✔ Confidentiality
