# NaviBuddy visual review package

## Capture source and limits

All images in this review folder are from isolated local review harnesses. Earlier captures render the production Settings page, procedural 3D walker, wardrobe portraits, marker, and companion components with synthetic Student/Guest state and local-only persistence. Current portrait captures use [`review.html`](review.html) and [`ReviewStudio.tsx`](ReviewStudio.tsx), which import the production portrait, 3D preview, and marker components. These are not authenticated production sessions and do not verify Supabase authorization, persistence, or cross-account isolation. Some mobile captures use a constrained 390 px or 360 px layout; browser-panel viewport emulation varied between captures.

The home-removal change was checked with the production StudentHomePage test; a fresh Student Home screenshot was not captured because no authorized Student session was available. The public landing page is not represented as the Student Home.

### Current portrait refinement captures

- [All five updated portraits with Classic 3D and map marker](characters/current-2d-portrait-and-3d-final-harness.png)
- [PLV Uniform 2D and 3D comparison](characters/plv-uniform-2d-3d-portrait-sync-harness.png)
- [Adventurer 2D and 3D comparison](characters/adventurer-2d-3d-portrait-sync-harness.png)
- [390×844 mobile harness capture](mobile/updated-portraits-390x844-harness.png)

## Final captures

The following **Refinement captures** are the current evidence after the PLV polo and Adventurer replacement. Older captures listed below remain as review history and still show Scholar/Varsity styling.

### Refinement captures

- [390×844 full My NaviBuddy studio, Light](mobile/final-studio-mobile-390x844-harness.png)
- [390×844 full My NaviBuddy studio, Dark](mobile/60-studio-mobile-dark-final-harness.png)
- [Save feedback](mobile/final-save-feedback-harness.png)
- [PLV Uniform front](characters/final-plv-uniform-front-harness.png)
- [PLV Uniform side](characters/final-plv-uniform-side-harness.png)
- [PLV Uniform rear and backpack](characters/final-plv-uniform-back-harness.png)
- [Adventurer with visible explorer hat](characters/final-adventurer-3d-front-harness.png)
- [Five outfit 3D comparison contact sheet](characters/five-outfit-3d-front-final-harness.png)
- Individual front views: [Classic](characters/final-classic-3d-front-harness.png), [Casual](characters/final-casual-3d-front-harness.png), [Sporty](characters/final-sporty-3d-front-harness.png), [PLV Uniform](characters/final-plv-uniform-3d-front-harness.png), [Adventurer](characters/final-adventurer-3d-front-harness.png)

- [Desktop My NaviBuddy studio, Light](settings-light/24-studio-desktop-light-final-harness.png)
- [390 px My NaviBuddy studio, Light](mobile/26-studio-390x844-light-final-harness.png)
- [Settings, Light at 390 px](mobile/27-settings-390x844-light-final-harness.png)
- [Settings, Dark at 390 px](mobile/28-settings-390x844-dark-final-harness.png)
- [My NaviBuddy at 360 px, Dark](mobile/29-studio-360x800-dark-final-harness.png)
- [Five rendered 3D outfit comparison](characters/five-outfit-comparison-plv-uniform-final-harness.png)
- [Classic 3D front](characters/30-classic-3d-final-harness.png)
- [PLV Uniform 3D front](characters/31-plv-uniform-front-dark-final-harness.png)
- [PLV Uniform 3D side](characters/32-plv-uniform-side-dark-final-harness.png)
- [PLV Uniform 3D rear and backpack detail](characters/34-plv-uniform-backpacks-detail-final-harness.png)
- [Guest public map companion](companion/05-guest-public-map-classic-final-harness.png)
- [Student Home companion](companion/01-student-home-casual-compact-harness.png)
- [Route-ready reaction](companion/08-route-ready-reaction-final-fullpage-harness.png)
- [Arrival reaction](companion/09-arrival-reaction-final-fullpage-harness.png)
- [Character rotation recording](companion/rotation-demo-harness.webm)

Other earlier review captures are retained as history; prefer the files above when reviewing the renamed PLV Uniform and final mobile composition.

## PLV uniform reference

The current [provided PLV polo photograph](../.cloud-attachments/51a6424816df9767c0e6f97afcd2a108a73a9355000cca970418bfffad806e9c.webp) guided the refinement; it is not used as an in-app asset. The procedural outfit now uses a light-blue short-sleeved collared polo, centered buttons, a subtle chest pocket, navy trousers, and black shoes. It has no tie, ribbon, lanyard, or hanging ornament. The face remains the stylized NaviBuddy and a skirt variant is not implemented.

## Verification notes

- Focused NaviBuddy, Settings, preference, and persistence tests: 18 passed across 4 files.
- Production build passed after the backpack detail change.
- Settings and wardrobe components render at the harness's constrained 390 px and 360 px layouts without document-level horizontal overflow within the constrained root.
- Previous browser emulation measured the demand-rendered preview near 16.6 ms average frame interval with 20.2 ms p95/max across 100 intervals. This is desktop browser emulation, not a physical-device performance result.
- The settings switch thumb was sampled through intermediate CSS `translate` values in the prior audit; it moved from 0 px to 22 px. CSS reduced-motion disables this transition.
- Browser console logs included React DevTools informational output and WebGL `Context Lost` messages during Vite hot reloads. A clean production browser session was not available for this harness-only review.
- 3D preview uses one tab-scoped demand-rendered Canvas; it unmounts when My NaviBuddy is closed. Idle breathing invalidates frames only while that preview is mounted. The shared walker received only the small backpack surface-detail addition; pathfinding, route geometry, camera logic, and campus data were not changed.

