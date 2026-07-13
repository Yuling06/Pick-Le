// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Loader2 } from 'lucide-react';

// `url` should point at the backend, e.g. profile.avatar_url = "/api/files/<id>".
// Rotate: left-click drag. Zoom: scroll. Pan: right-click drag. All via OrbitControls.
export default function AvatarViewer({ url, className = '' }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 200);
    // Placeholder until the model loads and we know its real size - reset below.
    camera.position.set(0, 1.4, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.2;
    controls.maxDistance = 6;
    controls.maxPolarAngle = Math.PI * 0.85;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(2, 4, 3);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(-2, 2, -3);
    scene.add(rimLight);

    let mixer = null;
    let frameId = null;
    const clock = new THREE.Clock();

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        const model = gltf.scene;

        // Center + ground the model regardless of how the source .blend was authored.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;

        // Reframe the camera based on this model's ACTUAL height, rather than the fixed
        // "average adult" values it started with. Avatars here can genuinely range from
        // ~1.2m to ~2.5m (Key_HeightMin/Max extremes), so a fixed camera would clip the
        // head or leave excess empty floor for anything far from a "typical" height.
        const modelHeight = size.y || 1.7; // fallback in case something is degenerate
        controls.target.set(0, modelHeight * 0.5, 0);
        camera.position.set(0, modelHeight * 0.55, modelHeight * 1.2);
        controls.minDistance = modelHeight * 0.5;
        controls.maxDistance = modelHeight * 3.5;
        camera.updateProjectionMatrix();
        controls.update();

        scene.add(model);
        setLoading(false);

        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
        }
      },
      undefined,
      (err) => {
        console.error('Failed to load avatar .glb:', err);
        setError('Could not load the 3D avatar.');
        setLoading(false);
      }
    );

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
    };
  }, [url]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {error}
        </div>
      )}
    </div>
  );
}
