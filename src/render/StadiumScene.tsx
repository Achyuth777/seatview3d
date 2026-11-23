import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { SeatState } from '../booking/types';
import { sampleLoop } from '../engine/stadium/bowl';
import type { StadiumLayout } from '../engine/stadium/layout';
import { makeCourtTexture } from './courtTexture';
import { makePitchTexture } from './pitchTexture';
import { seatColor } from './seatColors';

const TIER_COLORS = [new THREE.Color('#1f4e9c'), new THREE.Color('#2a63c4')];

// Seat model sizes [assumed]: 0.46 m wide, cushion at 0.42 m, backrest to 0.85 m.
const CUSHION = { w: 0.46, h: 0.08, d: 0.4, y: 0.42 };
const BACK = { w: 0.46, h: 0.4, d: 0.06, y: 0.65 };

interface Props {
  layout: StadiumLayout;
  selectedId: string | null;
  states: Map<string, SeatState>;
  onSelect: (seatId: string) => void;
}

type Strip = (oA: number, yA: number, oB: number, yB: number) => void;

/** Collects quad strips between two offset loops (same sample structure) into one position buffer. */
function stripBuilder(layout: StadiumLayout): { strip: Strip; geometry: () => THREE.BufferGeometry } {
  const { length: L, width: W } = layout.params.pitch;
  const r0 = layout.params.pitch.cornerRadius ?? 0;
  const pos: number[] = [];
  const strip: Strip = (oA, yA, oB, yB) => {
    const a = sampleLoop(L, W, oA, r0);
    const b = sampleLoop(L, W, oB, r0);
    for (let i = 0; i < a.length - 1; i++) {
      const a0 = a[i]!, a1 = a[i + 1]!, b0 = b[i]!, b1 = b[i + 1]!;
      pos.push(a0.x, yA, a0.z, b0.x, yB, b0.z, b1.x, yB, b1.z);
      pos.push(a0.x, yA, a0.z, b1.x, yB, b1.z, a1.x, yA, a1.z);
    }
  };
  const geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  };
  return { strip, geometry };
}

/** Stepped concrete: treads, risers, concourses, overhang soffits, balustrades and the back wall. */
function buildTerraceGeometry(layout: StadiumLayout): THREE.BufferGeometry {
  const { strip, geometry } = stripBuilder(layout);
  const p = layout.params;
  const T = p.seating.rowDepth;
  let prevTread = 0;
  for (const r of layout.rows) {
    const F = r.frontOffset;
    if (r.index === 0) {
      strip(F, 0, F, r.treadHeight); // front wall
    } else if (r.rowInTier === 1) {
      const prev = layout.rows[r.index - 1]!;
      const lowerBack = prev.frontOffset + T;
      const soffit = layout.soffits.find((s) => s.tier === r.tier);
      const TF = r.tierFrontOffset; // balustrade line (in front of any front gangway)
      if (soffit) {
        strip(lowerBack, prevTread, lowerBack, soffit.height); // closes the back of the tier below
        strip(TF, soffit.height, lowerBack, soffit.height); // underside of the overhang
        strip(TF, soffit.height, TF, r.treadHeight); // front face of the overhang
      } else {
        strip(lowerBack, prevTread, TF, prevTread); // concourse
        strip(TF, prevTread, TF, r.treadHeight);
      }
      if (TF < F) strip(TF, r.treadHeight, F, r.treadHeight); // front gangway floor
      const h = p.tiers[r.tier]!.parapetHeight ?? 0;
      if (h > 0) strip(TF, r.treadHeight, TF, r.treadHeight + h); // balustrade
    } else {
      strip(F, prevTread, F, r.treadHeight);
    }
    strip(F, r.treadHeight, F + T, r.treadHeight);
    prevTread = r.treadHeight;
  }
  const last = layout.rows[layout.rows.length - 1]!;
  strip(last.frontOffset + T, prevTread, last.frontOffset + T, 0);
  return geometry();
}

function buildBoardsGeometry(layout: StadiumLayout): THREE.BufferGeometry | null {
  const b = layout.params.boards;
  if (!b) return null;
  const { strip, geometry } = stripBuilder(layout);
  strip(b.offset, 0, b.offset, b.height);
  return geometry();
}

function buildRoofGeometry(layout: StadiumLayout): THREE.BufferGeometry | null {
  const r = layout.roof;
  if (!r) return null;
  const { strip, geometry } = stripBuilder(layout);
  strip(r.frontOffset, r.frontHeight, r.backOffset, r.backHeight);
  strip(r.frontOffset, r.frontHeight - 1.2, r.frontOffset, r.frontHeight); // fascia
  return geometry();
}

function loopShape(layout: StadiumLayout, offset: number): THREE.Shape {
  const { length: L, width: W } = layout.params.pitch;
  const pts = sampleLoop(L, W, offset, layout.params.pitch.cornerRadius ?? 0);
  // Meshes are rotated −90° about X, so shape y = −z.
  return new THREE.Shape(pts.map((q) => new THREE.Vector2(q.x, -q.z)));
}

export function StadiumScene({ layout, selectedId, states, onSelect }: Props) {
  const { seats, rows, params } = layout;
  const { length: L, width: W, runoff } = params.pitch;
  const sport = params.sport;

  const terrace = useMemo(() => buildTerraceGeometry(layout), [layout]);
  const boards = useMemo(() => buildBoardsGeometry(layout), [layout]);
  const roof = useMemo(() => buildRoofGeometry(layout), [layout]);

  const cushionRef = useRef<THREE.InstancedMesh>(null);
  const backRef = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const T = params.seating.rowDepth;
    seats.forEach((s, i) => {
      const row = rows[s.rowIndex]!;
      const { nx, nz } = s.plan;
      q.setFromAxisAngle(up, Math.atan2(nx, nz)); // local +Z (seat back) → outward normal
      // Backrest 0.05 m in front of the row's rear edge, i.e. 0.10 m behind the eye point [assumed].
      const backO = row.frontOffset + T - 0.05 - row.eyeOffset;
      const ex = s.plan.x;
      const ez = s.plan.z;
      pos.set(ex + nx * (backO - CUSHION.d / 2), row.treadHeight + CUSHION.y, ez + nz * (backO - CUSHION.d / 2));
      cushionRef.current!.setMatrixAt(i, m.compose(pos, q, one));
      pos.set(ex + nx * backO, row.treadHeight + BACK.y, ez + nz * backO);
      backRef.current!.setMatrixAt(i, m.compose(pos, q, one));
    });
    for (const r of [cushionRef.current!, backRef.current!]) {
      r.instanceMatrix.needsUpdate = true;
      r.computeBoundingSphere();
    }
  }, [seats, rows, params.seating.rowDepth]);

  useLayoutEffect(() => {
    seats.forEach((s, i) => {
      const c = seatColor(s.id, TIER_COLORS[rows[s.rowIndex]!.tier % 2]!, selectedId, states);
      cushionRef.current!.setColorAt(i, c);
      backRef.current!.setColorAt(i, c);
    });
    cushionRef.current!.instanceColor!.needsUpdate = true;
    backRef.current!.instanceColor!.needsUpdate = true;
  }, [seats, rows, selectedId, states]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4 || e.instanceId === undefined) return;
    const seat = seats[e.instanceId];
    if (seat) onSelect(seat.id);
  };

  // From the overview a seat is ~1 px wide, so clicks on the terrace pick the nearest seat (≤ 1.5 m).
  const handleTerraceClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return;
    const { x, y, z } = e.point;
    let best: { id: string; d: number } | null = null;
    for (const s of seats) {
      const d = Math.hypot(s.eye.x - x, s.eye.y - params.eye.cameraHeight - y, s.eye.z - z);
      if (d < 1.5 && (!best || d < best.d)) best = { id: s.id, d };
    }
    if (best) onSelect(best.id);
  };

  return (
    <group>
      <hemisphereLight args={['#dfe9ff', '#3a3a30', 1.6]} />
      <directionalLight position={[60, 120, 40]} intensity={2.2} />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.12, 0]}>
        <shapeGeometry args={[loopShape(layout, runoff)]} />
        <meshStandardMaterial color={sport === 'basketball' ? '#2b2d33' : '#2f6b2b'} />
      </mesh>
      <PlayingSurface layout={layout} />

      <mesh geometry={terrace} onClick={handleTerraceClick}>
        <meshStandardMaterial color="#8d8f96" side={THREE.DoubleSide} />
      </mesh>
      {boards && (
        <mesh geometry={boards}>
          <meshStandardMaterial color="#14306b" emissive="#0c2a6e" emissiveIntensity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
      {roof && (
        <mesh geometry={roof}>
          <meshStandardMaterial color="#e8ecf2" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      <instancedMesh ref={cushionRef} args={[undefined, undefined, seats.length]} onClick={handleClick}>
        <boxGeometry args={[CUSHION.w, CUSHION.h, CUSHION.d]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh ref={backRef} args={[undefined, undefined, seats.length]} onClick={handleClick}>
        <boxGeometry args={[BACK.w, BACK.h, BACK.d]} />
        <meshStandardMaterial />
      </instancedMesh>
      {sport === 'football' && (
        <>
          <Goal x={-L / 2} dir={-1} />
          <Goal x={L / 2} dir={1} />
        </>
      )}
      {sport === 'basketball' && (
        <>
          <Hoop x={-L / 2 + 1.575} dir={-1} />
          <Hoop x={L / 2 - 1.575} dir={1} />
        </>
      )}
    </group>
  );

}

/** Playing surface by sport (football pitch, NBA court, cricket outfield). */
function PlayingSurface({ layout: lo }: { layout: StadiumLayout }) {
  const { sport } = lo.params;
  const { length: L, width: W } = lo.params.pitch;
  const tex = useMemo(
    () => (sport === 'football' ? makePitchTexture(L, W) : sport === 'basketball' ? makeCourtTexture(L, W) : null),
    [sport, L, W],
  );
  if (tex) {
    return (
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[L, W]} />
        <meshStandardMaterial map={tex} />
      </mesh>
    );
  }
  // Cricket: outfield inside the rope, 30-yard fielding circle, 22-yard pitch with creases.
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <shapeGeometry args={[loopShape(lo, 0)]} />
        <meshStandardMaterial color="#4a9b42" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]}>
        <ringGeometry args={[27.33, 27.43, 128]} />
        <meshBasicMaterial color="#f4f4f4" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <planeGeometry args={[20.12 + 2 * 1.22, 3.05]} />
        <meshStandardMaterial color="#c9b98a" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} rotation-x={-Math.PI / 2} position={[s * (20.12 / 2), 0.07, 0]}>
          <planeGeometry args={[0.05, 3.05]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

/** Goal: 7.32 m × 2.44 m (IFAB Law 1), 0.12 m posts. */
function Goal({ x, dir }: { x: number; dir: number }) {
  const post = 0.12;
  return (
    <group position={[x + (dir * post) / 2, 0, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 1.22, s * (3.66 + post / 2)]}>
          <boxGeometry args={[post, 2.44, post]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
      <mesh position={[0, 2.44 + post / 2, 0]}>
        <boxGeometry args={[post, post, 7.32 + 2 * post]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

/** Basketball hoop: rim 3.05 m high, backboard 1.83 × 1.07 m 1.22 m from the baseline [not fetched]. */
function Hoop({ x, dir }: { x: number; dir: number }) {
  return (
    <group>
      <mesh position={[x + dir * 0.35, 3.35, 0]}>
        <boxGeometry args={[0.03, 1.07, 1.83]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.7} />
      </mesh>
      <mesh position={[x, 3.05, 0]} rotation-x={-Math.PI / 2}>
        <torusGeometry args={[0.23, 0.01, 8, 32]} />
        <meshStandardMaterial color="#e05a00" />
      </mesh>
      <mesh position={[x + dir * 1.6, 1.6, 0]}>
        <boxGeometry args={[0.15, 3.2, 0.15]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
}
