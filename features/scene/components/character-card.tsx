"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ViewId } from "@/lib/store";
import type { StagePoint } from "./stage-viewer";

// The character standing in the set until there is a 3D mesh of them: a card cut from the
// turnaround that always turns to the camera, showing the view that matches the angle the camera
// sees them from. Angles are about +y, measured as atan2(x, z): `turn` 0 faces +z (towards the
// painting's camera), positive faces towards +x (screen right). rel = the camera's angle seen
// from the character minus their facing: 0 shows the front; +45 and +90 show them turned
// towards screen left, which is how the turnaround's three-quarter and side views face; at a
// negative rel the same view is mirrored.
const PICK: { view: ViewId; at: number }[] = [
  { view: "front", at: 0 },
  { view: "threequarter", at: 45 },
  { view: "side", at: 90 },
  { view: "back", at: 180 },
];

type Crop = { x: number; y: number; w: number; h: number }; // the figure's box in the image, 0..1

// The figure's box in a cutout (alpha above 32), so the card is as tall as the figure, feet down.
function cropOf(img: HTMLImageElement): Crop {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  let x0 = width, y0 = height, x1 = 0, y1 = 0;
  for (let y = 0; y < height; y += 2)
    for (let x = 0; x < width; x += 2)
      if (data[(y * width + x) * 4 + 3] > 32) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 <= x0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0 / width, y: y0 / height, w: (x1 - x0 + 2) / width, h: (y1 - y0 + 2) / height };
}

// live: where they stand this frame, when they walk (CameraPath writes it); `at` otherwise.
export function CharacterCard(props: { cutouts: Partial<Record<ViewId, string>>; at: StagePoint; height: number; turn: number; live?: React.RefObject<StagePoint | null> }) {
  const views = PICK.filter((p) => props.cutouts[p.view]);
  const textures = useTexture(views.map((p) => props.cutouts[p.view]!));
  const [crops, setCrops] = useState<Crop[] | null>(null);
  const shown = useRef(-1);
  useEffect(() => {
    for (const t of textures) t.colorSpace = THREE.SRGBColorSpace;
    setCrops(textures.map((t) => cropOf(t.image as HTMLImageElement)));
  }, [textures]);
  const worn = useRef<THREE.Texture[] | null>(null); // the cutouts the card last put on
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), []);
  useEffect(() => void (shown.current = -1), [props.height]); // resize on the next frame

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m || !crops) return;
    // New cutouts (another pose): put the matching one on now, whatever the angle.
    if (worn.current !== textures) {
      worn.current = textures;
      shown.current = -1;
    }
    const at = props.live?.current ?? props.at;
    m.position.set(at[0], at[1] + props.height / 2, at[2]);
    const dx = camera.position.x - at[0];
    const dz = camera.position.z - at[2];
    // A camera standing in them (first person) sees through them: the card would fill the frame.
    m.visible = Math.hypot(dx, dz) > 0.3;
    m.rotation.y = Math.atan2(dx, dz); // face the camera (the plane looks down +z)
    // Where the camera is, seen from the character: their facing is `turn` from the camera's +z.
    let rel = ((Math.atan2(dx, dz) * 180) / Math.PI - props.turn + 540) % 360 - 180;
    const mirror = rel < 0;
    rel = Math.abs(rel);
    let best = 0;
    views.forEach((p, i) => {
      if (Math.abs(p.at - rel) < Math.abs(views[best].at - rel)) best = i;
    });
    if (best !== shown.current || m.scale.x * (mirror ? -1 : 1) < 0) {
      shown.current = best;
      const t = textures[best];
      const c = crops[best];
      t.repeat.set(c.w, c.h);
      t.offset.set(c.x, 1 - c.y - c.h);
      material.map = t;
      material.needsUpdate = true;
      const img = t.image as HTMLImageElement;
      const w = (props.height * (c.w * img.naturalWidth)) / (c.h * img.naturalHeight);
      m.scale.set(w * (mirror ? -1 : 1), props.height, 1);
    }
  });

  if (!views.length) return null;
  return (
    <mesh ref={mesh} position={[props.at[0], props.at[1] + props.height / 2, props.at[2]]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
