# SeatView3D — Phase 1 Research Report

Date: 2026-11-22. No code written. Every figure is tagged by how it was checked:

- **[primary]**: read in the standard or handbook itself (text extracted from the PDF this session)
- **[secondary]**: from a reputable secondary source; the primary was not readable
- **[assumed]**: an engineering default that I have not sourced; it needs your sign-off

---

## (a) Top 5 repositories

All license data and dates come from the GitHub API (`gh api repos/...`), queried 2026-11-22.

| # | Repo | License | Last commit | Stars | Stack |
|---|------|---------|-------------|-------|-------|
| 1 | [shanja-glinka/cinema-hall-kit](https://github.com/shanja-glinka/cinema-hall-kit) | **0BSD** | 2026-11-12 | 0 | TS, React 19, R3F 9, three ≥0.170 |
| 2 | [whoistorres/stadium-seat-view](https://github.com/whoistorres/stadium-seat-view) | **MIT** | 2026-11-20 | 0 | TS, Vite, vanilla three 0.187 |
| 3 | [yomotsu/camera-controls](https://github.com/yomotsu/camera-controls) | **MIT** | 2026-02-02 | 2.4k | TS, three |
| 4 | [kangkungmozzarella/nontonin-web](https://github.com/kangkungmozzarella/nontonin-web) | **MIT** | 2026-11-13 | 0 | Next.js 16, R3F, Mantine |
| 5 | [alisaitteke/seatmap-canvas](https://github.com/alisaitteke/seatmap-canvas) | **MIT** | 2026-09-07 | 164 | TS, d3 (2D) |

Foundations (not counted in the five): [three.js](https://github.com/mrdoob/three.js) MIT (commit today), [react-three-fiber](https://github.com/pmndrs/react-three-fiber) MIT (2026-10-14), [drei](https://github.com/pmndrs/drei) MIT (2026-09-30), and [Babylon.js](https://github.com/BabylonJS/Babylon.js) Apache-2.0 (2026-11-21) as an alternative.

### What is reusable in each

1. **cinema-hall-kit**: the closest match to the cinema half of this project. I read its source:
   - `packages/core` is framework-free TS. It builds a hall from parameters in metres: screen width, height and elevation; sections; `riserHeight`; `rowSpacing`; `seatPitch`; and `eyeHeight: 1.15` in its templates.
   - It emits a per-seat `eye` point.
   - `metrics.ts` → `computeViewForSeat()` returns the eye-to-screen-centre distance and the horizontal angle the screen fills, `atan2(W/2 − x, d) + atan2(W/2 + x, d)`, including the sagitta of a curved screen.
   - `validation/rules/view-sightline.ts` checks whether any head in front blocks the bottom picture edge.
   - `packages/react` has an R3F `SeatView`.
   - **Caveat:** 10 days old, 2 commits, 0 stars. The code is clean but unproven.
2. **stadium-seat-view**: the closest match to the stadium half. I read its source:
   - Procedural three-tier bowl (54k seats) with a 105 × 68 m pitch.
   - `generateStadium.ts` sizes each riser by **solving the Green Guide C-value formula for N** (comment: *"C = D(N + R)/(D + T) − R, solved for the riser N"*), with a minimum rake and a 35° cap.
   - Includes a focal distance to the nearest touchline, `eyeHeight: 1.2`, and an orbit → section → seat fly-in camera.
   - **Caveats:** 9 commits, days old. It also ships a `venues/stJamesPark.ts` config modelled on a real stadium; we should use generic venues only.
3. **camera-controls**: mature library for animating the camera to a pose (`setLookAt(eye, target, true)` with smooth damping). It covers the fly-to-seat animation, so we don't write our own.
4. **nontonin-web**: cinema booking site with an R3F theatre (`theater/build-scene.ts`, `camera-controller.ts`). Useful as a second reference for R3F scene and camera structure. It is less parametric, and its movie data needs a TMDB API token; we would not use that part.
5. **seatmap-canvas**: 2D d3 seat map with blocks, categories and selection events. A candidate for the 2D picker in the booking-flow phase. Its v1 is marked "no longer developed", but it stays MIT.

### Flagged / excluded

| Repo | Reason |
|------|--------|
| lusob/Stadium3D, dpakravivarman/Cine-Perspective-3D, liENli1203/cinema-seat-3d, Chokylion/stadium-seatview, rolyhudson/Seating_Bowl_Generator, ArupCommon/StaG, thealberthalllw/interactive-seat-map | **No license**, so all rights are reserved. Do not copy. Alternatives: #1 and #2 above. |
| seatlayer/seatlayer-sdk | MIT, but it is a client for a **paid hosted service** (API key, pricing page). Excluded under your no-paid-service rule. |
| hszzhua2/stadium-seat-explorer | MIT, but it models real branded stadiums from estimated data. Risky (trademarks, inaccurate "official" views). Reference only. |
| alireza12t/seatsight | MIT, but it uses a custom canvas renderer plus Swift, with no 3D engine. Idea reference only. |
| virakri/shinkansen-3d-seat-booking-prototype | MIT, but iOS SceneKit, last commit 2019. Not web. |

**GitHub search was thin.** No mature (>100★) open-source 3D venue seat-viewer exists. The two best matches are both under a month old. This supports writing our own engine and treating #1 and #2 as reference implementations, not dependencies.

---

## (b) Formulas and standards

### Cinema (screen model)

Coordinates: origin at the centre of the screen's bottom edge, Y up, Z from the screen towards the audience. Units are metres.

| Item | Value / formula | Source |
|------|-----------------|--------|
| Eye point | `E = (x_seat, y_tread(row) + h_eye, z_row + e_back)` | — |
| Seated eye height | Camera: **1.15 m** (your spec). Sightline calculations: **1.20 m** reference | 1.20 m: UNIC handbook §4.7 [primary]. 1.15 m: your brief, also cinema-hall-kit's default |
| **Horizontal screen angle** (flat screen, eye offset x, depth d) | `θh = atan((W/2 − x)/d) + atan((W/2 + x)/d)` | Geometry. Same formula as cinema-hall-kit `metrics.ts` |
| Curved screen | Use the chord at depth `d − s`, sagitta `s = R − √(R² − (W/2)²)` | cinema-hall-kit applies the sagitta. Exact arc integration [assumed] is better. |
| Front-row FOV limit (2.39:1) | Comfortable `θh < 80°` → `D1 ≥ 0.6·W`. Maximum `90°` → `D1 ≥ 0.5·W` | UNIC §4.1 [primary] |
| Back-row FOV target | SMPTE: ≥ **30°**. THX: **36°** from the farthest seat | SMPTE EG 18-1994 (**withdrawn 2003**; the PDF is a scan, so I could not read it) and THX, both via secondary pages [secondary] |
| Off-axis angle to screen centre | `a ≤ 35°` good. `35–45°` acceptable. `>45°` unacceptable | UNIC §4.2 [primary] |
| Seats outside screen edges | ≤5° OK. ≤10° acceptable | UNIC §4.4 [primary] |
| Vertical angle (first row) | Eye → screen centre ≤ **25°**. Eye → picture top ≤ **45°** (35° for wheelchair users) | UNIC §4.3 [primary] |
| **Sightline clearance** c (to the bottom picture line) | ≥200 mm good. 150–200 acceptable. 120–150 poor. <120 unacceptable | UNIC §4.7 [primary] |
| Riser per row (constant c) | With `Y_n` = eye height above the bottom picture line and `X_n` = distance to the screen: `Y_n = X_n·(Y_{n−1} + c)/X_{n−1}`, riser `N_n = Y_n − Y_{n−1}` | Derived from UNIC §4.7 by similar triangles. The handbook's own printed formula did not extract cleanly from the PDF. |
| Row distance (back-to-back) | ≥ **1.20 m** for regular seats. Last row +150–200 mm (+250–400 mm for recliners) | UNIC §5.1, §5.1.2 [primary] |
| Screen tilt | ≤ 3° | UNIC §1.2.4 [primary] |
| Aspect ratios | Flat **1.85:1** (DCI 2K 1998×1080). Scope **2.39:1** (2048×858). DCI full container **1.90:1** (2048×1080). **IMAX 1.43:1** (15/70 film and dual-laser "GT"). Single-laser IMAX tops out at 1.90:1 | [ISDCF](https://www.isdcf.com/registry/projectoraspectratios/), UNIC §1.1.1 [primary]. IMAX: [Wikipedia](https://en.wikipedia.org/wiki/IMAX) [secondary] |
| Typical screen widths | Standard 10–16 m. Premium large-format 18–25 m. IMAX GT up to ~30 m | **[assumed]**, not sourced. Screen size will be a venue parameter, so this only affects presets. |

### Stadium (field model)

| Item | Value / formula | Source |
|------|-----------------|--------|
| **C-value** | `C = D(N + R)/(D + T) − R` | Green Guide **5th ed. (2008)**, §12.3, Diagram 12.1, p.109 [primary] |
| Symbols | C = C value. D = horizontal distance from the eye to the point of focus. N = riser height. R = vertical height to the point of focus. T = seating row depth | Diagram 12.1 key [primary] |
| Riser solved for a target C | `N = (C + R)(D + T)/D − R`, applied row by row (gives a parabolic rake) | Algebra on the above. stadium-seat-view does the same. |
| Focal point | Nearest touchline for football and rugby. Further infield acceptable for cricket | Green Guide §12.3 [primary] |
| C targets | 60 mm minimum. 90 mm good. 120 mm optimum. The Green Guide itself only says it "varies according to the sport" and defers to BS EN 13200-1:2003 | FIFA/UEFA figures via [Wikipedia](https://en.wikipedia.org/wiki/Sightline_(architecture)) and [Parametric Monkey](https://parametricmonkey.com/2017/10/23/seating-bowl/) [secondary] |
| Max rake | **34°** seated. 25° standing | Green Guide §11.5, §13.11 [primary]. (SGSA's later SG01 guidance says "up to 35°" [secondary].) |
| Row depth / seat width | Row ≥ 700 mm (new build), **≥ 800 mm recommended** per BS EN 13200. Seat ≥ 460 mm (+40 with armrests), 500 mm recommended | Green Guide §12.13 [primary] |
| Eye offset from row rear; eye height | 150 mm; 1.20 m for sightline calculations | Parametric Monkey ("industry standard") [secondary]. Camera stays at 1.15 m. |
| Viewing distance | Optimum within **150 m**, maximum within **190 m**, measured from the far corner of the pitch | [FIFA Stadium Guidelines, "Stadium Bowl"](https://publications.fifa.com/es/football-stadiums-guidelines/general-process-guidelines/design/stadium-bowl) [primary, search excerpt] |
| Football pitch | **105 × 68 m** | [FIFA Stadium Guidelines §5.3](https://publications.fifa.com/es/football-stadiums-guidelines/technical-guideline/stadium-guidelines/pitch-dimensions-and-surrounding-areas) [primary, search excerpt]. UEFA Stadium Infrastructure Regs Art. 5 lists the same [secondary] |
| NBA court | 94 × 50 ft = **28.65 × 15.24 m** | [Wikipedia](https://en.wikipedia.org/wiki/Basketball_court) [secondary]; the NBA rulebook was not fetched |
| Cricket | Boundary ≤ **90 yd (82.3 m)**, should be ≥ **65 yd (59.4 m)** from the centre of the pitch in use (men's international). Pitch 22 yd = **20.12 m** | [ICC clause 19](https://www.icc-cricket.com/news/mens-odi-match-clause-19-boundaries) [secondary]. 22 yd is from the MCC Laws, **not fetched this session** |
| Typical bowl | 2–3 tiers, rakes about 20° (lower) to 34° (upper), row depth 0.80–0.85 m | **[assumed]**, using stadium-seat-view's config as a sanity check |

### Seat readout (what Phase 2 will display)

- **Cinema:** horizontal screen angle θh, eye-to-screen-centre distance, off-axis angle a, vertical angle to picture top, sightline clearance c. Each is graded against the UNIC/THX bands above.
- **Stadium:** C-value for the seat's row, distance to the focal point and to the pitch centre, depression angle to the pitch centre, horizontal angle the pitch occupies, and whether the seat is inside FIFA's 190 m arc.
- All numbers are **computed analytically in the engine**, not read back from the render. The rendered view is only for illustration.

---

## (c) Proposed stack and architecture

**Stack:** Vite + TypeScript + React 19 + @react-three/fiber 9 + drei + camera-controls, with Vitest for the formula tests. All of these are MIT. No backend, no API keys.

```
seatview3d/
  src/engine/              ← OURS. Pure TS, no three.js imports. Unit-tested.
    common/   vec3, units, eye-point, grading bands
    cinema/   CinemaParams → layout (rows, risers via c-solver) → metrics (θh, a, vertical, c)
    stadium/  StadiumParams → bowl path + tiers (risers via C-solver, 34° cap) → metrics (C, distances, angles)
  src/render/              R3F: <Venue>, <Seats> (InstancedMesh + raycast instanceId), <CameraRig> (camera-controls)
  src/ui/                  Seat readout panel (plain HTML)
  tests/                   hand-calculated cases for each formula
  CREDITS.md, LICENSE, third_party/<repo>/LICENSE
```

- Cinema and stadium are **separate modules** that share only `common/`. Each has its own params type, layout generator and metric set, as you required.
- Seats are rendered with one `InstancedMesh` per seat type, which scales to about 60k stadium seats.
- On seat click, `camera.setLookAt(eye, target, true)`. The target is the screen centre (cinema) or the focal point / pitch centre (stadium).

## (d) Fork recommendation

**Don't fork either repo whole.** Both are days old and unproven, and you want the parametric engine and view math to be ours. Instead:

- Write `src/engine` ourselves, using cinema-hall-kit's `metrics.ts` and stadium-seat-view's riser solver as **reference implementations** to cross-check results in tests.
- Where we copy code (likely stadium-seat-view's `bowlPath.ts` for the rounded-corner bowl), vendor it under `third_party/`, keep its MIT LICENSE, and credit it in CREDITS.md.
- Use camera-controls, three.js, R3F and drei as normal npm dependencies.

---

## Open questions for you

1. **Phase 2 venue: cinema or stadium?** My recommendation is **cinema**. Its standards are fully verified from the primary handbook, and the geometry is simpler, so it proves the engine and camera pipeline faster.
2. **React + R3F, or vanilla three.js?** I recommend R3F because the booking UI later will be React. Vanilla three would mean less to learn, but more UI work later.
3. **Camera field of view for the "true view".** A screen can't reproduce human vision exactly. Proposal: a vertical FOV of 60° [assumed], with an optional toggle to match the camera FOV to the physical screen.
4. **Eye heights:** 1.15 m for the camera, and the standards' 1.20 m reference for sightline calculations. OK, or one value for both?
5. **Unverified items:** the SMPTE 30° figure (the document is a scanned, withdrawn standard; I'd need OCR), the THX 36° figure (thx.com refused automated fetches) and the 6th-edition (2018) Green Guide values. I can buy-and-check or OCR if you want these at primary level.

### Sources read this session

- Rolv Gjestland, *How to design a cinema auditorium*, 2nd ed., UNIC: https://www.unic-cinemas.org/fileadmin/user_upload/Publications/UNIC_handbook_online_02_20__1_.pdf (text extracted locally)
- *Guide to Safety at Sports Grounds* ("Green Guide"), 5th ed., 2008: https://ficheiros.parlamento.pt/DILP/Dossiers_informacao/Violencia_Desporto/green-guide.pdf (text extracted locally)
- FIFA Stadium Guidelines (pitch dimensions; stadium bowl), links above
- SMPTE EG 18-1994 (withdrawn 2003): https://pub.smpte.org/doc/eg18/19940325-pub/eg0018-1994_withdrawn2003.pdf (scanned, not readable)
- ISDCF projector aspect ratios: https://www.isdcf.com/registry/projectoraspectratios/
- Wikipedia: Sightline (architecture), IMAX, Basketball court. Parametric Monkey seating-bowl tutorial. ICC clause 19
- GitHub repos above (source files read via `gh api`)
