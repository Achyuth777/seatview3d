---
name: SeatView
description: A night-coach reservation chart for finding the true view from your seat before you pay.
colors:
  steel: "#11305c"
  steel-2: "#17396c"
  steel-3: "#1e4680"
  steel-line: "#4a72a8"
  on-steel: "#eaf0f7"
  on-steel-2: "#cdd9e8"
  paper: "#eff1ec"
  paper-2: "#e2e5de"
  field: "#ffffff"
  ink: "#16171a"
  ink-2: "#484c54"
  rule: "#b5b9b2"
  signal: "#f2c230"
  stamp: "#b50d28"
  good: "#1f7a3d"
typography:
  display:
    fontFamily: "Big Shoulders Display, sans-serif"
    fontSize: "clamp(2.6rem, 5.4vw, 5rem)"
    fontWeight: 800
    lineHeight: 0.94
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Big Shoulders Display, sans-serif"
    fontSize: "clamp(2rem, 3.8vw, 3.4rem)"
    fontWeight: 800
    lineHeight: 1
  title:
    fontFamily: "Big Shoulders Display, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.05
  row-title:
    fontFamily: "Big Shoulders Display, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.08
  numeral:
    fontFamily: "Big Shoulders Stencil Display, Big Shoulders Display, sans-serif"
    fontSize: "clamp(5rem, 9vw, 8.5rem)"
    fontWeight: 800
    lineHeight: 0.9
  stamp:
    fontFamily: "Big Shoulders Stencil Display, Big Shoulders Display, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "0.05em"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  data:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  action:
    fontFamily: "Martian Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
  code:
    fontFamily: "Doto, Martian Mono, monospace"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  gutter: "clamp(16px, 3vw, 40px)"
  section: "clamp(48px, 6vw, 88px)"
components:
  button-seat:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  button-seat-hover:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
  button-seat-on-steel:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  button-seat-on-steel-hover:
    backgroundColor: "{colors.on-steel}"
    textColor: "{colors.ink}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  button-quiet:
    textColor: "{colors.ink}"
    typography: "{typography.action}"
    rounded: "{rounded.none}"
    padding: "8px 12px"
  button-quiet-hover:
    backgroundColor: "{colors.paper-2}"
    textColor: "{colors.ink}"
  chip:
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "5px 9px"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.signal}"
    rounded: "{rounded.none}"
    padding: "5px 9px"
  input-chart:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  ticket:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "14px 16px"
  stamp-state:
    textColor: "{colors.stamp}"
    typography: "{typography.stamp}"
    rounded: "{rounded.none}"
    padding: "3px 9px"
  nav-strip:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.on-steel}"
    rounded: "{rounded.none}"
    height: "56px"
  coach-marker:
    textColor: "{colors.signal}"
    typography: "{typography.numeral}"
---

# Design System: SeatView

## Overview

**Creative North Star: "The Night Coach Chart"**

SeatView treats every show and match as a coach, and every seat as a printed line on that coach's reservation chart. The ground is painted night-blue steel. Listings arrive on pasted continuous-feed paper with punched sprocket margins, set in one line-printer black, while stencilled yellow numerals mark the categories the way numerals mark a carriage.

The system is dense where a buyer compares and loud where a buyer orients. Chart rows are small, tabular and exact; coach numerals and headlines are huge and condensed. The real seat render and its measurements stay beside the chart, so the proof reads as part of the same printed record.

Material carries the hierarchy. Paper sits on steel, stamps land on paper, and corners stay square throughout. Depth comes from a sheet being pasted down, never from glass or a glowing surface.

**Key Characteristics:**
- Night-blue painted steel ground with off-white chart paper pasted over it.
- Stencilled yellow coach numerals as category and section markers.
- Tabular monospaced rows for every figure a buyer compares.
- Red rubber-stamp marks for booking state.
- Square corners, dashed perforations and double-ruled strip edges.

## Colors

A restrained railway palette: three painted steels, one paper stock, one printing ink, one signal yellow and one stamp red.

### Primary
- **Night Coach Steel** (#11305c): The page ground, header strip, booking canvas and the punched sprocket holes showing through paper.
- **Signal Stencil Yellow** (#f2c230): Coach numerals, the brand mark, double rules, current navigation, sightline drawings, focus on steel and the label of the main seat action.

### Secondary
- **Stamp Red** (#b50d28): Booking state and the buyer's mark on paper: CNF, Held, Sold, the pen tick, the chosen seat, urgent timers, errors and focus rings.

### Neutral
- **Raised Steel** (#17396c): Bands and form panels that sit one coat above the ground.
- **Coach Panel Steel** (#1e4680): The coach rail and the backing of livery plates.
- **Steel Seam** (#4a72a8): Hairline borders and dashed seams between coaches on steel.
- **Chalk on Steel** (#eaf0f7): Primary text on steel.
- **Faded Chalk** (#cdd9e8): Secondary text and drawing lines on steel.
- **Chart Paper** (#eff1ec): Sheets, tickets, captions and booking panels.
- **Thumbed Paper** (#e2e5de): Hovered and active rows and quiet control hover.
- **Blank Field** (#ffffff): Search and form inputs printed on the chart.
- **Line-Printer Ink** (#16171a): Text, heavy rules and solid actions on paper.
- **Worn Ink** (#484c54): Secondary text and row numbers on paper.
- **Perforation Grey** (#b5b9b2): Decorative dashed row rules and unselected seats in plans. It never carries text.
- **Confirmed Green** (#1f7a3d): Success messages on paper only.

### Named Rules
**The Paper Carries Ink Rule.** Chart data is printed in ink on paper; steel holds orientation, headlines and drawings.

**The Red Means State Rule.** Stamp red marks what has happened to a seat or booking, or what needs attention. It is never a brand color or decoration.

## Typography

**Display Font:** Big Shoulders Display (with sans-serif)
**Numeral Font:** Big Shoulders Stencil Display (with Big Shoulders Display, sans-serif)
**Body Font:** Archivo (with system-ui, sans-serif)
**Label/Mono Font:** Martian Mono (with ui-monospace, monospace)
**Printed Code Font:** Doto (with Martian Mono, monospace)

**Character:** Tall condensed railway lettering does the shouting, a wide line-printer mono does the counting, and Archivo keeps explanations plain. Doto appears only where a machine would print a small code.

### Hierarchy
- **Numeral** (800, clamp(5rem, 9vw, 8.5rem), 0.9): Coach codes such as M1 and C1. The hero marker scales larger, up to 19rem.
- **Display** (800, clamp(2.6rem, 5.4vw, 5rem), 0.94): Landing and event page titles.
- **Headline** (800, clamp(2rem, 3.8vw, 3.4rem), 1): Section titles on steel.
- **Title** (800, 28px, 1.05): Sheet and ticket headings.
- **Row Title** (800, 20px, 1.08): Event names in chart rows.
- **Body** (400, 16px, 1.5): Ledes and explanations, held to 58-66ch.
- **Body Small** (400, 13px, 1.3): Row subtitles, figure labels and notes.
- **Data** (400, 12px, 1.4, tabular): Chart cells, venues, times and measurements.
- **Action** (600, 12px, 1.2): Button labels.
- **Code** (700, 18px, 1): Booking references and the printed date.
- **Stamp** (800, 18px, 0.05em, uppercase): State stamps only.

### Named Rules
**The Stencil Is Painted Rule.** The stencil face is for things painted on a coach: coach codes, the brand mark, livery codes, film plates and stamps. It never sets running text.

**The Figures Line Up Rule.** Any number a buyer compares is set in Martian Mono with tabular numerals.

**The Stamp Case Rule.** Only stamps are transformed to uppercase. Team codes and booking references keep their own capitals, and all other interface text stays in sentence case.

## Layout

Pages run edge to edge on a fluid gutter (clamp(16px, 3vw, 40px)), with inner pages capped at 1480px. Vertical section padding is clamp(48px, 6vw, 88px). Spacing inside charts is tight, usually 4-12px, and opens up between major groups.

The signature composition pairs a wider chart sheet with a narrower proof column, about 3:2, with the proof sticky while the chart scrolls. Event and profile pages reuse the same asymmetric two-column structure.

At 1080px and below, paired columns stack, the landing proof moves inline and stays sticky above the rows, and the coach rail drops from four columns to two. At 760px and below, the strip wraps to two lines, sprocket margins narrow from 22px to 12px, table rows become stacked records, and the booking panels dock to the screen edges.

### Named Rules
**The Chart Stays Scannable Rule.** Listings stay as ruled, numbered rows on a sheet. On phones each row becomes a stacked record with its action at full width.

## Elevation & Depth

Depth is physical and sparse. Steel is layered tonally through its three coats; paper is the only material that casts a soft shadow, because it is pasted onto or floated over the steel.

### Shadow Vocabulary
- **Pasted Sheet** (`box-shadow: 0 18px 40px -18px rgb(0 0 0 / .7)`): Chart sheets on the steel ground.
- **Floating Slip** (`box-shadow: 0 10px 28px -10px rgb(0 0 0 / .7)`): Seat and cart panels over the 3D view.

### Named Rules
**The Only Paper Lifts Rule.** Shadows belong to paper over steel or over the 3D canvas. Steel surfaces separate by tone and rule.

## Shapes

Every corner is square (0px). Form comes from print and rail details: punched circular sprocket holes, dashed tear lines, double-ruled strip edges, heavy yellow coach bands and a ticket stub divided by perforation. Stamps are the one deliberately rotated shape, set at -5deg (-2deg when small) with a doubled outline.

### Named Rules
**The Square Stock Rule.** Paper, plates, controls and panels are cut square. Circles appear only as punched holes and as points in technical drawings.

## Components

### Buttons
Blunt printed blocks with no radius.
- **Shape:** Square (0px), 1px border, Martian Mono action label.
- **Primary (Seat action):** Ink block with a yellow label (8px 12px). It inverts to yellow with ink text on hover.
- **On steel:** Yellow block with ink text (10px 12px), lightening to chalk on hover.
- **Ink:** Solid ink with a paper label for secondary profile actions.
- **Quiet:** Transparent with a worn-ink border, filling with thumbed paper on hover.
- **Focus:** A 2px outline at 2px offset, yellow on steel and red on paper.

### Chips
- **Style:** Transparent, worn-ink border, 11px mono label (5px 9px).
- **State:** Selected chips print solid ink with a yellow label and expose `aria-pressed`.

### Cards / Containers
There are no generic cards. Content sits on one of three paper objects.
- **Chart Sheet:** Paper with punched sprocket margins, dashed margin rules and a dashed form-feed end.
- **Ticket:** Paper with a main body and a 170px stub behind a dashed tear line. The stub moves below the body on phones.
- **Booking Slip:** Paper panels floating over the 3D view with compact 10px 12px padding.

### Inputs / Fields
- **Style:** White field, 1px ink border, square corners, 12-13px mono text.
- **Focus:** A 2px stamp-red outline on paper.
- **Error:** Stamp-red message text on paper.
- **Mobile:** 16px text and a 44px minimum height in forms.

### Navigation
- **Style:** A sticky 56px steel strip with a yellow double rule beneath it, carrying the stencil mark, category links, Doto date, city select and tickets link.
- **States:** Links move from faded chalk to chalk on hover; the current page is yellow with a 2px underline.
- **Mobile:** Category links move to a scrollable second line.

### Chart Row
The core listing record: number, event, venue, time, fare and seat action, divided by dashed rules. Pointing at or focusing a row on the landing page replaces its number with a red pen tick and feeds that venue's render into the proof panel.

### Coach Marker
A large yellow stencil code that identifies a category. It sits behind the seat render in the hero, heads listing pages and fills each coach on the category rail.

### State Stamp
A red double-outlined rubber stamp for CNF, Held and Sold. Sold is struck through. Timers stay inside the stamp while a hold is running.

### Livery Plate
Generated coach-side artwork. Fixtures use diagonal bands of the two clubs' colors with stencilled short codes; films use a flat painted panel with the title stencilled on.

### Seat Proof
A real engine render in a steel-lined frame, captioned on paper with the seat name and its measurements in ruled tabular pairs.

### Sightline Drawing
A technical section drawn in yellow and chalk lines on steel, with dimension lines and mono labels, paired with a small paper seat plan marking the chosen seat in red.

Motion stays short and mechanical: 120-200ms color changes, a 300ms pen tick, and a 450ms paper-feed reveal on the expo-out curve (cubic-bezier(0.16, 1, 0.3, 1)). All of it collapses under reduced motion.

## Do's and Don'ts

### Do:
- **Do** print listings as numbered, ruled chart rows on paper.
- **Do** put real seat renders and engine-computed measurements next to the choice they support.
- **Do** use stencilled coach codes (M1, C1, F1, B1) as category markers.
- **Do** reserve stamp red for state, selection, errors and focus on paper.
- **Do** set compared figures in Martian Mono with tabular numerals.
- **Do** keep booking and form controls at least 44px tall at phone width.
- **Do** build punched sprocket holes with a hard-stop radial fill, as the chart sheet does.

### Don't:
- **Don't** round corners on paper, plates, panels or controls.
- **Don't** use soft decorative gradients or glass; the hard-stop sprocket punch is the material exception.
- **Don't** use real logos, crests or official posters; listing art is generated livery.
- **Don't** set text in Perforation Grey or use it as a control boundary.
- **Don't** use stencil lettering for running text.
- **Don't** add small uppercase labels above headings; coach codes are the section markers.
