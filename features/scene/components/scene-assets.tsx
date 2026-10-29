"use client";

import { Suspense, useMemo } from "react";
import { PivotControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SceneAsset } from "@/lib/store";

// One asset's model standing on the stage: scaled to its height, its base on the floor at `at`,
// turned about y (the model faces +z as Hunyuan3D makes it).
function Model(props: { url: string; asset: SceneAsset; picked: boolean; onPick?: () => void }) {
  const { scene } = useGLTF(props.url);
  const fit = useMemo(() => {
    const copy = scene.clone(true);
    // Unlit vertex colours, like the stage and the character card: the GLB's PBR material reads as
    // black metal without an environment.
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = new THREE.MeshBasicMaterial({ vertexColors: !!m.geometry.attributes.color, color: m.geometry.attributes.color ? 0xffffff : 0x9a968f });
    });
    const box = new THREE.Box3().setFromObject(copy);
    const size = box.getSize(new THREE.Vector3());
    const k = size.y > 0 ? 1 / size.y : 1;
    const centre = box.getCenter(new THREE.Vector3());
    copy.position.set(-centre.x * k, -box.min.y * k, -centre.z * k);
    copy.scale.setScalar(k);
    return copy;
  }, [scene]);
  const a = props.asset;
  return (
    <group position={a.at} rotation={[0, (a.turn * Math.PI) / 180, 0]} scale={a.height}>
      <primitive
        object={fit}
        onClick={
          props.onPick &&
          ((e: { delta: number; stopPropagation: () => void }) => {
            if (e.delta > 4) return;
            e.stopPropagation();
            props.onPick!();
          })
        }
      />
      {props.picked && (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.55, 0.62, 32]} />
          <meshBasicMaterial color="#fbbf24" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// The scene's assets that have a model and a spot. With onPick a click selects one; the selected
// one carries a move gizmo along the floor (onMove gives its new base point).
// wait: no Suspense of its own, so the viewer waits for the models before it draws (keyframes).
export function SceneAssets(props: { projectId: string; assets: SceneAsset[]; wait?: boolean; picked?: string | null; onPick?: (id: string) => void; onMove?: (id: string, at: [number, number, number]) => void }) {
  return (
    <>
      {props.assets.map((a) =>
        a.glb && a.at ? (
          <group key={a.id}>
            {props.wait ? (
              <Model url={`/api/files/${props.projectId}/${a.glb}`} asset={a} picked={false} />
            ) : (
              <Suspense fallback={null}>
                <Model url={`/api/files/${props.projectId}/${a.glb}`} asset={a} picked={a.id === props.picked} onPick={props.onPick && (() => props.onPick!(a.id))} />
              </Suspense>
            )}
            {a.id === props.picked && props.onMove && (
              <PivotControls
                matrix={new THREE.Matrix4().makeTranslation(new THREE.Vector3(...a.at))}
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
                  props.onMove!(a.id, [p.x, a.at![1], p.z]);
                }}
              />
            )}
          </group>
        ) : null,
      )}
    </>
  );
}
