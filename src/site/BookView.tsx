import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { EVENTS, listingForEvent } from '../booking/catalog';
import type { SeatCategoryMap } from '../booking/pricing';
import type { EventInfo } from '../booking/types';
import { useBooking, type BookingState } from '../booking/useBooking';
import { bookingService, bowlData, cinemaData, type BowlVenue } from '../booking/venueData';
import { computeCinemaMetrics } from '../engine/cinema/metrics';
import { computeStadiumMetrics } from '../engine/stadium/metrics';
import { BASE_VERTICAL_FOV, subjectHalfAngle } from '../engine/common/viewFit';
import { CameraRig, type CameraPose } from '../render/CameraRig';
import { CinemaScene } from '../render/CinemaScene';
import { StadiumScene } from '../render/StadiumScene';
import { CartPanel } from '../ui/CartPanel';
import { Readout } from '../ui/Readout';
import { SeatActions } from '../ui/SeatActions';
import { StadiumReadout } from '../ui/StadiumReadout';
import { DEMO_AUDITORIUMS } from '../discovery/directory';
import { Provenance } from './AuditoriumPreview';
import { rememberBooking, updateProfile, useProfile } from './profileStore';
import { Link } from './router';
import { formatWhen } from './format';

const CAMERA_FOV = BASE_VERTICAL_FOV;
/** Half-angle the whole venue spans from the overview camera, so it fills an upright phone. */
const OVERVIEW_HALF_ANGLE = 31;

interface Props {
  eventId: string;
  initialSeat: string | null;
  /** ?instant=1 skips the fly-in; ?clean=1 hides every panel (used to capture renders). */
  animate: boolean;
  clean: boolean;
}

export function BookView({ eventId, initialSeat, animate, clean }: Props) {
  const event = EVENTS.find((e) => e.id === eventId)!;
  const listing = listingForEvent(eventId)!;
  const [selectedId, setSelectedId] = useState<string | null>(initialSeat);
  const booking = useBooking(bookingService, event.id);
  const profile = useProfile();
  const cats = event.venue === 'cinema' ? cinemaData().cats : bowlData(event.venue).cats;

  // Remember confirmed bookings (and the contact details) in this browser's local profile.
  useEffect(() => {
    const b = booking.booking;
    if (!b?.customer) return;
    rememberBooking({ reference: b.reference, email: b.customer.email, eventId: b.eventId });
    updateProfile({ name: b.customer.name, email: b.customer.email });
  }, [booking.booking]);

  // Keep ?seat= in the address bar so a seat view can be shared or reloaded.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set('seat', selectedId);
    else url.searchParams.delete('seat');
    window.history.replaceState(null, '', url);
  }, [selectedId]);

  const demoAuditorium = event.venue === 'cinema' ? DEMO_AUDITORIUMS.find((a) => a.id === `demo-hall-${listing.city.toLowerCase()}-1`) : undefined;
  const view = { selectedId, setSelectedId, event, cats, booking, animate, clean };

  return (
    <div className={`${clean ? 'book book--clean' : booking.stage === 'select' ? 'book' : 'book book--checkout'}${demoAuditorium && !clean ? ' book--has-prov' : ''}`}>
      {event.venue === 'cinema' ? (
        <CinemaView {...view} />
      ) : (
        <StadiumView key={event.venue} venue={event.venue} {...view} />
      )}
      {!clean && (
        <>
          <header className="book-strip">
            <Link to={`/event/${listing.id}`} className="book-strip__back">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
              {listing.title}
            </Link>
            <span className="book-strip__when">{formatWhen(event.startsAt)} · {listing.venueName}</span>
            <Link to="/profile" className="book-strip__profile">Profile</Link>
          </header>
          {demoAuditorium && <Provenance auditorium={demoAuditorium} />}
          <CartPanel
            event={event}
            cats={cats}
            booking={booking}
            onView={setSelectedId}
            initialCustomer={{ name: profile.name, email: profile.email }}
          />
        </>
      )}
    </div>
  );
}

interface ViewProps {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  event: EventInfo;
  cats: SeatCategoryMap;
  booking: BookingState;
  animate: boolean;
  clean: boolean;
}

function CinemaView({ selectedId, setSelectedId, event, cats, booking, animate, clean }: ViewProps) {
  const { layout } = cinemaData();
  const seat = layout.seats.find((s) => s.id === selectedId) ?? null;
  const metrics = useMemo(() => (seat ? computeCinemaMetrics(layout, seat) : null), [layout, seat]);
  const overview: CameraPose = useMemo(
    () => ({
      // From outside the right-hand side wall (the room shell is back-face only) to show the rake.
      eye: { x: layout.room.width / 2 + 22, y: layout.room.height + 4, z: layout.room.depth * 0.62 },
      target: { x: 0, y: 2.5, z: layout.room.depth * 0.5 },
    }),
    [layout],
  );
  const pose = useMemo(() => (seat ? { eye: seat.eye, target: layout.screen.centre } : overview), [seat, layout, overview]);
  const half = useMemo(() => {
    if (!seat) return OVERVIEW_HALF_ANGLE;
    const w = layout.screen.width / 2;
    return subjectHalfAngle(seat.eye, layout.screen.centre, [{ x: -w, z: 0 }, { x: w, z: 0 }]);
  }, [seat, layout]);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__seatview = { layout, computeCinemaMetrics, booking };
  }

  return (
    <>
      <Canvas
        camera={{ fov: CAMERA_FOV, near: 0.05, far: 300, position: [0, 10, 40] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        resize={{ debounce: 0, scroll: false }}
      >
        <color attach="background" args={['#11305c']} />
        <CinemaScene layout={layout} selectedId={clean ? null : selectedId} states={booking.states} onSelect={setSelectedId} />
        <CameraRig pose={pose} locked={seat !== null} animate={animate} subjectHalfAngle={half} />
      </Canvas>
      {!clean && (
        <Readout
          layout={layout}
          seat={seat}
          metrics={metrics}
          onOverview={() => setSelectedId(null)}
          actions={seat && <SeatActions event={event} cats={cats} booking={booking} seatId={seat.id} />}
        />
      )}
    </>
  );
}

function StadiumView({ venue, selectedId, setSelectedId, event, cats, booking, animate, clean }: ViewProps & { venue: BowlVenue }) {
  const { layout } = bowlData(venue);
  const seat = (selectedId && layout.seatById.get(selectedId)) || null;
  const metrics = useMemo(() => (seat ? computeStadiumMetrics(layout, seat) : null), [layout, seat]);

  // Overview distance scales with the bowl: half-extent of the playing area + depth of the stands.
  const overview: CameraPose = useMemo(() => {
    const pp = layout.params.pitch;
    const last = layout.rows[layout.rows.length - 1]!;
    const R = Math.max(pp.length, pp.width) / 2 + (pp.cornerRadius ?? 0) + last.frontOffset;
    return { eye: { x: 0.95 * R, y: 1.15 * R, z: 1.6 * R }, target: { x: 0, y: 0, z: 0 } };
  }, [layout]);
  // In seat view the spectator looks at the centre spot.
  const pose = useMemo(() => (seat ? { eye: seat.eye, target: { x: 0, y: 0, z: 0 } } : overview), [seat, overview]);
  const half = useMemo(
    () => (seat ? subjectHalfAngle(seat.eye, { x: 0, z: 0 }, layout.boundary) : OVERVIEW_HALF_ANGLE),
    [seat, layout],
  );

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__seatview = { layout, computeStadiumMetrics, booking };
  }

  return (
    <>
      <Canvas
        camera={{ fov: CAMERA_FOV, near: 0.05, far: 1500, position: [overview.eye.x, overview.eye.y, overview.eye.z] }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        resize={{ debounce: 0, scroll: false }}
      >
        <color attach="background" args={[layout.params.sport === 'basketball' ? '#121a26' : '#9ec3e6']} />
        <StadiumScene layout={layout} selectedId={clean ? null : selectedId} states={booking.states} onSelect={setSelectedId} />
        <CameraRig pose={pose} locked={seat !== null} animate={animate} subjectHalfAngle={half} />
      </Canvas>
      {!clean && (
        <StadiumReadout
          layout={layout}
          seat={seat}
          metrics={metrics}
          onOverview={() => setSelectedId(null)}
          actions={seat && <SeatActions event={event} cats={cats} booking={booking} seatId={seat.id} />}
        />
      )}
    </>
  );
}
