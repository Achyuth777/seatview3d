import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookingError, type Availability, type Booking, type BookingService, type Hold, type SeatState } from './types';

export type Stage = 'select' | 'checkout' | 'confirmed';

/** How often availability is re-fetched while choosing seats [assumed]. */
export const AVAILABILITY_REFRESH_MS = 15_000;

/** React state for one event's booking flow, on top of any BookingService. */
export function useBooking(service: BookingService, eventId: string) {
  const [availability, setAvailability] = useState<Availability>({ sold: new Set(), heldByOthers: new Set() });
  const [hold, setHold] = useState<Hold | null>(null);
  const [stage, setStage] = useState<Stage>('select');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const holdRef = useRef<Hold | null>(null);
  holdRef.current = hold;

  const refresh = useCallback(
    async (ownHoldId?: string) => setAvailability(await service.getAvailability(eventId, ownHoldId)),
    [service, eventId],
  );

  // New event: reset the flow and load availability; release any hold when leaving the event.
  useEffect(() => {
    setHold(null);
    setStage('select');
    setBooking(null);
    setError(null);
    void refresh();
    return () => {
      if (holdRef.current) void service.release(holdRef.current.id);
    };
  }, [service, eventId, refresh]);

  // Keep availability fresh so other customers' holds and sales appear without a reload.
  useEffect(() => {
    if (stage !== 'select') return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh(holdRef.current?.id).catch(() => undefined);
    }, AVAILABILITY_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [stage, refresh]);

  // Hold countdown; on expiry drop the cart and tell the user.
  useEffect(() => {
    if (!hold) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hold]);
  useEffect(() => {
    if (hold && now >= hold.expiresAt) {
      void service.release(hold.id);
      setHold(null);
      setStage('select');
      setError('Your hold expired and the seats were released.');
      void refresh();
    }
  }, [now, hold, service, refresh]);

  const fail = useCallback(
    (e: unknown) => {
      if (e instanceof BookingError) {
        setError(e.message + (e.seatIds.length ? ` (${e.seatIds.join(', ')})` : ''));
        if (e.code === 'HOLD_EXPIRED') setHold(null);
      } else {
        setError(e instanceof Error && e.message ? e.message : 'Something went wrong.');
      }
      void refresh(holdRef.current?.id);
    },
    [refresh],
  );

  const toggleSeat = useCallback(
    async (seatId: string) => {
      setError(null);
      const current = holdRef.current;
      const seats = current?.seatIds ?? [];
      const next = seats.includes(seatId) ? seats.filter((s) => s !== seatId) : [...seats, seatId];
      try {
        if (next.length === 0) {
          if (current) await service.release(current.id);
          setHold(null);
          await refresh();
        } else {
          const h = await service.hold(eventId, next, current?.id);
          setHold(h);
          setNow(Date.now());
          await refresh(h.id);
        }
      } catch (e) {
        fail(e);
      }
    },
    [service, eventId, refresh, fail],
  );

  const confirm = useCallback(async (customer: { name: string; email: string }) => {
    if (!holdRef.current) return;
    setError(null);
    try {
      const b = await service.confirm(holdRef.current.id, customer);
      setBooking(b);
      setHold(null);
      setStage('confirmed');
      await refresh();
    } catch (e) {
      // Invalid contact details: stay on checkout so they can be corrected.
      if (!(e instanceof BookingError && e.code === 'INVALID_CUSTOMER')) setStage('select');
      fail(e);
    }
  }, [service, refresh, fail]);

  const states = useMemo(() => {
    const m = new Map<string, SeatState>();
    availability.sold.forEach((s) => m.set(s, 'sold'));
    availability.heldByOthers.forEach((s) => m.set(s, 'held'));
    hold?.seatIds.forEach((s) => m.set(s, 'cart'));
    return m;
  }, [availability, hold]);

  return {
    states,
    cart: hold?.seatIds ?? [],
    secondsLeft: hold ? Math.max(0, Math.ceil((hold.expiresAt - now) / 1000)) : null,
    stage,
    booking,
    error,
    toggleSeat,
    checkout: () => hold && setStage('checkout'),
    back: () => setStage('select'),
    confirm,
    done: () => {
      setStage('select');
      setBooking(null);
    },
  };
}

export type BookingState = ReturnType<typeof useBooking>;
