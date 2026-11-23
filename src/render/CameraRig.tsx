import { useEffect, useState } from 'react';
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
}

/** Drives the camera with camera-controls (MIT, yomotsu/camera-controls). */
export function CameraRig({ pose, locked, animate, subjectHalfAngle }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const dom = useThree((s) => s.gl.domElement);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const [controls, setControls] = useState<CameraControls | null>(null);
  const targetFov = fitVerticalFov(width / Math.max(height, 1), subjectHalfAngle);

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
    void controls.setLookAt(eye.x, eye.y, eye.z, target.x, target.y, target.z, animate);
  }, [controls, pose, locked, animate]);

  useFrame((_, delta) => {
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = animate ? THREE.MathUtils.damp(camera.fov, targetFov, 6, delta) : targetFov;
      camera.updateProjectionMatrix();
    }
    controls?.update(delta);
  });

  return null;
}
