# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience right now: people the product is **shown to as a working demo** (venues, investors, recruiters, clients). It must behave like a real consumer ticketing app for Indian cities, so the demo audience experiences it as a ticket buyer would: browse events, pick a show or match, choose a seat, book.

The ticket buyer being simulated: a moviegoer or sports fan in an Indian city (Chennai, Mumbai, Bengaluru, …) on a phone or laptop, deciding which seat is worth the price.

## Product Purpose

SeatView is an event-ticketing platform (movies, cricket, football, basketball) whose core feature is showing the **true view from the selected seat before paying**. Success for the demo: a viewer understands the promise from the landing page, reaches a seat view within a few clicks, and completes a booking.

## Positioning

"See the exact view from your seat before you pay, computed from real venue dimensions."

The view is not a photo or a mock-up. Each venue is generated from real dimensions in metres, and each seat's camera sits at real seated eye height (1.15 m). The readout shows sightline clearance (C-value), distances and viewing angles graded against published standards (UNIC cinema handbook, Green Guide, FIFA). Ordinary ticketing apps show a flat seat grid.

## Operating Context

- Demo market: India. Prices in ₹ INR; Indian cities; IPL cricket franchises, ISL football clubs, NBA teams, Tamil/Telugu/Hindi/English films.
- Real team and film names are used; **no real logos, crests or official posters**. Artwork is generated. Fixtures and showtimes are fictional, and the site states "Demo — not affiliated".
- Four parametric venues: cinema (2.39:1 Scope hall), football stadium, basketball arena, cricket ground.

## Capabilities and Constraints

- Stack: React 19 + Vite + React Three Fiber (three.js), Fastify API with PostgreSQL (PGlite fallback).
- The booking API must stay unchanged (holds, 10-minute expiry, idempotent confirm, contact details).
- Checkout collects name + email; no payment is taken; no emails are sent.
- Profile is **local**: no passwords. Name and email are kept in the browser; bookings are listed from this browser and fetched by booking reference + email.
- Seat views use a 60° vertical camera field of view on landscape screens; upright phones widen the view to fit the whole screen or as much of the field as a 16:9 view shows (owner's decisions).

## Brand Commitments

- Product name on the site: **SeatView** (code name SeatView3D).
- Style direction chosen by the owner: dark and cinematic (to be developed in design work, not here).
- Licensed MIT.

## Evidence on Hand

- Working 3D seat views with graded metrics for all four venues (see `docs/PHASE*_REPORT.md` and `docs/screenshots/`).
- No real customers, testimonials, press, partners, ticket sales or ratings exist. Do not fabricate them, and do not invent "trusted by" logos or user counts.

## Product Principles

1. The seat view is the product: every path should lead quickly to "see your seat".
2. Show real numbers, labelled honestly: real dimensions, standards cited, assumptions marked.
3. Feel like a real consumer app, but never pretend to be a real company's listing or an official partner.
4. Mobile and desktop both matter; a demo is often shown on a phone.
