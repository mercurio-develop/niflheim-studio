"use client";

import { Component, Suspense, useMemo, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const HEIGHT = 1.8; // shown as a person-sized figure, feet on the grid

// A coloured model carries vertex colours (scripts/mesh_colour.py) and shows them, softly lit; a
// shape-only one is shown as clay. It arrives at an arbitrary scale; it is scaled to HEIGHT and
// stood on the floor.
function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const painted = !!o.geometry.getAttribute("color");
      o.material = new THREE.MeshStandardMaterial(painted ? { vertexColors: true, roughness: 0.85, metalness: 0 } : { color: "#c9b8a8", roughness: 0.75, metalness: 0 });
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

// A model file that will not load (missing, half-written) says so instead of taking the step down.
class LoadError extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <p className="flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground">This 3D model could not be loaded. Generate it again.</p>;
    return this.props.children;
  }
}

// Turns slowly on its own until the user drags it.
export function MeshViewer({ url, className }: { url: string; className?: string }) {
  return (
    <div className={className}>
      <LoadError>
        <Scene url={url} />
      </LoadError>
    </div>
  );
}

function Scene({ url }: { url: string }) {
  const [turning, setTurning] = useState(true);
  return (
    <>
      <Canvas camera={{ position: [0, 1.2, 3.4], fov: 35 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }}>
        {/* About 1 in total where the key light hits: the colours come from flat-lit paintings,
            so more light washes them out and strong shading would double the painted shadows. */}
        <ambientLight intensity={0.55} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.0} />
        <directionalLight position={[-2.5, 1.5, -2]} intensity={0.25} />
        <Suspense fallback={null}>
          <Model url={url} />
        </Suspense>
        <Grid args={[6, 6]} cellSize={0.25} sectionSize={1} fadeDistance={7} cellColor="#6b6470" sectionColor="#8a8290" position={[0, -0.001, 0]} />
        <OrbitControls makeDefault target={[0, HEIGHT / 2, 0]} enablePan={false} minDistance={1.6} maxDistance={6} autoRotate={turning} autoRotateSpeed={1.2} onStart={() => setTurning(false)} />
      </Canvas>
    </>
  );
}
