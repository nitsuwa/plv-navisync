from __future__ import annotations

import base64
import json
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import Browser, BrowserContext, Page, Route, sync_playwright


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent / "evidence"
BASES = {"before": "http://127.0.0.1:5175", "after": "http://127.0.0.1:5176"}
VIEWPORTS = [
    (320, 568), (360, 800), (390, 844), (430, 932),
    (667, 375), (844, 390), (768, 1024), (1024, 768),
    (768, 390),  # effective CSS viewport equivalent to 200% zoom at 1536x780 (emulation)
    (1280, 720), (1536, 780), (1920, 1080),
]
NOW = "2026-11-12T02:00:00.000Z"
CREATED = "2026-10-20T02:00:00.000Z"
LONG_TITLE = "NeedsReviewUnbrokenTitleForResponsiveLayout" * 5
LONG_APPROVED = "ApprovedPublicationUnbrokenTitleForResponsiveLayout" * 4
LONG_HISTORY = "HistoryUnbrokenTitleForResponsiveLayout" * 5
LONG_LISTING = "CampusListingsUnbrokenTitleForResponsiveLayout" * 5
QA_ADMIN = "8e598bf0-85a6-4f41-9f7e-e6d081512d32"
QA_USER = "a41a99ec-84a8-4a8e-9cc8-54b36f91e1bb"
QA_ORG = "qa-org-responsive"
QA_CAMPUS = "campus-qa-map"
QA_BUILDING = "building-qa-main"
QA_FLOOR = "floor-qa-main"


def encode_jwt_payload(value: dict[str, Any]) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.{encoded}.fixture-signature"


def overlays() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    groups = [
        ("pending", 18, LONG_TITLE),
        ("approved", 16, LONG_APPROVED),
        ("disapproved", 12, LONG_HISTORY),
    ]
    for status, count, long_title in groups:
        for index in range(count):
            event_id = f"event-{status}-{index:02d}"
            title = long_title if index in (0, count - 1) else f"{status.title()} Campus Event {index + 1:02d}"
            rows.append({
                "id": event_id,
                "campus_id": QA_CAMPUS,
                "organization_id": QA_ORG,
                "element_type": "event_overlay",
                "name": title,
                "x": 0,
                "y": 0,
                "archived_at": None,
                "created_at": f"2026-10-{max(1, 28 - index):02d}T02:00:00.000Z",
                "updated_at": NOW,
                "metadata": {
                    "kind": "event_overlay",
                    "title": title,
                    "description": f"Controlled local responsive fixture for {status} event {index + 1}.",
                    "organizer": "PLV Responsive QA",
                    "markers": [],
                    "locations": [{
                        "id": "grounds",
                        "locationRef": {"type": "campus", "label": "Campus Grounds"},
                        "eventFurniture": [],
                        "eventLabels": [],
                    }],
                    "restrictedAreas": [],
                    "isActive": True,
                    "status": status,
                    "academicYear": "2026–2027",
                    "createdByUserId": QA_USER,
                    "submittedAt": CREATED,
                    "dateStart": "2026-11-15T02:00:00.000Z",
                    "dateEnd": "2026-11-15T10:00:00.000Z",
                    "publicationAt": NOW,
                    "revision": 1,
                },
            })
    return rows


def campus_map() -> dict[str, Any]:
    return {
        "id": QA_CAMPUS,
        "name": "Main Map QA Campus",
        "code": "QA-MAP",
        "description": "Controlled responsive browser fixture",
        "address": "",
        "city": "Valenzuela",
        "province": "Metro Manila",
        "postalCode": "",
        "status": "active",
        "publishStatus": "published",
        "visibleToStudents": True,
        "features": {"accessibility": True, "emergency": True, "eventLayer": True, "gps": True},
        "canvasW": 1200,
        "canvasH": 900,
        "canvasConfigured": True,
        "settings": {"accessibility": True, "emergency": True, "eventLayer": True, "gps": True},
        "buildings": [{
            "id": QA_BUILDING, "name": "Main Building", "code": "MB", "category": "academic",
            "description": "Fixture building", "x": 220, "y": 180, "width": 280, "height": 190,
            "rotation": 0, "visible": True, "color": "#1e3a5f", "floors": [],
        }],
        "markers": [], "paths": [], "navNodes": [], "navEdges": [], "routes": [],
        "accessibilityFeatures": [], "assemblyPoints": [], "eventOverlays": [], "decorAssets": [],
        "createdAt": CREATED, "updatedAt": NOW, "publishedAt": CREATED, "lifecycleStatus": "published",
    }


def campus_rows() -> list[dict[str, Any]]:
    common = {
        "description": "Controlled responsive browser fixture",
        "address": "",
        "city": "Valenzuela",
        "province": "Metro Manila",
        "postal_code": "",
        "latitude": 14.7116,
        "longitude": 120.9660,
        "theme_color": "#1e3a5f",
        "canvas_width": 1200,
        "canvas_height": 900,
        "map_scale_m_per_unit": 1,
        "is_default": False,
        "archived_at": None,
        "created_at": CREATED,
        "updated_at": NOW,
        "created_by": QA_ADMIN,
        "updated_by": QA_ADMIN,
        "logo_path": None,
        "overview_image_path": None,
        "emergency_destination_policy": "fixed_primary",
    }
    main_building_preview = {
        "id": QA_BUILDING, "name": "Main Building", "code": "MB", "category": "academic",
        "description": "Fixture building", "x": 220, "y": 180, "width": 280, "height": 190,
        "rotation": 0, "is_visible": True, "metadata": {}, "archived_at": None,
    }
    return [
        {**common, "id": QA_CAMPUS, "name": "Main Map QA Campus", "code": "QA-MAP", "status": "published",
         "canvas_configured": True, "latest_published_version_id": "version-qa-map", "preview_buildings": [main_building_preview]},
        {**common, "id": "campus-qa-setup", "name": "Canvas Setup QA Campus", "code": "QA-SETUP", "status": "draft",
         "canvas_configured": False, "latest_published_version_id": None, "preview_buildings": []},
    ]


def buildings() -> list[dict[str, Any]]:
    return [{
        "id": QA_BUILDING, "campus_id": QA_CAMPUS, "name": "Main Building", "code": "MB",
        "category": "academic", "description": "Fixture building", "x": 220, "y": 180,
        "width": 280, "height": 190, "rotation": 0, "is_visible": True,
        "is_searchable": False, "is_accessible": False, "contact_information": None,
        "operating_hours": None, "image_path": None, "metadata": {}, "archived_at": None,
        "created_by": QA_ADMIN, "updated_by": QA_ADMIN, "created_at": CREATED, "updated_at": NOW,
    }]


def floors() -> list[dict[str, Any]]:
    return [{
        "id": QA_FLOOR, "building_id": QA_BUILDING, "name": "Ground Floor", "floor_number": 1,
        "display_order": 1, "canvas_width": 900, "canvas_height": 650, "floor_plan_path": None,
        "is_visible": True, "map_scale_m_per_unit": 1, "metadata": {}, "archived_at": None,
        "created_at": CREATED, "updated_at": NOW, "buildings": {"campus_id": QA_CAMPUS},
    }]


def profile_rows() -> list[dict[str, Any]]:
    rows = [{
        "id": QA_ADMIN, "email": "qa-admin@example.test", "first_name": "QA", "last_name": "Administrator",
        "role": "admin", "is_active": True, "account_status": "active", "created_at": CREATED,
        "updated_at": NOW, "campus_id": None, "department": "Quality Assurance", "student_id": None,
    }, {
        "id": QA_USER, "email": "submitter@example.test", "first_name": "Event", "last_name": "Submitter",
        "role": "student_org", "is_active": True, "account_status": "active", "created_at": CREATED,
        "updated_at": NOW, "campus_id": QA_CAMPUS, "department": "Student Organizations", "student_id": None,
    }]
    for index in range(1, 22):
        rows.append({
            "id": f"qa-user-{index:02d}", "email": f"user{index:02d}@example.test",
            "first_name": f"Campus", "last_name": f"User {index:02d}",
            "role": "student" if index % 4 else "admin", "is_active": index % 7 != 0,
            "account_status": "active" if index % 7 else "inactive", "created_at": CREATED,
            "updated_at": NOW, "campus_id": QA_CAMPUS, "department": "", "student_id": f"2026{index:04d}",
        })
    return rows


def report_rows() -> list[dict[str, Any]]:
    statuses = ["pending", "under_review", "in_progress", "resolved", "rejected"]
    return [{
        "id": f"report-qa-{index:02d}", "campus_id": QA_CAMPUS, "building_id": QA_BUILDING,
        "floor_id": QA_FLOOR, "map_element_id": None, "reporter_id": QA_USER,
        "category": "damaged_facility", "priority": "normal", "title": f"Damaged facility report {index:02d}",
        "description": "Controlled local responsive fixture for admin report layout.",
        "status": statuses[(index - 1) % len(statuses)], "resolution_notes": None,
        "created_at": f"2026-10-{max(1, 28 - index):02d}T02:00:00.000Z", "updated_at": NOW,
        "archived_at": None, "reporter": {"first_name": "Event", "last_name": "Submitter", "email": "submitter@example.test"},
    } for index in range(1, 19)]


def activity_rows() -> list[dict[str, Any]]:
    return [{
        "id": f"activity-qa-{index:02d}", "user_id": QA_ADMIN, "action": "report.status_changed",
        "entity_type": "report", "entity_id": f"report-qa-{index:02d}", "campus_id": QA_CAMPUS,
        "metadata": {"target_name": f"Report {index:02d}", "from_status": "pending", "to_status": "under_review"},
        "created_at": f"2026-10-{max(1, 28 - index):02d}T02:00:00.000Z",
    } for index in range(1, 22)]


def listing_events() -> list[dict[str, Any]]:
    statuses = ["published", "draft", "archived"]
    return [{
        "id": f"listing-event-{index:02d}",
        "title": LONG_LISTING if index in (1, 18) else f"Campus Event Listing {index:02d}",
        "description": "Controlled local responsive campus listing.", "category": "student_life",
        "organizer": "PLV Responsive QA", "starts_at": "2026-11-15T02:00:00.000Z",
        "ends_at": "2026-11-15T10:00:00.000Z", "status": statuses[(index - 1) % 3],
        "cover_image_path": None, "created_at": CREATED, "updated_at": NOW,
        "campus_id": QA_CAMPUS, "created_by": QA_ADMIN,
    } for index in range(1, 19)]


def published_snapshot_rows() -> list[dict[str, Any]]:
    return [{
        "campus_id": QA_CAMPUS,
        "latest_published_version_id": "version-qa-map",
        "published_at": CREATED,
    }]


def safe_campus_snapshot_rows() -> list[dict[str, Any]]:
    return [{
        "campus_id": QA_CAMPUS,
        "version_id": "version-qa-map",
        "published_at": CREATED,
        "snapshot": {"campus": campus_map(), "structure": {"buildings": [], "floors": [], "map_elements": []}},
    }]


class Fixtures:
    def __init__(self, app_origin: str):
        self.app_origin = app_origin
        self.events = listing_events()
        self.map_elements = overlays()
        self.campuses = campus_rows()
        self.profiles = profile_rows()
        self.reports = report_rows()
        self.activity = activity_rows()
        self.write_attempts: list[dict[str, str]] = []
        self.requests: list[str] = []

    @staticmethod
    def response(route: Route, payload: Any, status: int = 200, method: str = "GET") -> None:
        headers = {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "authorization, apikey, x-client-info, content-type, prefer, range, x-upsert",
            "access-control-allow-methods": "GET, POST, PATCH, DELETE, PUT, OPTIONS, HEAD",
            "access-control-expose-headers": "content-range, x-total-count, preference-applied",
            "cache-control": "no-store",
        }
        if method == "HEAD":
            route.fulfill(status=status, headers={**headers, "content-range": "0-0/0"}, body="")
        else:
            route.fulfill(status=status, headers=headers, json=payload)

    def handler(self, route: Route) -> None:
        request = route.request
        parsed = urlparse(request.url)
        if parsed.hostname != "fixture.supabase.co":
            route.continue_()
            return
        path = parsed.path
        method = request.method.upper()
        self.requests.append(f"{method} {path}?{parsed.query}")
        if method in {"PATCH", "DELETE", "PUT"} or (method == "POST" and "/rpc/ack_event_notification" not in path):
            if "/rpc/" not in path:
                self.write_attempts.append({"method": method, "path": path})
        if method == "OPTIONS":
            self.response(route, [], method="GET")
            return
        if path == "/auth/v1/user":
            self.response(route, {
                "id": QA_ADMIN,
                "aud": "authenticated",
                "role": "authenticated",
                "email": "qa-admin@example.test",
                "email_confirmed_at": CREATED,
                "app_metadata": {"provider": "email", "providers": ["email"]},
                "user_metadata": {"admin_notification_preferences": {"reports": True, "events": True, "campus": True, "announcements": True, "users": True}},
                "created_at": CREATED,
                "updated_at": NOW,
            })
            return
        if path.startswith("/auth/v1/"):
            self.response(route, {"access_token": "fixture", "token_type": "bearer", "expires_in": 3600, "refresh_token": "fixture"})
            return
        if path.startswith("/rest/v1/rpc/"):
            rpc = path.rsplit("/", 1)[-1]
            try:
                body = request.post_data_json if request.post_data else {}
            except Exception:
                body = {}
            if rpc == "admin_list_event_organizations":
                payload: Any = [{"id": QA_ORG, "code": "QA-ORG", "name": "PLV Student QA Organization", "is_active": True, "created_at": CREATED, "updated_at": NOW, "grants": []}]
            elif rpc == "list_published_campus_version_status":
                payload = published_snapshot_rows()
            elif rpc == "list_event_safe_published_campuses":
                payload = safe_campus_snapshot_rows()
            elif rpc == "list_coming_soon_campuses":
                payload = []
            elif rpc == "get_event_notification_states":
                candidates = body.get("p_candidates", []) if isinstance(body, dict) else []
                payload = [{"event_id": row.get("event_id"), "is_current": True, "is_read": True} for row in candidates]
            elif rpc == "ack_event_notification":
                payload = None
            elif rpc == "get_admin_activity_history_cutoff":
                payload = None
            else:
                payload = []
            self.response(route, payload)
            return
        table = path.removeprefix("/rest/v1/")
        query = parse_qs(parsed.query)
        if table == "profiles":
            payload = self.profiles
            ids = query.get("id", [])
            if ids and ids[0].startswith("eq."):
                requested_id = ids[0][3:]
                payload = [row for row in payload if row["id"] == requested_id]
            elif ids and ids[0].startswith("in.("):
                requested_ids = set(ids[0][4:-1].split(","))
                payload = [row for row in payload if row["id"] in requested_ids]
        elif table == "map_elements":
            payload = self.map_elements
            accept = request.headers.get("accept", "")
            if "application/vnd.pgrst.object+json" in accept:
                ids = query.get("id", [])
                requested_id = ids[0][3:] if ids and ids[0].startswith("eq.") else None
                matches = [row for row in payload if requested_id is None or row["id"] == requested_id]
                payload = matches[0] if matches else {"code": "PGRST116", "message": "JSON object requested, multiple (or no) rows returned"}
                self.response(route, payload, status=200 if matches else 406)
                return
        elif table == "campuses":
            payload = self.campuses
        elif table == "buildings":
            payload = buildings()
        elif table == "floors":
            payload = floors()
        elif table == "reports":
            payload = self.reports
        elif table == "activity_logs":
            payload = self.activity
        elif table == "events":
            payload = self.events
        elif table == "event_locations":
            payload = [{"event_id": row["id"], "label": "Campus Grounds"} for row in self.events]
        else:
            payload = []
        if method == "HEAD":
            self.response(route, None, method="HEAD")
        else:
            self.response(route, payload)


def install_auth(context: BrowserContext) -> None:
    now = int(time.time())
    token = encode_jwt_payload({"sub": QA_ADMIN, "aud": "authenticated", "role": "authenticated", "iat": now, "exp": now + 3600})
    session = {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 3600,
        "expires_at": now + 3600,
        "refresh_token": "fixture-refresh-token",
        "user": {"id": QA_ADMIN, "aud": "authenticated", "role": "authenticated", "email": "qa-admin@example.test",
                 "app_metadata": {"provider": "email", "providers": ["email"]},
                 "user_metadata": {"admin_notification_preferences": {"reports": True, "events": True, "campus": True, "announcements": True, "users": True}},
                 "created_at": CREATED, "updated_at": NOW},
    }
    context.add_init_script(f"localStorage.setItem('sb-fixture-auth-token', {json.dumps(json.dumps(session))});")


def new_page(browser: Browser, base: str, viewport: tuple[int, int], *, mobile: bool = False) -> tuple[BrowserContext, Page, Fixtures]:
    context = browser.new_context(
        viewport={"width": viewport[0], "height": viewport[1]},
        device_scale_factor=1,
        is_mobile=mobile,
        has_touch=mobile,
        color_scheme="light",
    )
    install_auth(context)
    fixtures = Fixtures(base)
    context.route("**/*", fixtures.handler)
    page = context.new_page()
    page.on("pageerror", lambda error: fixtures.requests.append(f"PAGEERROR {error}"))
    return context, page, fixtures


def wait_for_content(page: Page, text: str, timeout: int = 20000) -> None:
    page.locator("main").get_by_text(text, exact=False).first.wait_for(state="visible", timeout=timeout)


def main_scroller(page: Page) -> Any:
    return page.locator("main").first


def bounds(locator: Any) -> dict[str, float] | None:
    box = locator.bounding_box()
    if not box:
        return None
    return {
        **box,
        "left": box["x"],
        "top": box["y"],
        "right": box["x"] + box["width"],
        "bottom": box["y"] + box["height"],
    }


def measure_overflow(page: Page) -> dict[str, Any]:
    return page.evaluate("""() => {
      const main = document.querySelector('main');
      const cards = [...document.querySelectorAll('[data-testid^="event-layout-card-"]')];
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        documentClientHeight: document.documentElement.clientHeight,
        documentVerticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
        bodyWidth: document.body.scrollWidth,
        mainWidth: main ? {client: main.clientWidth, scroll: main.scrollWidth} : null,
        mainHeight: main ? {client: main.clientHeight, scroll: main.scrollHeight, top: main.scrollTop} : null,
        mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
        mainOverflowY: main ? getComputedStyle(main).overflowY : null,
        outletWrapper: main?.firstElementChild ? {
          className: main.firstElementChild.className,
          clientHeight: main.firstElementChild.clientHeight,
          scrollHeight: main.firstElementChild.scrollHeight,
          height: main.firstElementChild.getBoundingClientRect().height,
        } : null,
        cardOverflow: cards.filter(card => card.scrollWidth > card.clientWidth + 1).map(card => ({id: card.dataset.testid, client: card.clientWidth, scroll: card.scrollWidth})),
      };
    }""")


def measure_primary_geometry(browser: Browser, base: str, side: str) -> list[dict[str, Any]]:
    routes = [
        ("users", "/admin-dashboard/users", "Users"),
        ("reports", "/admin-dashboard/reports", "Reports"),
        ("activity-logs", "/admin-dashboard/activity-logs", "Activity Logs"),
        ("settings", "/admin-dashboard/settings", "Settings"),
        ("events-review", "/admin-dashboard/events?view=review", "Needs review"),
        ("events-publication", "/admin-dashboard/events?view=publication", "Approved & publication"),
        ("events-history", "/admin-dashboard/events?view=history", "Layout history"),
        ("events-listings", "/admin-dashboard/events?view=listings", "Campus Events"),
    ]
    measurements: list[dict[str, Any]] = []
    for key, path, ready in routes:
        for width, height in ((1536, 780), (390, 844)):
            context, page, fixtures = new_page(browser, base, (width, height), mobile=width <= 430)
            open_route(page, base, path, ready)
            main = main_scroller(page)
            if key == "settings":
                # Visit all settings tabs without changing values; use the longest final tab for end-gap geometry.
                for label in ("Map & Navigation", "Notifications", "Student Experience", "Notifications"):
                    page.get_by_role("tab", name=label).click()
                    assert page.get_by_role("tab", name=label).get_attribute("aria-selected") == "true"
                page.wait_for_timeout(250)
                end_content = page.get_by_role("tabpanel")
                first_result = page.get_by_role("tab", name="Student Experience")
                last_action = page.get_by_role("switch", name="User management notifications")
            elif key == "users":
                mobile_cards = page.locator("[data-testid='mobile-user-cards'] article")
                user_rows = mobile_cards if width < 1024 and mobile_cards.count() else page.locator("main table tbody tr")
                first_result = user_rows.first
                last_result = user_rows.last
                first_result = first_result
                last_action = last_result.get_by_role("button", name=re.compile("^Actions for "))
                end_content = page.locator("#student-organizations")
                if end_content.count() == 0:
                    end_content = last_result
            elif key == "reports":
                report_actions = page.get_by_role("button", name=re.compile("^View report:"))
                first_result = report_actions.first.locator("xpath=../..")
                last_action = report_actions.last
                end_content = report_actions.last.locator("xpath=../..")
            elif key == "activity-logs":
                first_result = page.locator("main article").first
                last_result = page.locator("main article").last
                first_result.locator("summary").focus()
                end_content = last_result
                last_action = last_result.locator("summary").last
                if last_action.count():
                    last_action.click()
            elif key.startswith("events-") and key != "events-listings":
                cards = page.locator("[data-testid^='event-layout-card-']")
                first_result = cards.first
                last_result = cards.last
                action_name = {"events-review": "Review submission", "events-publication": "Manage publication", "events-history": "Open map preview"}[key]
                last_action = last_result.get_by_role("button", name=action_name)
                end_content = last_result
            elif key == "events-listings":
                cards = page.locator("[data-testid^='campus-event-card-']")
                if cards.count() == 0:
                    cards = page.locator("main .bg-card.rounded-2xl")
                first_result = cards.first
                last_result = cards.last
                last_action = last_result.get_by_role("button", name="Archive")
                end_content = last_result

            main.evaluate("el => { el.scrollTop = 0; }")
            page.wait_for_timeout(80)
            first_result_rect = bounds(first_result) if first_result.count() else None
            first_action = None
            if key == "users":
                first_action = first_result.get_by_role("button").first
            elif key == "reports":
                first_action = page.get_by_role("button", name=re.compile("^View report:")).first
            elif key == "activity-logs":
                first_action = first_result.locator("summary").first
            elif key == "settings":
                first_action = page.get_by_role("tab", name="Student Experience")
            elif key.startswith("events-") and key != "events-listings":
                first_action = first_result.get_by_role("button", name={"events-review": "Review submission", "events-publication": "Manage publication", "events-history": "Open map preview"}[key])
            elif key == "events-listings":
                first_action = page.get_by_role("button", name="Edit").first
            first_action_rect = bounds(first_action) if first_action and first_action.count() else None

            max_scroll_top = main.evaluate("el => Math.max(0, el.scrollHeight - el.clientHeight)")
            main.evaluate("el => { el.scrollTop = el.scrollHeight; }")
            page.wait_for_timeout(100)
            main_rect = bounds(main)
            end_rect = bounds(end_content) if end_content.count() else None
            bottom_gap = round(main_rect["bottom"] - end_rect["bottom"], 1) if main_rect and end_rect else None
            last_action.scroll_into_view_if_needed()
            page.wait_for_timeout(50)
            action_rect = bounds(last_action)
            if last_action.count():
                last_action.evaluate("element => element.focus({preventScroll: true})")
            focus_reached = last_action.evaluate("element => document.activeElement === element") if last_action.count() else False
            visible_gap_after_action = round(main_rect["bottom"] - action_rect["bottom"], 1) if main_rect and action_rect else None
            overflow = measure_overflow(page)
            result = {
                "route": key,
                "viewport": {"width": width, "height": height},
                "main": overflow["mainHeight"],
                "maxScrollTop": max_scroll_top,
                "documentHeight": overflow["documentHeight"],
                "documentClientHeight": overflow["documentClientHeight"],
                "documentVerticalOverflow": overflow["documentVerticalOverflow"],
                "overflowY": overflow["mainOverflowY"],
                "paddingBottom": overflow["mainPaddingBottom"],
                "outletWrapper": overflow["outletWrapper"],
                "firstResultTop": first_result_rect["top"] if first_result_rect else None,
                "firstActionTop": first_action_rect["top"] if first_action_rect else None,
                "endContentBottom": end_rect["bottom"] if end_rect else None,
                "bottomGap": bottom_gap,
                "lastAction": action_rect,
                "visibleGapAfterLastAction": visible_gap_after_action,
                "lastActionFocused": focus_reached,
                "writes": list(fixtures.write_attempts),
            }
            if side == "after":
                assert not overflow["documentVerticalOverflow"], f"competing document scroll on {key} at {width}x{height}: {overflow}"
                assert overflow["mainOverflowY"] in ("auto", "scroll"), f"admin main is not the page scroller on {key}: {overflow}"
                assert bottom_gap is not None and bottom_gap >= (16 if width <= 430 else 24), f"insufficient trailing gap on {key} at {width}x{height}: {result}"
                assert action_rect and action_rect["top"] >= main_rect["top"] and action_rect["bottom"] <= main_rect["bottom"], f"final action not visible on {key} at {width}x{height}: {result}"
                assert focus_reached, f"final action cannot receive focus on {key} at {width}x{height}"
                if width == 1536 and key not in ("settings",):
                    assert first_action_rect and first_action_rect["top"] >= main_rect["top"] and first_action_rect["bottom"] <= main_rect["bottom"], f"first action not initially visible on {key}: {result}"
            if key in ("events-review", "events-listings"):
                if width == 1536:
                    screenshot(page, side, f"desktop-{key}-final-row.png")
                elif width == 390:
                    screenshot(page, side, f"mobile-{key}-final-row-390.png")
            measurements.append(result)
            context.close()
    return measurements


def open_route(page: Page, base: str, path: str, ready: str) -> None:
    page.goto(f"{base}{path}", wait_until="domcontentloaded", timeout=30000)
    wait_for_content(page, ready)
    page.wait_for_timeout(250)


def screenshot(page: Page, side: str, name: str) -> str:
    directory = EVIDENCE / side
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / name
    page.screenshot(path=str(target), animations="disabled")
    return str(target.relative_to(ROOT)).replace("\\", "/")


def assert_clear_pages(page: Page, base: str, side: str) -> list[dict[str, Any]]:
    routes = [
        ("users", "/admin-dashboard/users", "Users"),
        ("reports", "/admin-dashboard/reports", "Reports"),
        ("activity-logs", "/admin-dashboard/activity-logs", "Activity Logs"),
        ("settings", "/admin-dashboard/settings", "Settings"),
        ("events-review", "/admin-dashboard/events?view=review", "Needs review"),
        ("events-publication", "/admin-dashboard/events?view=publication", "Approved & publication"),
        ("events-history", "/admin-dashboard/events?view=history", "Layout history"),
        ("events-listings", "/admin-dashboard/events?view=listings", "Campus Events"),
        ("direct-event-preview", "/admin-dashboard/event-layouts/event-pending-00/preview", LONG_TITLE[:20]),
        ("map-builder", "/admin-dashboard/map-builder", "Campus"),
    ]
    results = []
    for key, path, ready in routes:
        page.set_viewport_size({"width": 1536, "height": 780})
        open_route(page, base, path, ready)
        record = {"route": key, "initial": measure_overflow(page), "viewports": []}
        if key == "events-review":
            first_action = bounds(page.locator("[data-testid^='event-layout-card-']").first.get_by_role("button", name="Review submission"))
            record["firstActionAt1536x780"] = first_action
            if side == "after":
                assert first_action and 0 <= first_action["top"] and first_action["bottom"] <= 780, f"first review action not visible at 1536x780: {first_action}"
        if key == "events-review" and side == "before":
            screenshot(page, side, "desktop-events-review-first-result.png")
        if key == "events-review" and side == "after":
            screenshot(page, side, "desktop-events-review-first-result.png")
        for width, height in VIEWPORTS:
            page.set_viewport_size({"width": width, "height": height})
            page.wait_for_timeout(80)
            measured = measure_overflow(page)
            measured["noDocumentOverflow"] = measured["documentWidth"] <= width
            if side == "after":
                assert measured["noDocumentOverflow"], f"document horizontal overflow on {key} at {width}x{height}: {measured}"
                assert not measured["documentVerticalOverflow"], f"document vertical overflow on {key} at {width}x{height}: {measured}"
                assert not measured["cardOverflow"], f"event card horizontal overflow on {key} at {width}x{height}: {measured['cardOverflow']}"
            record["viewports"].append(measured)
        if side == "after":
            page.evaluate("document.documentElement.classList.add('dark')")
            page.set_viewport_size({"width": 320, "height": 568})
            page.wait_for_timeout(80)
            dark_measurement = measure_overflow(page)
            assert dark_measurement["documentWidth"] <= 320, f"dark theme overflow on {key}: {dark_measurement}"
            record["dark320x568"] = dark_measurement
            page.evaluate("document.documentElement.classList.remove('dark')")
        results.append(record)
    return results


def assert_event_sweeps(browser: Browser, base: str, side: str) -> dict[str, Any]:
    context, page, fixtures = new_page(browser, base, (320, 568), mobile=True)
    route_views = [
        ("review", "NeedsReviewUnbrokenTitleForResponsiveLayout"),
        ("publication", "ApprovedPublicationUnbrokenTitleForResponsiveLayout"),
        ("history", "HistoryUnbrokenTitleForResponsiveLayout"),
        ("listings", "CampusListingsUnbrokenTitleForResponsiveLayout"),
    ]
    details: dict[str, Any] = {"viewport": {"width": 320, "height": 568}, "views": [], "tabSequence": [], "screenshots": {}}
    for view, title_prefix in route_views:
        open_route(page, base, f"/admin-dashboard/events?view={view}", title_prefix)
        if view == "listings":
            cards = page.locator("[data-testid^='campus-event-card-']")
            if cards.count() == 0:
                cards = page.locator("main .bg-card.rounded-2xl")
        else:
            cards = page.locator("[data-testid^='event-layout-card-']")
        count = cards.count()
        assert count > 0, f"{view} has no populated fixture cards at {base}"
        last = cards.nth(count - 1)
        last.scroll_into_view_if_needed()
        page.wait_for_timeout(80)
        overflow = measure_overflow(page)
        card_metrics = last.evaluate("card => ({clientWidth: card.clientWidth, scrollWidth: card.scrollWidth, top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom})")
        status_badge = last.locator("div.rounded-full.border").first
        status_rect = bounds(status_badge) if status_badge.count() else None
        open_actions = last.get_by_role("button", name="Open map preview") if view != "listings" else last.get_by_role("button", name="Edit")
        if open_actions.count():
            open_actions.first.scroll_into_view_if_needed()
            main_scroller(page).evaluate("el => { el.scrollTop = el.scrollHeight; }")
            page.wait_for_timeout(50)
        status_rect = bounds(status_badge) if status_badge.count() else None
        action_rect = bounds(open_actions.first) if open_actions.count() else None
        visible_gap = None
        main_rect = bounds(main_scroller(page))
        if action_rect:
            visible_gap = round(main_rect["bottom"] - action_rect["bottom"], 1) if main_rect else None
        if side == "after":
            assert overflow["documentWidth"] <= 320, f"document overflow in {view}: {overflow}"
            assert card_metrics["scrollWidth"] <= card_metrics["clientWidth"] + 1, f"card overflow in {view}: {card_metrics}"
            assert status_rect and main_rect and main_rect["top"] <= status_rect["top"] and status_rect["bottom"] <= main_rect["bottom"] and 0 <= status_rect["left"] and status_rect["right"] <= 320, f"status badge not visible with the final row action in {view}: {status_rect} / {main_rect}"
            assert action_rect and main_rect and main_rect["top"] <= action_rect["top"] and action_rect["bottom"] <= main_rect["bottom"] and 0 <= action_rect["left"] and action_rect["right"] <= 320, f"primary action not visible in {view}: {action_rect} / {main_rect}"
            assert visible_gap is not None and visible_gap >= 8, f"no visible space after last action in {view}: {visible_gap}"
        if view == "review" and side in ("before", "after"):
            details["screenshots"]["mobileReviewFinal"] = screenshot(page, side, "mobile-review-final-row.png")
        if view == "review" and side == "after":
            review_trigger = last.get_by_role("button", name="Review submission")
            review_trigger.tap()
            touch_dialog = page.get_by_role("dialog").filter(has=page.get_by_role("heading", name="Review Event Layout"))
            touch_dialog.wait_for(state="visible")
            touch_dialog.get_by_role("button", name="Cancel").tap()
            page.wait_for_timeout(100)
            details["reviewFocusReturn"] = review_trigger.evaluate("element => document.activeElement === element")
            assert details["reviewFocusReturn"], "review dialog did not return focus to its trigger"
            details["touchReviewOpenCancel"] = True
        if view == "listings" and side in ("before", "after"):
            details["screenshots"]["mobileCampusListingFinal"] = screenshot(page, side, "mobile-campus-listing-final-row.png")
        details["views"].append({
            "view": view, "cards": count, "overflow": overflow, "lastCard": card_metrics,
            "lastStatusBadge": status_rect, "statusText": status_badge.inner_text() if status_badge.count() else None,
            "lastAction": action_rect, "visibleGapAfterAction": visible_gap,
        })

    # Start on Needs review, scroll the long list, then use the real keyboard tab handler.
    open_route(page, base, "/admin-dashboard/events?view=review", "Needs review")
    page.locator("#admin-events-tab-review").focus()
    main_scroller(page).evaluate("el => { el.scrollTop = el.scrollHeight; }")
    for expected in ("publication", "history", "listings", "review"):
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(180)
        selected = page.locator("[role='tab'][aria-selected='true']").get_attribute("id")
        scroll_top = main_scroller(page).evaluate("el => el.scrollTop")
        assert selected == f"admin-events-tab-{expected}", f"ArrowRight tab sequence expected {expected}, got {selected}"
        if side == "after":
            assert scroll_top <= 1, f"tab switch to {expected} did not reset the scroll position"
        details["tabSequence"].append({"view": expected, "selectedTabId": selected, "scrollTopAfterSwitch": scroll_top})
        main_scroller(page).evaluate("el => { el.scrollTop = el.scrollHeight; }")

    page.set_viewport_size({"width": 667, "height": 375})
    open_route(page, base, "/admin-dashboard/events?view=review", "Needs review")
    first_card = page.locator("[data-testid^='event-layout-card-']").first
    first_card.get_by_role("button", name="Review submission").click()
    review_dialog = page.get_by_role("dialog").filter(has=page.get_by_role("heading", name="Review Event Layout"))
    review_dialog.wait_for(state="visible")
    page.wait_for_timeout(160)
    dialog_rect = bounds(review_dialog)
    footer_button = review_dialog.get_by_role("button", name="Approve", exact=True)
    body_scroll = review_dialog.locator(".overflow-y-auto").first
    body_metrics = body_scroll.evaluate("el => ({clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop})")
    style = review_dialog.evaluate("el => ({left: el.style.left, right: el.style.right, width: el.style.width, maxHeight: el.style.maxHeight})")
    body_scroll.evaluate("el => { el.scrollTop = el.scrollHeight; }")
    footer_rect = bounds(footer_button)
    if side == "after":
        assert dialog_rect and dialog_rect["left"] >= 8 and dialog_rect["right"] <= 659 and dialog_rect["top"] >= 0 and dialog_rect["bottom"] <= 375, f"review dialog outside landscape viewport: {dialog_rect}"
        assert "safe-area-inset-left" in style["left"] and "safe-area-inset-right" in style["right"], f"review dialog missing horizontal safe areas: {style}"
        assert body_metrics["scrollHeight"] > body_metrics["clientHeight"], f"review dialog content is not scrollable: {body_metrics}"
        assert footer_rect and footer_rect["bottom"] <= 375 and footer_rect["top"] >= 0, f"review footer not reachable in landscape: {footer_rect}"
    if side in ("before", "after"):
        details["screenshots"]["landscapeReviewDialog"] = screenshot(page, side, "landscape-review-dialog-footer.png")
    details["landscapeReviewDialog"] = {"dialogRect": dialog_rect, "horizontalSafeAreaStyles": style, "body": body_metrics, "approveButton": footer_rect}
    page.get_by_role("button", name="Cancel").click()

    # Modal map preview and direct preview are read-only. Their API is stubbed locally.
    page.set_viewport_size({"width": 667, "height": 375})
    open_route(page, base, "/admin-dashboard/events?view=review", "Needs review")
    first_card = page.locator("[data-testid^='event-layout-card-']").first
    review_trigger = first_card.get_by_role("button", name="Review submission")
    review_trigger_handle = review_trigger.element_handle()
    review_trigger.click()
    review_dialog = page.get_by_role("dialog").filter(has=page.get_by_role("heading", name="Review Event Layout"))
    review_dialog.wait_for(state="visible")
    preview_trigger = review_dialog.get_by_role("button", name="Preview requested maps")
    preview_trigger_handle = preview_trigger.element_handle()
    preview_trigger.click()
    preview_dialog = page.get_by_role("dialog", name="Requested map preview")
    preview_dialog.wait_for(state="visible")
    preview_box = bounds(preview_dialog)
    canvas_box = None
    preview_svgs = preview_dialog.locator("svg[viewBox]")
    svg_boxes: list[dict[str, float]] = []
    for index in range(preview_svgs.count()):
        candidate = bounds(preview_svgs.nth(index))
        if candidate:
            svg_boxes.append(candidate)
        if candidate and candidate["width"] > 70 and candidate["height"] > 50 and (not canvas_box or candidate["width"] * candidate["height"] > canvas_box["width"] * canvas_box["height"]):
            canvas_box = candidate
    close_box = bounds(preview_dialog.get_by_role("button", name="Close map preview"))
    layout_toggle = preview_dialog.get_by_role("button", name="2D layout")
    pin_button = preview_dialog.get_by_role("button", name="Add pin")
    preview_text = preview_dialog.inner_text()
    preview_inset = preview_dialog.evaluate("element => element.style.inset")
    details["screenshots"]["landscapeModalPreview"] = screenshot(page, side, "landscape-modal-preview.png")
    if side == "after":
        assert preview_box and preview_box["left"] >= 0 and preview_box["right"] <= 667 and preview_box["bottom"] <= 375
        assert "safe-area-inset-left" in preview_inset and "safe-area-inset-right" in preview_inset, f"modal preview missing horizontal safe areas: {preview_inset}"
        assert close_box and close_box["bottom"] <= 375
        assert layout_toggle.is_visible() and pin_button.is_visible(), "modal event preview controls are not reachable in landscape"
        assert "Preview unavailable" not in preview_text
    details["landscapeModalPreview"] = {"dialogRect": preview_box, "horizontalSafeAreaStyle": preview_inset, "canvasRect": canvas_box, "svgRects": svg_boxes, "layoutToggle": bounds(layout_toggle), "pinButton": bounds(pin_button), "closeButton": close_box, "text": preview_text[:800]}
    preview_dialog.get_by_role("button", name="Close map preview").click()
    page.wait_for_timeout(100)
    details["previewFocusReturn"] = preview_trigger_handle.evaluate("element => document.activeElement === element")
    if side == "after":
        assert details["previewFocusReturn"], "map preview dialog did not return focus to its trigger"
    review_dialog.get_by_role("button", name="Cancel").click()
    page.wait_for_timeout(100)
    details["landscapeReviewFocusReturn"] = review_trigger_handle.evaluate("element => document.activeElement === element")
    if side == "after":
        assert details["landscapeReviewFocusReturn"], "review dialog did not return focus to its trigger after preview"

    # Publication settings are read-only until an action is activated.
    open_route(page, base, "/admin-dashboard/events?view=publication", "Approved & publication")
    publication_trigger = page.locator("[data-testid^='event-layout-card-']").first.get_by_role("button", name="Manage publication")
    publication_trigger.click()
    publication_dialog = page.get_by_role("dialog", name="Manage event publication")
    publication_dialog.wait_for(state="visible")
    publication_body = publication_dialog.locator("div.overflow-y-auto").first
    publication_body.evaluate("element => { element.scrollTop = element.scrollHeight; }")
    page.wait_for_timeout(60)
    publication_rect = bounds(publication_dialog)
    publication_cancel = bounds(publication_dialog.get_by_role("button", name="Cancel"))
    publication_schedule = bounds(publication_dialog.get_by_role("button", name="Save schedule"))
    publication_close = bounds(publication_dialog.get_by_role("button", name="Close publication settings"))
    details["screenshots"]["landscapePublicationDialog"] = screenshot(page, side, "landscape-publication-dialog-footer.png")
    details["landscapePublicationDialog"] = {
        "dialog": publication_rect,
        "body": publication_body.evaluate("element => ({clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop})"),
        "cancel": publication_cancel, "saveSchedule": publication_schedule, "close": publication_close,
    }
    if side == "after":
        assert publication_rect and publication_rect["top"] >= 0 and publication_rect["bottom"] <= 375
        assert publication_cancel and publication_cancel["bottom"] <= 375
        assert publication_schedule and publication_schedule["bottom"] <= 375
        assert publication_close and publication_close["bottom"] <= 375
    publication_dialog.get_by_role("button", name="Cancel").click()
    page.wait_for_timeout(100)
    details["publicationFocusReturn"] = publication_trigger.evaluate("element => document.activeElement === element")
    if side == "after":
        assert details["publicationFocusReturn"], "publication dialog did not return focus to its trigger"

    open_route(page, base, "/admin-dashboard/event-layouts/event-pending-00/preview", LONG_TITLE[:20])
    direct_heading = page.get_by_role("heading", name=LONG_TITLE, exact=False)
    direct_heading.wait_for(state="visible")
    direct_layout_toggle = page.get_by_role("button", name="2D layout")
    details["directPreview"] = {"titleVisible": direct_heading.is_visible(), "viewport": page.evaluate("() => ({width: innerWidth, height: innerHeight})"), "layoutToggle": bounds(direct_layout_toggle) if direct_layout_toggle.count() else None}
    if side == "after":
        assert direct_layout_toggle.is_visible(), "direct event preview map controls are unavailable"
    page.keyboard.press("Tab")
    details["directPreview"]["keyboardFocusTag"] = page.evaluate("() => document.activeElement?.tagName")

    if side == "after":
        page.set_viewport_size({"width": 667, "height": 375})
        open_route(page, base, "/admin-dashboard/events?view=listings", "Campus Events")
        listing_create_trigger = page.get_by_role("button", name="New Event")
        listing_create_trigger.click()
        listing_editor = page.get_by_role("dialog", name="Create Event")
        listing_editor.wait_for(state="visible")
        listing_title = listing_editor.get_by_label("Event Title *")
        listing_body = listing_editor.locator(".overflow-y-auto").first
        listing_body.evaluate("element => { element.scrollTop = element.scrollHeight; }")
        page.wait_for_timeout(60)
        editor_rect = bounds(listing_editor)
        editor_cancel = bounds(listing_editor.get_by_role("button", name="Cancel"))
        editor_create = bounds(listing_editor.get_by_role("button", name="Create Event"))
        details["screenshots"]["landscapeListingEditor"] = screenshot(page, side, "landscape-listing-editor-footer.png")
        details["landscapeListingEditor"] = {
            "dialog": editor_rect,
            "body": listing_body.evaluate("element => ({clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop})"),
            "titleFocused": listing_title.evaluate("element => document.activeElement === element"),
            "cancel": editor_cancel, "create": editor_create,
        }
        assert editor_rect and editor_rect["top"] >= 0 and editor_rect["bottom"] <= 375
        assert editor_cancel and editor_cancel["bottom"] <= 375
        assert editor_create and editor_create["bottom"] <= 375
        assert details["landscapeListingEditor"]["titleFocused"], "listing editor did not focus its title field"
        listing_editor.get_by_role("button", name="Cancel").click()
        page.wait_for_timeout(100)
        details["listingEditorFocusReturn"] = listing_create_trigger.evaluate("element => document.activeElement === element")
        assert details["listingEditorFocusReturn"], "listing editor did not return focus to its trigger"

        # Resizing the CSS viewport emulates the visible area left by a mobile soft keyboard.
        listing_create_trigger.click()
        listing_editor = page.get_by_role("dialog", name="Create Event")
        listing_editor.wait_for(state="visible")
        listing_title = listing_editor.get_by_label("Event Title *")
        page.set_viewport_size({"width": 320, "height": 300})
        page.wait_for_timeout(80)
        listing_body = listing_editor.locator(".overflow-y-auto").first
        listing_body.evaluate("element => { element.scrollTop = element.scrollHeight; }")
        editor_cancel = bounds(listing_editor.get_by_role("button", name="Cancel"))
        editor_create = bounds(listing_editor.get_by_role("button", name="Create Event"))
        editor_rect = bounds(listing_editor)
        details["keyboardHeightListingEditor"] = {
            "viewport": page.evaluate("() => ({width: innerWidth, height: innerHeight})"),
            "dialog": editor_rect,
            "body": listing_body.evaluate("element => ({clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop})"),
            "titleFocused": listing_title.evaluate("element => document.activeElement === element"),
            "cancel": editor_cancel, "create": editor_create,
        }
        assert editor_rect and editor_rect["top"] >= 0 and editor_rect["bottom"] <= 300
        assert editor_cancel and editor_cancel["bottom"] <= 300
        assert editor_create and editor_create["bottom"] <= 300
        assert details["keyboardHeightListingEditor"]["titleFocused"]
        listing_editor.get_by_role("button", name="Cancel").click()
        page.set_viewport_size({"width": 667, "height": 375})
        open_route(page, base, "/admin-dashboard/events?view=listings", "Campus Events")
        archive_trigger = page.get_by_role("button", name="Archive", exact=True).first
        archive_trigger.click()
        archive_dialog = page.get_by_role("alertdialog", name="Archive Event?")
        archive_dialog.wait_for(state="visible")
        archive_rect = bounds(archive_dialog)
        archive_cancel = bounds(archive_dialog.get_by_role("button", name="Cancel"))
        archive_confirm = bounds(archive_dialog.get_by_role("button", name="Archive Event"))
        details["screenshots"]["landscapeArchiveConfirmation"] = screenshot(page, side, "landscape-archive-confirmation.png")
        details["landscapeArchiveConfirmation"] = {"dialog": archive_rect, "cancel": archive_cancel, "confirm": archive_confirm}
        assert archive_rect and archive_rect["top"] >= 0 and archive_rect["bottom"] <= 375
        assert archive_cancel and archive_cancel["bottom"] <= 375
        assert archive_confirm and archive_confirm["bottom"] <= 375
        archive_dialog.get_by_role("button", name="Cancel").click()
        page.wait_for_timeout(100)
        details["archiveFocusReturn"] = archive_trigger.evaluate("element => document.activeElement === element")
        assert details["archiveFocusReturn"], "archive confirmation did not return focus to its trigger"

    details["writeAttempts"] = list(fixtures.write_attempts)
    if side == "after":
        assert not details["writeAttempts"], f"browser sweep attempted to write fixture data: {details['writeAttempts']}"
    details["pageErrors"] = [request for request in fixtures.requests if request.startswith("PAGEERROR ")]
    if side == "after":
        assert not details["pageErrors"], f"page errors during responsive event checks: {details['pageErrors']}"
    page.close()
    context.close()
    return details


def assert_map_builder(browser: Browser, base: str, side: str) -> dict[str, Any]:
    context, page, fixtures = new_page(browser, base, (1536, 780))
    open_route(page, base, "/admin-dashboard/map-builder", "Campus")
    results: dict[str, Any] = {"viewport": {"width": 1536, "height": 780}}

    setup_card = page.get_by_role("button", name="Open campus Canvas Setup QA Campus")
    setup_card.wait_for(state="visible")
    setup_card.click()
    setup_dialog = page.get_by_role("dialog")
    setup_dialog.wait_for(state="visible")
    results["setupWizard"] = {
        "dialog": bounds(setup_dialog),
        "buttons": [button.inner_text().strip() for button in setup_dialog.get_by_role("button").all()],
    }
    if side == "after":
        box = results["setupWizard"]["dialog"]
        assert box and box["left"] >= 0 and box["right"] <= 1536 and box["top"] >= 0 and box["bottom"] <= 780, f"canvas setup wizard outside viewport: {box}"
    setup_dialog.locator("button").first.click()

    map_card = page.get_by_role("button", name="Open campus Main Map QA Campus")
    map_card.wait_for(state="visible")
    map_card.click()
    page.locator("[data-testid='campus-structure-loading']").wait_for(state="detached", timeout=30000)
    page.locator("svg[viewBox]").last.wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(600)
    main_box = bounds(page.locator("main"))
    boundary = page.get_by_test_id("campus-canvas-boundary")
    boundary.wait_for(state="visible", timeout=30000)
    large_canvas = boundary.evaluate("""element => {
      const svg = element.closest('svg');
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      return {x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom};
    }""")
    svgs = page.locator("svg")
    results["canvas"] = {"main": main_box, "canvas": large_canvas, "svgCount": svgs.count()}
    if side == "after":
        assert main_box and main_box["height"] >= 500, f"Map Builder main area collapsed: {main_box}"
        assert large_canvas and large_canvas["height"] >= 300, f"Map Builder canvas did not fill its available area: {large_canvas}"
        assert large_canvas["bottom"] <= 780, f"Map Builder canvas extends beyond viewport: {large_canvas}"
    if side in ("before", "after"):
        screenshot(page, side, "desktop-map-builder-canvas.png")
    page.close()
    context.close()
    return results


def run_side(browser: Browser, side: str, base: str) -> dict[str, Any]:
    context, page, fixtures = new_page(browser, base, (1536, 780))
    matrix = assert_clear_pages(page, base, side)
    errors = [request for request in fixtures.requests if request.startswith("PAGEERROR ")]
    context.close()
    geometry = measure_primary_geometry(browser, base, side)
    event_results = assert_event_sweeps(browser, base, side)
    map_results = assert_map_builder(browser, base, side)

    # Desktop Reports metrics and matching evidence shot.
    context, page, fixtures = new_page(browser, base, (1536, 780))
    open_route(page, base, "/admin-dashboard/reports", "Reports")
    report_button = page.get_by_role("button", name="View report: Damaged facility report 01")
    report_button.wait_for(state="visible")
    report_button_rect = bounds(report_button)
    report_row = report_button.locator("xpath=../..")
    status = bounds(report_row.get_by_text("Pending", exact=True).first)
    date = bounds(report_row.locator("span.text-\\[11px\\]").first) if report_row.locator("span.text-\\[11px\\]").count() else None
    if side == "after":
        assert report_button_rect and report_button_rect["bottom"] <= 780, f"first report action not in initial desktop viewport: {report_button_rect}"
        center_y = lambda rect: rect["top"] + rect["height"] / 2
        assert status and date and abs(center_y(status) - center_y(report_button_rect)) <= 2 and abs(center_y(date) - center_y(report_button_rect)) <= 2, f"status, date, and View details are not aligned on desktop: {status} / {date} / {report_button_rect}"
        assert status["right"] <= date["left"] and date["right"] <= report_button_rect["left"], f"report metadata is not in one horizontal row: {status} / {date} / {report_button_rect}"
    if side in ("before", "after"):
        screenshot(page, side, "desktop-reports-first-result.png")
    reports = {"status": status, "viewDetails": report_button_rect, "date": date}
    page.close()
    context.close()

    return {
        "side": side,
        "base": base,
        "matrix": matrix,
        "primaryGeometry": geometry,
        "events": event_results,
        "mapBuilder": map_results,
        "reports": reports,
        "pageErrors": errors,
        "emulation": {"browser": browser.browser_type.name, "version": browser.version, "headless": True, "physicalDevice": False},
    }


def main() -> None:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    selected_side = sys.argv[1] if len(sys.argv) > 1 else None
    if selected_side is not None and selected_side not in BASES:
        raise SystemExit(f"Choose one of: {', '.join(BASES)}")
    active_bases = {side: base for side, base in BASES.items() if selected_side is None or side == selected_side}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        results = [run_side(browser, side, base) for side, base in active_bases.items()]
        browser.close()
    outfile = EVIDENCE / "browser-sweep-results.json"
    outfile.write_text(json.dumps({"timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "viewports": VIEWPORTS, "results": results}, indent=2), encoding="utf-8")
    print(json.dumps({"results": str(outfile), "sides": [result["side"] for result in results], "viewports": len(VIEWPORTS)}, indent=2))


if __name__ == "__main__":
    main()
