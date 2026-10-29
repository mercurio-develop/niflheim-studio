"use client";

import { useMemo } from "react";
import { PivotControls } from "@react-three/drei";
import * as THREE from "three";
import type { Block } from "@/lib/store";

const GREY = "#9a968f";
const PICKED = "#c9b98f";

// A ramp: a wedge rising from the front (+z) to the back, its base on the floor, 1 m each way.
function useRamp() {
  return useMemo(() => {
    const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(-0.5, 1)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.rotateY(Math.PI / 2);
    g.translate(-0.5, 0, 0);
    return g;
  }, []);
}

// The greybox blocks in a stage viewer, shaded grey so the keyframes see plain shapes to paint.
// With onPick a click selects one; the selected one is tinted and carries a move gizmo (onMove gives
// its new base point, kept on the floor's height).
export function Blocks(props: { blocks: Block[]; picked?: string | null; onPick?: (id: string) => void; onMove?: (id: string, at: [number, number, number]) => void }) {
  const ramp = useRamp();
  return (
    <>
      <hemisphereLight args={["#ffffff", "#3a3631", 0.6]} />
      <directionalLight position={[3, 8, 4]} intensity={1.2} />
      {props.blocks.map((b) => {
        const [w, h, d] = b.size;
        const picked = b.id === props.picked;
        const mesh = (
          <mesh
            position={b.kind === "ramp" ? [0, 0, 0] : [0, h / 2, 0]}
            scale={[w, h, d]}
            onClick={
              props.onPick &&
              ((e) => {
                if (e.delta > 4) return;
                e.stopPropagation();
                props.onPick!(b.id);
              })
            }
          >
            {b.kind === "box" && <boxGeometry args={[1, 1, 1]} />}
            {b.kind === "cylinder" && <cylinderGeometry args={[0.5, 0.5, 1, 24]} />}
            {b.kind === "ramp" && <primitive object={ramp} attach="geometry" dispose={null} />}
            <meshStandardMaterial color={picked ? PICKED : GREY} roughness={1} />
          </mesh>
        );
        return (
          <group key={b.id}>
            <group position={b.at} rotation={[0, (b.turn * Math.PI) / 180, 0]}>
              {mesh}
            </group>
            {picked && props.onMove && (
              <PivotControls
                matrix={new THREE.Matrix4().makeTranslation(new THREE.Vector3(...b.at))}
                autoTransform={false}
                disableRotations
                disableScaling
                activeAxes={[true, false, true]}
                depthTest={false}
                fixed
                scale={80}
                lineWidth={3}
                onDrag={(_l, _dl, w) => {
                  const p = new THREE.Vector3().setFromMatrixPosition(w);
                  props.onMove!(b.id, [p.x, b.at[1], p.z]);
                }}
              />
            )}
          </group>
        );
      })}
    </>
  );
}
