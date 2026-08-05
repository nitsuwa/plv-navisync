# PLV NaviSync - System Features Specification
Version: 2.0 (Frozen Scope)
Status: Official Project Specification
Purpose: This document serves as the single source of truth for the implementation of PLV NaviSync. All development, database design, testing, and AI-assisted coding must follow this specification. If an implementation conflicts with this document, this document takes precedence.

---

# 1. Project Overview

## 1.1 Project Name

PLV NaviSync: Campus Navigation and Digital Campus Management System

---

## 1.2 Project Description

PLV NaviSync is a Progressive Web Application (PWA) designed for Pamantasan ng Lungsod ng Valenzuela (PLV). It provides an interactive digital campus map that allows students, faculty, staff, and visitors to easily navigate the campus while enabling administrators to create, manage, validate, and publish campus map data without modifying source code.

The system is focused on campus navigation and digital campus management. Every module exists to improve wayfinding, maintain accurate campus information, and assist administrators in keeping the digital campus map up to date.

This is NOT a Student Information System (SIS), Learning Management System (LMS), or Enrollment System.

---

# 2. Project Goals

The system aims to:

- Digitize the entire PLV campus map.
- Allow administrators to visually maintain campus map data.
- Help students and visitors locate destinations quickly.
- Provide accurate indoor and outdoor navigation.
- Support accessibility-friendly navigation.
- Provide emergency evacuation guidance.
- Allow reporting of navigation-related campus issues.
- Display campus events and temporary map changes.
- Maintain a reliable and easily updateable digital campus.

---

# 3. Project Philosophy

Every feature must support at least one of these objectives.

## Navigation First

Navigation is the primary purpose of the system.

If a feature does not improve campus navigation or campus map management, it should not be included.

---

## Real-World Maintainability

The university should be able to maintain the system after deployment without requiring software developers for routine updates.

Administrators should be able to:

- add buildings
- edit buildings
- add floors
- update rooms
- modify routes
- publish changes

through the administration interface.

---

## Accuracy Over Quantity

A smaller number of complete, reliable, and tested features is preferred over many unfinished features.

Every implemented feature must function correctly and be demonstrable during the capstone defense.

---

## Modular Design

Each module should operate independently while integrating seamlessly with other modules.

Modules should minimize dependencies to simplify maintenance and future enhancements.

---

## User-Centered Design

The interface must prioritize ease of use.

Users should accomplish common tasks with minimal clicks.

Navigation should be intuitive for first-time users.

---

# 4. Intended Users

## Guest

Guests can:

- View the campus map.
- Search locations.
- Navigate to destinations.
- View events.
- View building information.

Guests cannot:

- Submit reports.
- Access administrative functions.

---

## Student

Students can:

- Perform all Guest functions.
- Submit campus issue reports.
- Save favorite locations (optional enhancement).
- View report status (optional enhancement).

Students cannot:

- Modify campus data.
- Publish maps.
- Access administration tools.

---

## Administrator

Administrators can:

- Manage buildings.
- Manage floors.
- Manage rooms.
- Manage facilities.
- Manage navigation routes.
- Manage events.
- Manage announcements.
- Review issue reports.
- Publish map changes.
- Validate campus maps.
- Manage user accounts.
- Configure system settings.

Administrators have full system access.

---

# 5. Out of Scope

The following are intentionally excluded from this project.

These are NOT unfinished features.

They are outside the scope of PLV NaviSync.

- Student Information System
- Enrollment Management
- Grades
- Attendance Monitoring
- Faculty Management
- Learning Management System
- Payroll
- Accounting
- Library Management
- Real-Time GPS Tracking
- Indoor Position Tracking
- Voice Navigation
- AI Chatbot
- Augmented Reality Navigation
- 3D Indoor Navigation

---