# Event map context and final flow audit

Approved in chat on October 8, 2026 (Asia/Manila).

The student map keeps the selected event name, phase, actual map location, and map mode visible in a compact header. Campus overview says Event venues. A requested location says Event layout. A different building/floor says Building map and explains that the selected event has no layout there. The current location marker follows the displayed map, rather than an earlier selection.

Mobile uses one compact header with an explicit Event details action and a scrollable expanded sheet. Desktop uses the same information order in its side panel. Back, Close, and Fit map have clear labels and keyboard focus. Fit map and location changes frame the authored map in the space left by controls and the compact panel; expanding details does not override a user's manual pan/zoom.

Retain the existing navy/white tokens, typography, publication rules, event data, and role permissions. Make targeted event-flow fixes found during the audit. No new database migration or retained QA event is needed.

Audit viewports: 320x568, 360x640, 390x844, 740x390, 768x1024, 1024x768, 1440x900, and 1920x1080; desktop reflow at 200% zoom. Cover long text, reduced motion, nested date/time/map dialogs, Tab/Escape and focus return, loading/errors, reduced viewport with an input focused, expired sessions, offline/reconnect, and owner isolation. Distinguish controlled network/role tests from live read-only checks. Physical phone keyboard and assistive-technology checks remain explicitly unverified unless those devices are available.
