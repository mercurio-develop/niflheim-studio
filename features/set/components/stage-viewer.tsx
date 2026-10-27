"use client";

import { Suspense, useMemo } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { StageCamera } from "@/lib/stage-fill";

// The set as a 3D stage: MoGe's textured depth mesh, seen from where the painting was made.
// Unlit, so it reads exactly like the painting.
// A plain stage (MoGe only, camera at the origin looking down -z, y up) has fog in the viewport
// colour over its far edge and holes, a small orbit, and its field of view read off the mesh.
// A filled stage is levelled (lib/stage-fill.ts): floor at y = 0, metres, the painting's camera
// given by `camera`; its holes are painted from cameras around the painting's (set_fill.py
// PROBES), so the orbit reaches exactly as far as those did and needs no fog. Its meshes named
// "floor..." are the ground: only they take a click, which is where the character stands.
// "Guide" shades the geometry instead of the painting, with a 1 m grid on the floor, so a
// stretched face or a step in the ground shows at once.
const FOG = "#0d0c0b";

export type StagePoint = [number, number, number];
export type StageLook = "painting" | "guide";

// up: how far the camera may rise above the painting's eye line; down: sink below it.
// filled = set_fill.py PROBES: yaw 0.3, up 0.12, and a little down, which the floor plane covers.
const ORBIT = { plain: { yaw: 0.25, up: 0.12, down: 0.12 }, filled: { yaw: 0.3, up: 0.12, down: 0.06 } };

function useLook(scene: THREE.Object3D, look: StageLook) {
  // The GLB's own materials are kept aside, so switching back and forth is free.
  const painted = useMemo(() => {
    const map = new Map<THREE.Mesh, THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const old = m.material as THREE.MeshStandardMaterial;
      map.set(m, new THREE.MeshBasicMaterial({ map: old.map ?? null, color: old.map ? 0xffffff : old.color, side: THREE.DoubleSide }));
    });
    return map;
  }, [scene]);
  const guide = useMemo(() => new THREE.MeshStandardMaterial({ color: "#b9b4ab", roughness: 1, flatShading: true, side: THREE.DoubleSide }), []);
  const floor = useMemo(() => new THREE.MeshStandardMaterial({ color: "#6f8f86", roughness: 1, side: THREE.DoubleSide }), []);
  for (const [m, mat] of painted) m.material = look === "painting" ? mat : m.name.startsWith("floor") ? floor : guide;
}

function Mesh(props: { url: string; camera?: StageCamera; filled?: boolean; look: StageLook; onFloor?: (p: StagePoint) => void; children?: React.ReactNode }) {
  const { scene } = useGLTF(props.url);
  useLook(scene, props.look);
  const view = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const c = props.camera;
    if (c) {
      const m = new THREE.Matrix4().set(...(c.c2w.flat() as Parameters<THREE.Matrix4["set"]>));
      const position = new THREE.Vector3().setFromMatrixPosition(m);
      const quaternion = new THREE.Quaternion().setFromRotationMatrix(m);
      const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      const target = position.clone().addScaledVector(ahead, c.middle);
      return { position, quaternion, target, middle: c.middle, fov: c.fov, far: c.far * 2, floorY: c.floor ? 0 : null };
    }
    // Every vertex lies on a ray through a pixel, so the widest |y/z| is the top or bottom edge.
    let slope = 0;
    const zs: number[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || zs.length) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = -pos.getZ(i);
        if (z <= 0) continue;
        slope = Math.max(slope, Math.abs(pos.getY(i)) / z);
        if (i % 50 === 0) zs.push(z);
      }
    });
    zs.sort((a, b) => a - b);
    const middle = zs[zs.length >> 1] ?? 5;
    return {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
      target: new THREE.Vector3(0, 0, -middle),
      middle,
      fov: slope ? (2 * Math.atan(slope) * 180) / Math.PI : 55,
      far: Math.max(1, -box.min.z) * 2,
      floorY: null as number | null,
    };
  }, [scene, props.camera]);
  // OrbitControls measures azimuth about y from +z and polar from +y, around the target: the
  // limits sit either side of where the painting's camera is.
  const offset = view.position.clone().sub(view.target);
  const azimuth = Math.atan2(offset.x, offset.z);
  const polar = Math.acos(THREE.MathUtils.clamp(offset.y / offset.length(), -1, 1));
  const orbit = ORBIT[props.filled ? "filled" : "plain"];
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!props.onFloor || !e.object.name.startsWith("floor")) return;
    e.stopPropagation();
    props.onFloor([e.point.x, e.point.y, e.point.z]);
  };
  return (
    <>
      <PerspectiveCamera makeDefault fov={view.fov} near={0.05} far={view.far} position={view.position} quaternion={view.quaternion} />
      {!props.filled && props.look === "painting" && <fog attach="fog" args={[FOG, view.far * 0.225, view.far * 0.525]} />}
      {props.look === "guide" && (
        <>
          <hemisphereLight args={["#ffffff", "#3a3631", 1.4]} />
          <directionalLight position={[3, 8, 4]} intensity={1.6} />
          {view.floorY !== null && <gridHelper args={[Math.ceil(view.far), Math.ceil(view.far), "#2b2a27", "#2b2a27"]} position={[0, view.floorY + 0.005, 0]} />}
        </>
      )}
      <primitive object={scene} onClick={click} />
      {props.children}
      <OrbitControls
        makeDefault
        target={view.target}
        minAzimuthAngle={azimuth - orbit.yaw}
        maxAzimuthAngle={azimuth + orbit.yaw}
        minPolarAngle={polar - orbit.up}
        maxPolarAngle={polar + orbit.down}
        minDistance={view.middle * 0.35}
        maxDistance={view.middle * (props.filled ? 1.15 : 1.1)}
        rotateSpeed={0.4}
        enablePan={false}
        enableDamping
      />
    </>
  );
}

// A stand-in for the character until its 3D mesh is in: 1.7 m tall, standing on the floor.
export function StandIn(props: { at: StagePoint; height?: number }) {
  const h = props.height ?? 1.7;
  const r = h * 0.14;
  return (
    <mesh position={[props.at[0], props.at[1] + h / 2, props.at[2]]}>
      <capsuleGeometry args={[r, h - 2 * r, 6, 16]} />
      <meshBasicMaterial color="#f0b429" transparent opacity={0.85} />
    </mesh>
  );
}

export function StageViewer(props: { mesh: string; camera?: StageCamera; filled?: boolean; look?: StageLook; onFloor?: (p: StagePoint) => void; children?: React.ReactNode; className?: string }) {
  return (
    <div className={props.className} style={{ background: FOG }}>
      <Canvas dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={[FOG]} />
        <Suspense fallback={null}>
          <Mesh url={props.mesh} camera={props.camera} filled={props.filled} look={props.look ?? "painting"} onFloor={props.onFloor}>
            {props.children}
          </Mesh>
        </Suspense>
      </Canvas>
    </div>
  );
}
