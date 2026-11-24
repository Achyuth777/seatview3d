import { useEffect, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import CameraControls from 'camera-controls';
import * as THREE from 'three';
import type { Vec3 } from '../engine/common/geometry';
import { fitVerticalFov } from '../engine/common/viewFit';

CameraControls.install({
  THREE: {
    Vector2: THREE.Vector2,
    Vector3: THREE.Vector3,
    Vector4: THREE.Vector4,
    Quaternion: THREE.Quaternion,
    Matrix4: THREE.Matrix4,
    Spherical: THREE.Spherical,
    Box3: THREE.Box3,
    Sphere: THREE.Sphere,
    Raycaster: THREE.Raycaster,
  },
});

export interface CameraPose {
  eye: Vec3;
  target: Vec3;
}

interface Props {
  /** Pose to fly to. */
  pose: CameraPose;
  /** In seat view the eye is locked to the seat; orbiting is only allowed in the overview. */
  locked: boolean;
  animate: boolean;
  /** Half-angle the subject spans from this pose; narrow screens widen the view to fit it. */
  subjectHalfAngle: number;
  /** Identifies the pose; onRest reports it once the camera has stopped there (never for a superseded pose). */
  restKey?: string;
  onRest?: (key: string, position: { x: number; y: number; z: number }) => void;
}

/** Drives the camera with camera-controls (MIT, yomotsu/camera-controls). */
export function CameraRig({ pose, locked, animate, subjectHalfAngle, restKey, onRest }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const [controls, setControls] = useState<CameraControls | null>(null);
  const targetFov = fitVerticalFov(width / Math.max(height, 1), subjectHalfAngle);
  const latest = useRef<string | undefined>(undefined);
  const onRestRef = useRef(onRest);
  const pendingRest = useRef<string | null>(null);
  onRestRef.current = onRest;

  // Created inside the effect so React StrictMode's mount → unmount → mount cycle
  // never leaves us holding a disposed instance.
  useEffect(() => {
    const c = new CameraControls(camera, dom);
    c.smoothTime = 0.6;
    setControls(c);
    return () => c.dispose();
  }, [camera, dom]);

  useEffect(() => {
    if (!controls) return;
    controls.enabled = !locked;
    const { eye, target } = pose;
    // A new pose interrupts any transition in progress; only the latest one may report rest.
    latest.current = restKey;
    void controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, animate).then(() => {
      // Report on the next frame, after controls.update() has actually moved the camera.
      if (restKey !== undefined && latest.current === restKey) pendingRest.current = restKey;
    });
  }, [controls, pose, locked, animate, restKey, camera]);

  useFrame((_, delta) => {
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = animate ? THREE.MathUtils.damp(camera.fov, targetFov, 6, delta) : targetFov;
      camera.updateProjectionMatrix();
    }
    controls?.update(delta);
    const key = pendingRest.current;
    if (key !== null) {
      pendingRest.current = null;
      if (key === latest.current) {
        const p = camera.position;
        onRestRef.current?.(key, { x: p.x, y: p.y, z: p.z });
      }
    }
  });

  return null;
}
