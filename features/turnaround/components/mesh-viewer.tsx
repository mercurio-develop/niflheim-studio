"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const HEIGHT = 1.8; // shown as a person-sized figure, feet on the grid

// Hunyuan's mesh has no texture yet, so it is shown as clay: one soft material over every part.
// It arrives at an arbitrary scale; it is scaled to HEIGHT and stood on the floor.
function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const root = scene.clone(true);
    const clay = new THREE.MeshStandardMaterial({ color: "#c9b8a8", roughness: 0.75, metalness: 0 });
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = clay;
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = HEIGHT / (size.y || 1);
    const centre = box.getCenter(new THREE.Vector3());
    root.scale.setScalar(s);
    root.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
    return root;
  }, [scene]);
  return <primitive object={model} />;
}

// Turns slowly on its own until the user drags it.
export function MeshViewer({ url, className }: { url: string; className?: string }) {
  const [turning, setTurning] = useState(true);
  return (
    <div className={className}>
      <Canvas camera={{ position: [0, 1.2, 3.4], fov: 35 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2.5, 4, 2]} intensity={1.4} />
        <directionalLight position={[-2.5, 1.5, -2]} intensity={0.5} />
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
        <Grid args={[6, 6]} cellSize={0.25} sectionSize={1} fadeDistance={7} cellColor="#6b6470" sectionColor="#8a8290" position={[0, -0.001, 0]} />
        <OrbitControls makeDefault target={[0, HEIGHT / 2, 0]} enablePan={false} minDistance={1.6} maxDistance={6} autoRotate={turning} autoRotateSpeed={1.2} onStart={() => setTurning(false)} />
      </Canvas>
    </div>
  );
}
