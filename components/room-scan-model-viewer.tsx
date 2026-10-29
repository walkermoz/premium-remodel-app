"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./room-scans-panel.module.css";

export default function RoomScanModelViewer({
  scanId,
  roomName,
}: {
  scanId: string;
  roomName: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let active = true;
    let cleanup = () => {};
    void (async () => {
      try {
        const THREE = await import("three");
        const [{ USDZLoader }, { OrbitControls }] = await Promise.all([
          import("three/examples/jsm/loaders/USDZLoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if (!active) return;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f5f8);
        const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 500);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        container.replaceChildren(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        scene.add(new THREE.HemisphereLight(0xffffff, 0x465a6d, 2.4));
        const light = new THREE.DirectionalLight(0xffffff, 2.2);
        light.position.set(4, 8, 5);
        scene.add(light);
        const object = await new USDZLoader().loadAsync(
          `/api/room-scans/${encodeURIComponent(scanId)}/asset?kind=model`,
        );
        if (!active) return;
        scene.add(object);
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z, 1);
        camera.position.set(
          center.x + radius * 1.25,
          center.y + radius * 1.05,
          center.z + radius * 1.25,
        );
        camera.near = Math.max(radius / 1000, 0.01);
        camera.far = radius * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        controls.update();
        const resize = () => {
          const width = Math.max(container.clientWidth, 280);
          const height = Math.max(container.clientHeight, 260);
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container);
        resize();
        let frame = 0;
        const draw = () => {
          controls.update();
          renderer.render(scene, camera);
          frame = requestAnimationFrame(draw);
        };
        draw();
        cleanup = () => {
          cancelAnimationFrame(frame);
          observer.disconnect();
          controls.dispose();
          object.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            node.geometry.dispose();
            const materials = Array.isArray(node.material)
              ? node.material
              : [node.material];
            materials.forEach((material) => material.dispose());
          });
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch {
        if (active)
          setError(
            "The browser could not render this USDZ model. Download it to open in Apple Quick Look or another 3D viewer.",
          );
      }
    })();
    return () => {
      active = false;
      cleanup();
    };
  }, [scanId]);

  return (
    <div className={styles.modelWrap}>
      <div
        ref={host}
        className={styles.modelViewer}
        role="img"
        aria-label={`Interactive 3D model of ${roomName}`}
      >
        {!error && <span>Loading 3D room…</span>}
      </div>
      {error && <p className={styles.modelError}>{error}</p>}
    </div>
  );
}
