import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { SeatState } from '../booking/types';
import type { CinemaLayout } from '../engine/cinema/layout';
import { BASE_VERTICAL_FOV, subjectHalfAngle } from '../engine/common/viewFit';
import { CameraRig, type CameraPose } from '../render/CameraRig';
import { CinemaScene } from '../render/CinemaScene';

const NO_STATES = new Map<string, SeatState>();

/** The 3D hall. Loaded on demand (React.lazy), so three.js never ships with discovery pages. */
export default function PreviewCanvas({ layout, viewId, otherId, onPick, animate, onRest }: {
  layout: CinemaLayout;
  viewId: string | null;
  otherId: string | null;
  onPick: (id: string) => void;
  animate: boolean;
  onRest: (key: string, position: { x: number; y: number; z: number }) => void;
}) {
  const seat = layout.seats.find((s) => s.id === viewId) ?? null;
  const overview: CameraPose = useMemo(() => ({
    eye: { x: layout.room.width / 2 + 22, y: layout.room.height + 4, z: layout.room.depth * 0.62 },
    target: { x: 0, y: 2.5, z: layout.room.depth * 0.5 },
  }), [layout]);
  const pose = useMemo(() => (seat ? { eye: seat.eye, target: layout.screen.centre } : overview), [seat, layout, overview]);
  const half = useMemo(() => {
    if (!seat) return 31;
    const w = layout.screen.width / 2;
    return subjectHalfAngle(seat.eye, layout.screen.centre, [{ x: -w, z: 0 }, { x: w, z: 0 }]);
  }, [seat, layout]);

  return (
    <Canvas
      camera={{ fov: BASE_VERTICAL_FOV, near: 0.05, far: 300, position: [overview.eye.x, overview.eye.y, overview.eye.z] }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' }}
      resize={{ debounce: 0, scroll: false }}
    >
      <color attach="background" args={['#0b1a30']} />
      <CinemaScene layout={layout} selectedId={viewId} compareId={otherId} states={NO_STATES} onSelect={onPick} />
      <CameraRig pose={pose} locked={seat !== null} animate={animate} subjectHalfAngle={half} restKey={viewId ?? 'overview'} onRest={onRest} />
    </Canvas>
  );
}
