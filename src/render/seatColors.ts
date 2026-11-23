import * as THREE from 'three';
import type { SeatState } from '../booking/types';

/** Seat colours shared by both venues. Available seats use each venue's own base colour. */
export const SELECTED_COLOR = new THREE.Color('#f2c14e');
export const STATE_COLORS: Record<Exclude<SeatState, 'available'>, THREE.Color> = {
  sold: new THREE.Color('#4b4d55'),
  held: new THREE.Color('#b0702a'),
  cart: new THREE.Color('#3fb950'),
};

export function seatColor(
  id: string,
  base: THREE.Color,
  selectedId: string | null,
  states: Map<string, SeatState>,
): THREE.Color {
  if (id === selectedId) return SELECTED_COLOR;
  const st = states.get(id);
  return st && st !== 'available' ? STATE_COLORS[st] : base;
}
