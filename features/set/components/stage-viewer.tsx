"use client";

import { Suspense, useMemo } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";

// The set as a 3D stage: MoGe's textured depth mesh, seen from where the painting was made
// (camera at the origin looking down -z, y up). Unlit, so it reads exactly like the painting.
// Fog in the viewport colour hides the far edge and the holes where the painting knows nothing,
// and the orbit is kept to a small turn around the start, since behind the painted surfaces
// there is nothing. The field of view is read off the mesh, so the first frame is the painting.
// A filled stage (filled: its holes painted from nearby cameras, a sky sphere behind it) turns
// further and needs no fog; its first mesh is still MoGe's, which the camera is read from.
const FOG = "#0d0c0b";

export type StagePoint = [number, number, number];

// up: how far the camera may rise above the painting's eye line; down: sink below it. The fill
// paints views from above, never from below the floor, so a filled stage still sinks only a little.
const ORBIT = { plain: { yaw: 0.25, up: 0.12, down: 0.12 }, filled: { yaw: 0.45, up: 0.2, down: 0.06 } };

function Mesh(props: { url: string; filled?: boolean; onFloor?: (p: StagePoint) => void; children?: React.ReactNode }) {
  const { scene } = useGLTF(props.url);
  const { depth, middle, fov } = useMemo(() => {
    let slope = 0;
    const zs: number[] = [];
    let first = true;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const old = m.material as THREE.MeshStandardMaterial;
      m.material = new THREE.MeshBasicMaterial({ map: old.map ?? null, color: old.map ? 0xffffff : old.color, side: THREE.DoubleSide });
      if (!first) return;
      first = false;
      // Every vertex lies on a ray through a pixel, so the widest |y/z| is the top or bottom edge.
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = -pos.getZ(i);
        if (z <= 0) continue;
        slope = Math.max(slope, Math.abs(pos.getY(i)) / z);
        if (i % 50 === 0) zs.push(z);
      }
    });
    zs.sort((a, b) => a - b);
    const box = new THREE.Box3().setFromObject(scene);
    return { depth: Math.max(1, -box.min.z), middle: zs[zs.length >> 1] ?? 5, fov: slope ? (2 * Math.atan(slope) * 180) / Math.PI : 55 };
  }, [scene]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!props.onFloor) return;
    e.stopPropagation();
    props.onFloor([e.point.x, e.point.y, e.point.z]);
  };
  const orbit = ORBIT[props.filled ? "filled" : "plain"];
  return (
    <>
      <PerspectiveCamera makeDefault fov={fov} near={0.05} far={depth * 2} position={[0, 0, 0]} />
      {!props.filled && <fog attach="fog" args={[FOG, depth * 0.45, depth * 1.05]} />}
      <primitive object={scene} onClick={click} />
      {props.children}
      {/* Turn around the middle of the set, straight ahead, so the start is the painting's own view. */}
      <OrbitControls
        makeDefault
        target={[0, 0, -middle]}
        minAzimuthAngle={-orbit.yaw}
        maxAzimuthAngle={orbit.yaw}
        minPolarAngle={Math.PI / 2 - orbit.up}
        maxPolarAngle={Math.PI / 2 + orbit.down}
        minDistance={middle * 0.35}
        maxDistance={middle * 1.1}
        rotateSpeed={0.4}
        enablePan={false}
        enableDamping
      />
    </>
  );
}

export function StageViewer(props: { mesh: string; filled?: boolean; onFloor?: (p: StagePoint) => void; children?: React.ReactNode; className?: string }) {
  return (
    <div className={props.className} style={{ background: FOG }}>
      <Canvas dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={[FOG]} />
        <Suspense fallback={null}>
          <Mesh url={props.mesh} filled={props.filled} onFloor={props.onFloor}>
            {props.children}
          </Mesh>
        </Suspense>
      </Canvas>
    </div>
  );
}
