"use client";

import { Suspense, useMemo } from "react";
import { PivotControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { SceneAsset } from "@/lib/store";
import { CharacterCard } from "./character-card";

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

function Card(props: { projectId: string; asset: SceneAsset; picked?: boolean; onPick?: () => void }) {
  const a = props.asset;
  return <CharacterCard cutouts={Object.fromEntries(Object.entries(a.cutouts!).map(([v, f]) => [v, `/api/files/${props.projectId}/${f}`]))} at={a.at!} height={a.height} turn={a.turn} picked={props.picked} onPick={props.onPick} />;
}

// The gizmo on whatever is picked on the stage: arrows move it along the floor (its height stays),
// the ring turns it about y. turn in degrees, as SceneAsset and Placement keep it.
export function FloorGizmo(props: { at: [number, number, number]; turn: number; onMove: (at: [number, number, number], turn: number) => void }) {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...props.at), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (props.turn * Math.PI) / 180), new THREE.Vector3(1, 1, 1));
  return (
    <PivotControls
      matrix={matrix}
      autoTransform={false}
      disableScaling
      disableSliders
      activeAxes={[true, false, true]}
      depthTest={false}
      fixed
      scale={80}
      lineWidth={3}
      onDrag={(_l, _dl, w) => {
        const p = new THREE.Vector3().setFromMatrixPosition(w);
        const y = new THREE.Euler().setFromRotationMatrix(w, "YXZ").y;
        props.onMove([p.x, props.at[1], p.z], Math.round((y * 180) / Math.PI));
      }}
    />
  );
}

// A cast member (a character asset) is a card, like the main character; an object, its model.
export const assetReady = (a: SceneAsset) => (a.kind === "character" ? ["front", "threequarter", "side", "back"].every((v) => a.cutouts?.[v as "front"]) : !!a.glb);

// The scene's assets that are made and have a spot. With onPick a click selects one (a model or a
// character card); the selected one carries the floor gizmo (onMove gives its new base point and turn).
// wait: no Suspense of its own, so the viewer waits for the models before it draws (keyframes).
export function SceneAssets(props: { projectId: string; assets: SceneAsset[]; wait?: boolean; picked?: string | null; onPick?: (id: string) => void; onMove?: (id: string, at: [number, number, number], turn: number) => void }) {
  return (
    <>
      {props.assets.map((a) =>
        assetReady(a) && a.at ? (
          <group key={a.id}>
            {a.kind === "character" ? (
              props.wait ? (
                <Card projectId={props.projectId} asset={a} />
              ) : (
                <Suspense fallback={null}>
                  <Card projectId={props.projectId} asset={a} picked={a.id === props.picked} onPick={props.onPick && (() => props.onPick!(a.id))} />
                </Suspense>
              )
            ) : props.wait ? (
              <Model url={`/api/files/${props.projectId}/${a.glb}`} asset={a} picked={false} />
            ) : (
              <Suspense fallback={null}>
                <Model url={`/api/files/${props.projectId}/${a.glb}`} asset={a} picked={a.id === props.picked} onPick={props.onPick && (() => props.onPick!(a.id))} />
              </Suspense>
            )}
            {a.id === props.picked && props.onMove && <FloorGizmo at={a.at} turn={a.turn} onMove={(at, turn) => props.onMove!(a.id, at, turn)} />}
          </group>
        ) : null,
      )}
    </>
  );
}
