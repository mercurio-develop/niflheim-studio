"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, useGLTF, useProgress } from "@react-three/drei";
import { LoadingDots } from "@/components/loading-dots";
import { cn } from "@/lib/utils";
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
// "pose" puts the camera at one fixed pose (no orbit), for capturing keyframes; onDrawn fires once
// the stage and everything in it has loaded and been drawn a few times.
// "Overview" leaves the painting's view for one from above and behind it, so the camera's path
// (drawn by the children) can be seen; the orbit limits do not apply there.
// "Camera" mode starts at the painting's view and flies freely (orbit, pan, zoom, no limits) with
// the shot's frame drawn over it, to frame a shot by eye. A double-click on the floor, in any mode,
// gives the point (onFloorDouble): where to put a camera.
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

// card: the cutouts the character card wears at this pose (a shot's pose), when not its own.
// n: which capture this is, so two keys with the same pose (a static shot) are still drawn apart.
export type StagePose = { position: StagePoint; target: StagePoint; at?: StagePoint; card?: Partial<Record<string, string>>; n?: number };

// A camera fixed at one pose, looking at its target; tells when a few frames have been drawn.
function PoseCamera(props: { pose: StagePose; fov: number; far: number; onDrawn?: (canvas: HTMLCanvasElement) => void }) {
  const gl = useThree((s) => s.gl);
  const drawn = useRef(0);
  const key = `${props.pose.n ?? ""}|${props.pose.position.join()}|${props.pose.target.join()}`;
  useEffect(() => void (drawn.current = 0), [key]);
  useFrame(({ camera }) => {
    camera.position.set(...props.pose.position);
    camera.lookAt(...props.pose.target);
    if (++drawn.current === 6) props.onDrawn?.(gl.domElement);
  });
  return <PerspectiveCamera makeDefault fov={props.fov} near={0.05} far={props.far} position={props.pose.position} />;
}

function Mesh(props: { url: string; camera?: StageCamera; filled?: boolean; look: StageLook; grid?: boolean; overview?: boolean; free?: boolean; pose?: StagePose; onDrawn?: (canvas: HTMLCanvasElement) => void; onFloor?: (p: StagePoint) => void; onFloorDouble?: (p: StagePoint) => void; children?: React.ReactNode }) {
  // useGLTF caches one scene per URL, and a three object lives in one scene at a time: a second
  // viewer of the same stage (Shots' camera and its off-screen keyframe capture) would take it
  // away from the first, which then draws an empty frame. Each viewer gets its own copy (the
  // geometry and textures are shared).
  const gltf = useGLTF(props.url);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  useLook(scene, props.look);
  const zoom = useModifierHeld();
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
  // Above and behind the painting's camera, to one side, looking between it and its look point.
  const over = useMemo(() => {
    const back = view.position.clone().sub(view.target).setY(0).normalize();
    const side = new THREE.Vector3(back.z, 0, -back.x);
    const position = view.position.clone().addScaledVector(back, view.middle * 0.55).addScaledVector(side, view.middle * 0.45).add(new THREE.Vector3(0, view.middle * 0.8, 0));
    return { position, target: view.position.clone().lerp(view.target, 0.6) };
  }, [view]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    // A drag to orbit ends in a click too: only a press that barely moved places anything.
    if (!props.onFloor || !e.object.name.startsWith("floor") || e.delta > 4) return;
    e.stopPropagation();
    props.onFloor([e.point.x, e.point.y, e.point.z]);
  };
  const double = (e: ThreeEvent<MouseEvent>) => {
    if (!props.onFloorDouble || !e.object.name.startsWith("floor")) return;
    e.stopPropagation();
    props.onFloorDouble([e.point.x, e.point.y, e.point.z]);
  };
  if (props.pose)
    return (
      <>
        <PoseCamera pose={props.pose} fov={view.fov} far={view.far} onDrawn={props.onDrawn} />
        <primitive object={scene} />
        {props.children}
      </>
    );
  if (props.free)
    return (
      <>
        <PerspectiveCamera key="free-camera" makeDefault fov={view.fov} near={0.05} far={view.far * 2} position={view.position} quaternion={view.quaternion} />
        <primitive object={scene} onDoubleClick={double} />
        {props.children}
        <OrbitControls key="free-orbit" makeDefault enableZoom={zoom} target={view.target} minDistance={0.3} maxDistance={view.middle * 4} rotateSpeed={0.4} screenSpacePanning enableDamping />
      </>
    );
  if (props.overview)
    return (
      <>
        <PerspectiveCamera key="over-camera" makeDefault fov={50} near={0.05} far={view.far * 2} position={over.position} />
        <hemisphereLight args={["#ffffff", "#3a3631", 1.2]} />
        <primitive object={scene} onDoubleClick={double} />
        {props.children}
        <OrbitControls key="over-orbit" makeDefault enableZoom={zoom} target={over.target} maxPolarAngle={Math.PI * 0.48} minDistance={1} maxDistance={view.middle * 4} rotateSpeed={0.5} enableDamping />
      </>
    );
  return (
    <>
      <PerspectiveCamera key="home-camera" makeDefault fov={view.fov} near={0.05} far={view.far} position={view.position} quaternion={view.quaternion} />
      {!props.filled && props.look === "painting" && <fog attach="fog" args={[FOG, view.far * 0.225, view.far * 0.525]} />}
      {props.look === "guide" && (
        <>
          <hemisphereLight args={["#ffffff", "#3a3631", 1.4]} />
          <directionalLight position={[3, 8, 4]} intensity={1.6} />
          {view.floorY !== null && props.grid !== false && <gridHelper args={[Math.ceil(view.far), Math.ceil(view.far), "#2b2a27", "#2b2a27"]} position={[0, view.floorY + 0.005, 0]} />}
        </>
      )}
      <primitive object={scene} onClick={click} onDoubleClick={double} />
      {props.children}
      <OrbitControls
        key="home-orbit"
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
        enableZoom={zoom}
        enableDamping
      />
    </>
  );
}

// While the stage mesh downloads the canvas is only fog: say so.
function StageLoading() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <LoadingDots />
      Loading the stage{progress > 0 ? ` · ${Math.round(progress)}%` : ""}
    </div>
  );
}

// The shot's frame (768x448) over camera mode: what the take will see.
export const SHOT_ASPECT = 768 / 448;

// The wheel zooms the stage only while Ctrl (or ⌘) is held: otherwise it scrolls the page, as it
// does everywhere else (OrbitControls skips preventDefault when zoom is off; zoom on the wheel took
// the page's scroll over the viewer, 05_submit Chrome test).
function useModifierHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setHeld(e.ctrlKey || e.metaKey);
    const off = () => setHeld(false);
    window.addEventListener("keydown", on);
    window.addEventListener("keyup", on);
    window.addEventListener("blur", off);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("keyup", on);
      window.removeEventListener("blur", off);
    };
  }, []);
  return held;
}

export function StageViewer(props: { mesh: string; camera?: StageCamera; filled?: boolean; look?: StageLook; grid?: boolean; overview?: boolean; free?: boolean; pose?: StagePose; onDrawn?: (canvas: HTMLCanvasElement) => void; onFloor?: (p: StagePoint) => void; onFloorDouble?: (p: StagePoint) => void; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative", props.className)} style={{ background: FOG }}>
      <StageLoading />
      {!props.pose && <span className="pointer-events-none absolute right-2 bottom-2 z-10 rounded border bg-background/70 px-1.5 py-0.5 text-xs text-muted-foreground">Ctrl + scroll to zoom</span>}
      {props.free && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="h-full max-w-full rounded-sm border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" style={{ aspectRatio: SHOT_ASPECT }} />
        </div>
      )}
      <Canvas dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}>
        <color attach="background" args={[FOG]} />
        <Suspense fallback={null}>
          <Mesh url={props.mesh} camera={props.camera} filled={props.filled} look={props.look ?? "painting"} grid={props.grid} overview={props.overview} free={props.free} pose={props.pose} onDrawn={props.onDrawn} onFloor={props.onFloor} onFloorDouble={props.onFloorDouble}>
            {props.children}
          </Mesh>
        </Suspense>
      </Canvas>
    </div>
  );
}
