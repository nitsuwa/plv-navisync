# Event editor: desktop and mobile check

Use a disposable draft or copy of an existing event. These changes require no SQL query.

1. **Place an item.** Open Campus Grounds in 3D, choose Add item → Chair. Check the crosshair on the map, the “Placing Chair” strip and translucent preview. Moving the pointer must not add an item. Click/tap once to place; the tool returns to Move. Escape or Cancel must leave the draft unchanged.
2. **Place repeatedly.** Choose Chair again and enable Keep placing. Place three chairs, then Undo once. Exactly one chair should disappear. Cancel the placement mode. Repeat with Label and compare the feedback in 2D. On a phone, try a single tap and a two-finger camera gesture.
3. **Compare the views.** Switch between 2D and 3D and between the campus/floor locations. Confirm item positions/counts remain consistent. New outdoor assets use smaller approximate reference proportions. The default camera shows the whole map; use Focus to inspect a selected item.
4. **Edit size.** Select a table and open Details. Desktop uses a side panel; phones/tablets use a bottom sheet. Change Width and commit with Enter or blur. With Lock proportions enabled, Depth changes proportionally. Turn it off to adjust independently. Test the external resize handle in 2D and Resize in 3D. Undo must restore the prior footprint. Chairs/equipment offer reference variants instead of free stretching.
5. **Fix an old oversized chair.** Existing saved dimensions remain unchanged automatically. Select the old chair → Details → Reset to standard size. Check its centered footprint and smaller outdoor model. Undo restores the old dimensions. Locked items should reject changes.
6. **Save and reopen.** Save Draft, leave safely and reopen the same draft. Check both views, positions, sizes, variants and labels. If a request fails, the draft should remain visible with Retry; successful saving clears the failure. Edits made while a request is pending remain unsaved until the next successful save.
7. **Check the layout.** Open Review/View checks, then Show items for an issue. The popup should fit the viewport and the camera should frame the referenced items. Published base-map structures remain locked; admin review has no placement/save tools.

Try desktop light/dark themes and phone portrait/landscape. The automated Chromium checks cover 360, 390, 768 and 1440px, real local WebGL, touch and keyboard; a physical Android/iOS device remains useful for GPU/browser-specific behavior.

Sizing is a visual approximation against the current campus/building renderer, not a measured plan or a meter-based calibration.
