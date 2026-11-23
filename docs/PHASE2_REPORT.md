# SeatView3D — Phase 2 Report (Cinema demo)

Date: 2026-11-22.

## What was built

A runnable local demo of one cinema auditorium, generated from parameters in metres:

- **Engine** (`src/engine/cinema`, pure TS):
  - `buildCinemaLayout(params)` produces rows, tread heights, seat positions and per-seat eye points.
  - Tread heights are **solved row by row** so each row clears the eye of the row in front by ≥ 200 mm on the sightline to the bottom of the picture (UNIC §4.7 "good").
  - `computeCinemaMetrics(layout, seat)` returns:
    - horizontal screen angle `atan((W/2−x)/d) + atan((W/2+x)/d)`
    - eye-to-screen-centre distance and distance to the screen plane
    - off-axis angle
    - vertical angles to the picture centre and top
    - sightline clearance `c = Y_n·X_{n−1}/X_n − Y_{n−1}`
  - Each metric is graded against UNIC/THX/SMPTE bands.
- **3D scene** (React Three Fiber):
  - stepped treads and a room shell
  - a 14 × 5.86 m screen with a true-scale 1 m grid
  - 336 instanced, clickable seats
- **Camera:** on click, camera-controls animates to the seat's eye point (tread + 1.15 m) looking at the screen centre. The eye is locked in seat view, and orbiting is allowed in the overview.
- **Readout panel** with every metric, its grade and the source of its band.

## Demo hall parameters (`DEMO_SCOPE_HALL`)

| Parameter | Value | Basis |
|-----------|-------|-------|
| Screen | 14.0 × 5.86 m, 2.39:1, bottom edge 1.0 m | width and bottom edge [assumed]; 2.39 = DCI Scope |
| Rows | 14 (A–O, no I), pitch 1.2 m | UNIC §5.1 (≥ 1.2 m) |
| Row A eye distance | 8.4 m = 0.6 × W | UNIC §4.1 comfort limit |
| Seats | 5 + 14 + 5 per row, 0.6 m pitch, 1.2 m aisles | [assumed] |
| Eye height | 1.15 m camera; 1.20 m for sightline calculations | your spec; UNIC §4.7 |
| Target clearance | 200 mm | UNIC §4.7 "good" |
| Solved risers | 0.26 m (row B) rising to 0.46 m (row O); total rise 4.87 m | computed |

Grade distribution across all 336 seats: **234 good, 98 acceptable, 4 poor, 0 unacceptable**.

## Screenshots (1600 × 900, `docs/screenshots/`)

Selection rules, applied to the computed metrics of all 336 seats:

| Shot | Seat | Rule | Horizontal angle | Off-axis | Vert. to top | c | Distance | Grade |
|------|------|------|-----|-----|-----|-----|-----|-----|
| **Best** — `best-K12.png` | K12 | grade "good", horizontal angle closest to 40° (THX ideal [secondary]) + least off-axis | 40.1° | 0.9° | 7.7° | 204 mm | 19.21 m | good |
| **Middle** — `middle-H6.png` | H6 | middle row (H = 8th of 14), halfway between the centre and the left edge | 43.4° | 13.1° | 11.5° | 202 mm | 17.25 m | good |
| **Worst** — `worst-A1.png` | A1 | largest off-axis + vertical penalty (front-row corner) | 53.5° | 44.0° | 34.2° | — | 12.00 m | acceptable |
| Extra — `lowest-grade-O1.png` | O1 | lowest grade: back-row corner, 29.6° is under SMPTE's 30° [secondary] | 29.6° | 18.6° | — | — | 25.42 m | poor |
| Extra — `overview.png` | — | side overview showing the solved rake | | | | | | |

Note on "worst": A1 grades "acceptable" because every UNIC (primary) limit is met; 44.0° off-axis is just inside the 45° limit. O1 is the only grade below acceptable, and that rests on the SMPTE 30° figure, which I could not verify at primary level. Both are included.

## Verification (real command output)

```
$ npx vitest run
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ npm run build          # tsc --noEmit && vite build
dist/assets/index-B2tE8Gch.js   1,194.89 kB │ gzip: 325.05 kB
✓ built in 431ms

$ npm run dev
VITE v8.3.8  ready in 448 ms   ➜  Local: http://localhost:5173/
```

Tests include hand calculations:
- row B tread: `9.6·(0.20+0.20)/8.4 − 0.20 = 0.257` → built 0.26 m
- on-axis angle at 0.6·W: `2·atan(7/8.4) = 79.61°`
- 90° at d = W/2
- every row's clearance ≥ 200 mm

A real mouse click on a seat in the browser selected H13 and flew the camera in.

## Bugs hit and fixes used

1. **Camera did not move on first load.** React StrictMode mounts effects twice in dev. My cleanup disposed the camera-controls instance, then the second mount reused the disposed one from `useMemo`. Fix: create the controls inside `useEffect` and keep them in state.
2. **Stripe/moiré artefacts on the screen in headless captures only.** They appeared under Chrome's software renderer (SwiftShader), not in the GPU browser. Fix: capture with `--enable-gpu --use-angle=d3d11`. I also made the screen texture power-of-two (2048 × 1024).
3. **Headless captures leave a ~95 px dark strip at the bottom and ~15 px at the right of seat views** (the overview fills the frame).
   - Attempt 1: page sized to `100vw/100vh`.
   - Attempt 2: R3F `resize={{ debounce: 0 }}`.
   - After 2 failed attempts I searched. Chrome's ["Configure virtual screens in Headless mode"](https://developer.chrome.com/docs/automation-and-testing/headless-screen-config) docs and a [ChromeDriver thread](https://groups.google.com/g/chromedriver-users/c/Yro2uGBU1fg) on new-headless clamping the window to the screen work area suggested `--screen-info={1920x1200}`. Tried; the strip remains.
   - This only affects headless capture; the app fills the window in a normal browser. Left as a known capture artefact; it does not cover any of the scene that matters.

## Files

```
seatview3d/
  package.json, package-lock.json, tsconfig.json, vite.config.ts, index.html, .gitignore
  README.md, CREDITS.md
  .claude/launch.json                 (dev-server config for the app's preview pane)
  src/main.tsx, src/App.tsx, src/style.css
  src/engine/common/geometry.ts
  src/engine/cinema/{params,layout,metrics}.ts
  src/render/{CinemaScene.tsx,CameraRig.tsx,screenTexture.ts}
  src/ui/Readout.tsx
  tests/cinema.test.ts
  docs/PHASE1_RESEARCH.md, docs/PHASE2_REPORT.md, docs/screenshots/*.png
```

## Open questions

1. **Camera FOV:** I used a 60° vertical field of view [assumed], so seat views show about 91° horizontally at 16:9. Keep it, or match the FOV to human vision or a specific display?
2. **Simplifications to confirm:**
   - flat screen
   - straight (not curved) rows
   - seats aligned in columns, so clearance is checked against the seat directly in front
   - no projector hazard zone or wheelchair positions
3. **Bundle size:** 1.19 MB (325 kB gzipped), mostly three.js. Fine for a demo; code-splitting can come later.
4. **No project LICENSE file yet.** Which license do you want for SeatView3D?
5. **Next phase:** stadium venue type, as planned. It will reuse `engine/common` and add `engine/stadium` (Green Guide C-value riser solver, 34° cap).
