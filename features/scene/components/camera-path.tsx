"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line, PivotControls } from "@react-three/drei";
import * as THREE from "three";
import { FPS, type Pose, type Vec } from "@/lib/camera";

const OK = new THREE.Color("#5eead4");
const OUT = new THREE.Color("#f87171");

// The camera move inside the stage viewer. Overview: the path as a line (red where it leaves the
// space the stage holds), a dot at each end, and a small camera that runs along it while playing.
// Painting view: Play flies the viewer's own camera along the path, at the shot's real speed, and
// puts it back where it was when done. onStart: Overview's gizmo on the start, dragged along the
// ground and up and down, gives where the camera now starts.
export function CameraPath(props: { poses: Pose[]; inside: boolean[]; overview: boolean; playing: boolean; onDone: () => void; onStart?: (p: Vec) => void }) {
  const points = useMemo(() => props.poses.map((p) => new THREE.Vector3(...p.position)), [props.poses]);
  const colours = useMemo(() => props.inside.map((ok) => (ok ? OK : OUT)), [props.inside]);
  const marker = useRef<THREE.Group>(null);
  const get = useThree((s) => s.get); // the live camera and controls, read where they change
  const clock = useRef<number | null>(null);
  const saved = useRef<{ position: THREE.Vector3; quaternion: THREE.Quaternion } | null>(null);

  useEffect(() => {
    if (!props.playing) return;
    clock.current = null;
    const { camera } = get();
    const controls = get().controls as unknown as { enabled: boolean } | null;
    if (!props.overview) {
      saved.current = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
      if (controls) controls.enabled = false;
    }
    return () => {
      if (saved.current) {
        camera.position.copy(saved.current.position);
        camera.quaternion.copy(saved.current.quaternion);
        saved.current = null;
      }
      if (controls) controls.enabled = true;
    };
  }, [props.playing, props.overview, get]);

  useFrame((state) => {
    if (!props.playing || !props.poses.length) return;
    clock.current ??= state.clock.elapsedTime;
    const i = Math.floor((state.clock.elapsedTime - clock.current) * FPS);
    if (i >= props.poses.length) return props.onDone();
    const p = props.poses[i];
    if (props.overview && marker.current) {
      marker.current.position.set(...p.position);
      marker.current.lookAt(...p.target);
    } else if (!props.overview) {
      state.camera.position.set(...p.position);
      state.camera.lookAt(...p.target);
    }
  });

  if (!props.overview || points.length < 2) return null;
  const start = props.poses[0];
  return (
    <>
      {props.onStart && !props.playing && (
        <PivotControls
          matrix={new THREE.Matrix4().makeTranslation(points[0])}
          autoTransform={false}
          disableRotations
          disableScaling
          depthTest={false}
          fixed
          scale={90}
          lineWidth={3}
          onDrag={(_l, _dl, w) => {
            const p = new THREE.Vector3().setFromMatrixPosition(w);
            props.onStart!([p.x, Math.max(0.2, p.y), p.z]);
          }}
        />
      )}
      <Line points={points} vertexColors={colours} lineWidth={3} />
      <mesh position={points[0]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#5eead4" />
      </mesh>
      <mesh position={points.at(-1)!}>
        <sphereGeometry args={[0.12, 12, 12]} />
        <meshBasicMaterial color={props.inside.at(-1) ? "#5eead4" : "#f87171"} />
      </mesh>
      {/* Where the camera aims: the character's chest. */}
      <Line points={[points[0], new THREE.Vector3(...start.target)]} color="#5eead4" lineWidth={1} dashed dashSize={0.15} gapSize={0.1} transparent opacity={0.5} />
      <group ref={marker} position={points[0]} onUpdate={(g) => g.lookAt(...start.target)}>
        {/* A small camera: a box and its lens, looking down -z like three's cameras. */}
        <mesh rotation={[0, Math.PI, 0]}>
          <boxGeometry args={[0.18, 0.12, 0.22]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
        <mesh position={[0, 0, 0.16]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.07, 0.12, 12]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
      </group>
    </>
  );
}
