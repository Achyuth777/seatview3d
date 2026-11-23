# SeatView3D — Phase 3 Report (Stadium venue type)

Date: 2026-11-22.

## What was built

A second venue type, a football stadium, kept separate from the cinema as required. The two share only `engine/common` (vector maths, grades, and one sightline-clearance function).

- **`engine/stadium/bowl.ts`, plan geometry.** Every row follows the pitch rectangle offset outward by a constant distance: straight sides, plus quarter circles centred on the corner flags.
  - So the horizontal distance from any seat to the nearest touch/goal line equals that row's offset.
  - That line is the Green Guide focal point for football ("nearest touchline", §12.3), so it is correct for every seat, corners included.
- **`engine/stadium/layout.ts`, riser solver.** Risers are solved row by row from the Green Guide formula `C = D(N+R)/(D+T) − R` (Diagram 12.1, p.109), rearranged to `N = (C+R)(D+T)/D − R`.
  - Each riser is clamped between the tier's minimum rake and the **34° maximum** (§13.11), and rounded up to 10 mm without passing the cap.
  - An upper tier's first row clears the last row of the tier below by the same rule, plus a concourse lift.
  - Sections: 28 per tier (6 per side, 4 per end, 2 per corner) → 101–128 and 201–228. Seat IDs are `section-row-seat`.
- **`engine/stadium/metrics.ts`, per-seat values:**
  - C value
  - distance to the focal point
  - distance to the centre spot
  - **distance to the far corner** (FIFA 150 m optimum / 190 m max)
  - viewing angles down to the centre spot and touchline
  - horizontal width of the pitch in view
  - row rake
  - eye height
- **3D scene** (`render/StadiumScene.tsx`):
  - true-scale pitch markings and goals (IFAB Law 1 dimensions)
  - run-off apron and stepped terraces
  - 46,268 instanced seats facing the pitch
  - fly-in to the eye point (tread + 1.15 m), looking at the centre spot
- **Venue switch:** Cinema / Stadium buttons, also available as `?venue=stadium`.

## Demo stadium parameters (`DEMO_FOOTBALL_STADIUM`)

| Parameter | Value | Basis |
|-----------|-------|-------|
| Pitch | 105 × 68 m | FIFA Stadium Guidelines §5.3 |
| Run-off to front row | 8 m on all sides | [assumed] |
| Row depth T / seat width | 0.80 m / 0.50 m | Green Guide §12.13 recommended values |
| Eye position | 0.15 m from the rear of the row; 1.20 m for C calculations, 1.15 m for the camera | [secondary] Parametric Monkey; your spec |
| Lower tier | 25 rows, front tread 1.0 m, target C 90 mm, minimum rake 15° | rows, front height and minimum rake [assumed]; C 90 mm [secondary] |
| Upper tier | 20 rows, 2.0 m setback, 3.0 m lift, target C 90 mm, minimum rake 20° | [assumed] |
| Maximum rake | 34° | Green Guide §13.11 |

**Solved result:**
- Lower-tier risers run from 0.31 m (row 2) to 0.41 m (row 25), with rake from 21° to 27°, reaching a tread height of 9.86 m.
- Upper-tier risers run from 0.47 to 0.50 m (30°–32°), reaching 22.05 m.
- **Every row reaches C ≥ 90 mm** (90–100 mm). The rake cap is never binding in this configuration.
- Grades across the 46,268 seats: **31,992 good, 14,276 acceptable, 0 unacceptable**. All "acceptable" seats are graded down only because they are 150–190 m from the far corner. The farthest seat is 172.5 m.

## Screenshots (1600 × 900, `docs/screenshots/`)

No standard defines a "best" stadium seat, so the selection rules are mine:

| Shot | Seat | Rule | C | Far corner | Down to centre | Pitch in view | Grade |
|------|------|------|---|-----------|-----|-----|-----|
| **Best**: `stadium-best-103-17-35.png` | 103-17-35 | On the halfway line, upper part of the lower tier [assumed preference] | 97 mm | 104.1 m | 8.0° | 135.6° | good |
| **Middle**: `stadium-middle-108-13-1.png` | 108-13-1 | Middle of the corner arc (on the diagonal from the corner flag), mid-height of the lower tier | 93 mm | 143.2 m | 4.5° | 74.6° | good |
| **Worst**: `stadium-worst-208-20-20.png` | 208-20-20 | Largest far-corner distance of any seat (back row of the upper tier, corner) | 94 mm | 172.5 m | 12.1° | 57.7° | acceptable |
| Extra: `stadium-overview.png` | — | Overview of the bowl | | | | | |

## Verification (real command output)

```
$ npx vitest run
 Test Files  2 passed (2)
      Tests  25 passed (25)      # 12 cinema + 13 stadium

$ npm run build
✓ built in 420ms
```

The stadium tests include:
- The Green Guide formula written literally and compared with the shared function. Hand calculation: D=20, N=0.45, R=8, T=0.8 → C = 0.125 m.
- Row 2 riser by hand: `(0.09 + 2.2)·9.45/8.65 − 2.2 = 0.3018` → built 0.31 m.
- Every sampled point of an offset row lies exactly o from the pitch lines.
- Rake ≤ 34° everywhere.
- Target C met wherever the cap does not bind.
- Upper tier starts at least `lift` higher, at the correct setback.
- Unique seat IDs.
- Pitch angle from the halfway front row = 2·atan(52.5/8.65).

**In the browser pane:**
- The stadium renders with no console errors.
- Computing metrics for all 46,268 seats takes 54 ms.
- A real mouse click on the stand selected Section 207 · Row 10 · Seat 19 and flew the camera in.

## Bugs hit and fixes used

1. **Clicks in the overview selected nothing.** From the overview each seat is about one pixel wide.
   - Fix: clicking the terrace mesh now selects the nearest seat within 1.5 m of the hit point.
   - While debugging I confirmed the raycaster itself works. My first test clicks landed just behind the rim of the far stand, where there is no geometry; I worked the ray through by hand to check.
   - All debug logging has been removed.
2. **The headless-capture edge strip from Phase 2 is still present** (dark band at the bottom and right of seat views). It only affects automated screenshots.

## Files changed in this phase

```
new   src/engine/stadium/{params,bowl,layout,metrics}.ts
new   src/render/{StadiumScene.tsx,pitchTexture.ts}
new   src/ui/{StadiumReadout.tsx,MetricRow.tsx}
new   tests/stadium.test.ts
new   docs/PHASE3_REPORT.md, docs/screenshots/stadium-*.png
edit  src/engine/common/geometry.ts   (+ clearanceOverFront, shared by both venues)
edit  src/engine/cinema/metrics.ts    (uses clearanceOverFront; results unchanged, tests pass)
edit  src/ui/Readout.tsx              (uses shared MetricRow)
edit  src/App.tsx, src/style.css      (venue switch; per-venue views)
edit  index.html (title), README.md, CREDITS.md
```

## Simplifications and open questions

1. **Not modelled:**
   - roof and its supports (a roof could block upper-row views)
   - advertising boards at the pitch edge (the front row's C is shown as "—")
   - vomitories, gangway steps and wheelchair platforms
   - cantilevered upper tier (it sits behind the lower tier, not over it)
   - Should any of these come before the booking flow?
2. **Football only.** The engine takes any pitch length, width and run-off, but the focal-point rule and markings are football-specific. The research also covered NBA (28.65 × 15.24 m) and cricket (oval, focal point further infield). Add those presets later?
3. **Uniform 8 m run-off:** I didn't verify FIFA's run-off figures this session. Do you want side and end run-offs set separately?
4. **Seat view looks at the centre spot.** An alternative is to look along the seat's facing direction (perpendicular to the stand). Which do you prefer?
5. **Next phase as planned: booking flow** (seat availability, holds, cart), with no backend yet. Then the backend phase.
