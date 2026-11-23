import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CinemaLayout } from '../engine/cinema/layout';
import type { SeatState } from '../booking/types';
import { seatColor } from './seatColors';
import { makeScreenTexture } from './screenTexture';

const SEAT_COLOR = new THREE.Color('#8b2a2a');

// Seat model sizes [assumed]: 0.52 m wide cushion at 0.45 m, backrest to 1.0 m.
const CUSHION = { w: 0.52, h: 0.12, d: 0.5, y: 0.39 };
const BACK = { w: 0.52, h: 0.6, d: 0.08, y: 0.72 };

interface Props {
  layout: CinemaLayout;
  selectedId: string | null;
  states: Map<string, SeatState>;
  onSelect: (seatId: string) => void;
}

export function CinemaScene({ layout, selectedId, states, onSelect }: Props) {
  const { screen, rows, seats, room, params } = layout;

  const screenTex = useMemo(
    () =>
      makeScreenTexture(
        screen.width,
        screen.height,
        `${screen.width.toFixed(1)} m × ${screen.height.toFixed(2)} m · ${params.screen.aspect}:1`,
      ),
    [screen.width, screen.height, params.screen.aspect],
  );

  const cushionRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);

  // Place seat instances (once per layout).
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    seats.forEach((s, i) => {
      const row = rows[s.rowIndex]!;
      const backZ = row.eyeDistance + params.eye.backOffset;
      m.makeTranslation(s.x, row.treadHeight + CUSHION.y, backZ - CUSHION.d / 2 - BACK.d);
      cushionRef.current!.setMatrixAt(i, m);
      m.makeTranslation(s.x, row.treadHeight + BACK.y, backZ - BACK.d / 2);
      backRef.current!.setMatrixAt(i, m);
    });
    cushionRef.current!.instanceMatrix.needsUpdate = true;
    backRef.current!.instanceMatrix.needsUpdate = true;
  }, [seats, rows, params.eye.backOffset]);

  // Colour seats (on selection change).
  useLayoutEffect(() => {
    seats.forEach((s, i) => {
      const c = seatColor(s.id, SEAT_COLOR, selectedId, states);
      cushionRef.current!.setColorAt(i, c);
      backRef.current!.setColorAt(i, c);
    });
    cushionRef.current!.instanceColor!.needsUpdate = true;
    backRef.current!.instanceColor!.needsUpdate = true;
  }, [seats, selectedId, states]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4 || e.instanceId === undefined) return; // ignore drags
    const seat = seats[e.instanceId];
    if (seat) onSelect(seat.id);
  };

  const halfW = room.width / 2;

  return (
    <group>
      <hemisphereLight args={['#ffffff', '#5a5a6a', 2.2]} />
      <directionalLight position={[0, room.height, room.depth + 8]} intensity={1.1} />

      {/* Room shell: back faces only, so it reads as an interior and is see-through from outside. */}
      {/* Its front wall sits 0.2 m behind the screen plane so the two never share a depth. */}
      <mesh position={[0, room.height / 2 - 0.1, room.depth / 2 - 0.1]}>
        <boxGeometry args={[room.width, room.height + 0.2, room.depth + 0.2]} />
        <meshStandardMaterial color="#465674" side={THREE.BackSide} />
      </mesh>

      {/* Front floor between screen and row A. */}
      <mesh position={[0, -0.025, rows[0]!.zFront / 2]}>
        <boxGeometry args={[room.width, 0.05, rows[0]!.zFront]} />
        <meshStandardMaterial color="#39435a" />
      </mesh>

      {/* Stepped treads (stadium seating). */}
      {rows.map((r) => {
        const depth = r.zBack - r.zFront;
        const h = r.treadHeight + 0.05;
        return (
          <mesh key={r.label} position={[0, r.treadHeight - h / 2, r.zFront + depth / 2]}>
            <boxGeometry args={[room.width, h, depth]} />
            <meshStandardMaterial color={r.index % 2 ? '#4a4a56' : '#565664'} />
          </mesh>
        );
      })}

      {/* Screen (unlit, it is a light source) and black masking wall. */}
      <mesh position={[0, room.height / 2, -0.1]}>
        <planeGeometry args={[room.width, room.height]} />
        <meshBasicMaterial color="#050505" />
      </mesh>
      <mesh position={[0, screen.centre.y, 0]}>
        <planeGeometry args={[screen.width, screen.height]} />
        <meshBasicMaterial map={screenTex} toneMapped={false} />
      </mesh>

      {/* Seats. */}
      <instancedMesh
        ref={cushionRef}
        args={[undefined, undefined, seats.length]}
        onClick={handleClick}
      >
        <boxGeometry args={[CUSHION.w, CUSHION.h, CUSHION.d]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={backRef} args={[undefined, undefined, seats.length]} onClick={handleClick}>
        <boxGeometry args={[BACK.w, BACK.h, BACK.d]} />
        <meshStandardMaterial />
      </instancedMesh>

      {/* Side-wall row markers so rows can be identified in the overview. */}
      {rows.map((r) => (
        <mesh key={`m${r.label}`} position={[-halfW + 0.01, r.treadHeight + 0.6, r.eyeDistance]}>
          <planeGeometry args={[0.3, 0.3]} />
          <meshBasicMaterial color={r.index % 5 === 0 ? '#f2c14e' : '#666'} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
