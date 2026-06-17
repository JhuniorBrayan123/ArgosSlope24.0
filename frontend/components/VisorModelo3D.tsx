/**
 * ARGOS SLOPE 4.0 — VisorModelo3D.
 *
 * Carga un archivo .obj (o .ply) estático generado por el pipeline
 * de captura HD y lo renderiza con controles de órbita.
 *
 * Soporta:
 *   - .obj + .mtl (material library)
 *   - .ply (sin textura, solo vertex colors)
 *
 * Usa Three.js puro (sin react-three-fiber) para evitar conflictos
 * con NubePuntos3D que ya usa R3F.
 *
 * Props:
 *   url     — URL del archivo .obj/.ply a cargar.
 *   height  — Alto del contenedor (default 480).
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

// ── Props ──────────────────────────────────────────────────────────

interface VisorModelo3DProps {
  url: string;
  height?: number;
}

type StatusCarga = 'cargando' | 'listo' | 'error';

// ── Utils ──────────────────────────────────────────────────────────

function esPly(url: string): boolean {
  return url.toLowerCase().endsWith('.ply');
}

function esObj(url: string): boolean {
  return url.toLowerCase().endsWith('.obj');
}

function urlBaseSinExtension(url: string): string {
  return url.replace(/\.(obj|ply)$/i, '');
}

// ── Componente ─────────────────────────────────────────────────────

export default function VisorModelo3D({
  url,
  height = 480,
}: VisorModelo3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
  } | null>(null);
  const [status, setStatus] = useState<StatusCarga>('cargando');
  const [errorMsg, setErrorMsg] = useState('');
  const [pointCount, setPointCount] = useState(0);

  // ── Inicializar escena Three.js (una vez) ──────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 640;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f1a);

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.01, 100);
    camera.position.set(2, 1.5, 3);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = false; // No needed for models
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.target.set(0, 0, 0);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-3, 1, -2);
    scene.add(fillLight);

    // Grid helper (opcional, ayuda a ver escala)
    const gridHelper = new THREE.GridHelper(4, 20, 0x333355, 0x222244);
    scene.add(gridHelper);

    // Animation loop
    let animId: number;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { scene, camera, renderer, controls };

    // ── Resize observer ──────────────────────────────────────────
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [height]);

  // ── Cargar modelo cuando cambia la URL ─────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return;

    const { scene, controls } = sceneRef.current;
    const prevGroup = scene.getObjectByName('modelo-hd');
    if (prevGroup) scene.remove(prevGroup);

    setStatus('cargando');
    setErrorMsg('');
    setPointCount(0);

    async function loadModel() {
      try {
        let group = new THREE.Group();
        group.name = 'modelo-hd';

        if (esPly(url)) {
          // ── .ply — vertex colors ──────────────────────────────
          const loader = new PLYLoader();
          const geometry = await loader.loadAsync(url);

          // Calcular centro y escalar
          geometry.computeVertexNormals();
          geometry.center();

          // Si tiene colores de vértice, usarlos
          let material: THREE.Material;
          if (geometry.hasAttribute('color')) {
            material = new THREE.PointsMaterial({
              size: 0.01,
              sizeAttenuation: true,
              vertexColors: true,
            });
            const mesh = new THREE.Points(geometry, material);
            group.add(mesh);
            setPointCount(geometry.attributes.position.count);
          } else {
            material = new THREE.MeshStandardMaterial({
              color: 0x88aaff,
              flatShading: true,
              side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geometry, material);
            group.add(mesh);
            // Convertir a triangulos si no lo está
            setPointCount(
              geometry.index
                ? geometry.index.count / 3
                : geometry.attributes.position.count / 3,
            );
          }
        } else if (esObj(url)) {
          // ── .obj — intentar con .mtl primero ─────────────────
          const baseUrl = urlBaseSinExtension(url);

          try {
            // Intentar cargar .mtl
            const mtlLoader = new MTLLoader();
            const materials = await mtlLoader.loadAsync(`${baseUrl}.mtl`);
            materials.preload();

            const objLoader = new OBJLoader();
            objLoader.setMaterials(materials);
            const obj = await objLoader.loadAsync(url);
            group = obj;
          } catch {
            // Sin .mtl — cargar .obj sin materiales
            const objLoader = new OBJLoader();
            const obj = await objLoader.loadAsync(url);
            group = obj;
          }

          group.name = 'modelo-hd';

          // Aplicar material por defecto si no tiene
          group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (!child.material) {
                child.material = new THREE.MeshStandardMaterial({
                  color: 0x88aaff,
                  flatShading: true,
                  side: THREE.DoubleSide,
                });
              }
              // Contar caras/puntos
              const geo = child.geometry;
              if (geo.index) {
                setPointCount((c) => c + geo.index.count / 3);
              } else if (geo.attributes.position) {
                setPointCount((c) => c + geo.attributes.position.count / 3);
              }
            }
          });

          // Escalar si es muy pequeño o grande
          const box = new THREE.Box3().setFromObject(group);
          const size = box.getSize(new THREE.Vector3()).length();
          if (size > 0 && (size < 0.1 || size > 10)) {
            const scale = 2.0 / size;
            group.scale.setScalar(scale);
          }

          // Centrar
          const center = box.getCenter(new THREE.Vector3());
          group.position.sub(center);
        } else {
          throw new Error(`Formato no soportado: ${url}`);
        }

        scene.add(group);

        // Ajustar controls al modelo
        const bbox = new THREE.Box3().setFromObject(group);
        const bboxSize = bbox.getSize(new THREE.Vector3());
        const bboxCenter = bbox.getCenter(new THREE.Vector3());
        const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z);

        if (maxDim > 0) {
          const dist = maxDim * 2.5;
          controls.target.copy(bboxCenter);
          sceneRef.current!.camera.position.set(
            bboxCenter.x + dist * 0.7,
            bboxCenter.y + dist * 0.5,
            bboxCenter.z + dist,
          );
          controls.minDistance = maxDim * 0.3;
          controls.maxDistance = maxDim * 8;
          controls.update();
        }

        setStatus('listo');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        setErrorMsg(msg);
        setStatus('error');
        console.error('[VisorModelo3D] Error al cargar modelo:', err);
      }
    }

    loadModel();
  }, [url]);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-xl border border-dark-border bg-[#0f0f1a]"
      style={{ width: '100%', height }}
    >
      {/* Indicador de carga */}
      {status === 'cargando' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f0f1a]/80">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
            <p className="text-sm text-dark-secondary">Cargando modelo 3D...</p>
            <p className="text-[11px] text-dark-secondary/40">
              Esto puede tomar unos segundos
            </p>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0f0f1a]/80">
          <div className="flex flex-col items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-6 py-4">
            <span className="text-sm text-red-400">Error al cargar modelo</span>
            <span className="max-w-xs text-center text-xs text-dark-secondary">
              {errorMsg}
            </span>
          </div>
        </div>
      )}

      {/* Info overlay */}
      {status === 'listo' && pointCount > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg border border-dark-border/60 bg-dark-surface/80 px-3 py-2 text-[11px] leading-relaxed backdrop-blur-sm">
          <p className="font-medium text-dark-accent">
            {pointCount.toLocaleString()} {esPly(url) ? 'puntos' : 'caras'}
          </p>
          <p className="text-[10px] text-dark-secondary/40">
            Arrastra para orbitar · Rueda para zoom
          </p>
        </div>
      )}
    </div>
  );
}
