"""
ARGOS SLOPE 4.0 — Captura HD con Open3D Meshing.

Recibe una señal MQTT, congela el frame actual RGB + depth map,
genera una nube de puntos densa, aplica Poisson Surface Reconstruction
y guarda el resultado como .obj + .mtl en ``capturas_hd/``.

Flujo:
  1. ``freeze(rgb, depth)`` — clona los frames actuales (thread-safe)
  2. ``process()`` — ejecuta el meshing pesado en otro hilo
  3. ``_mesh()`` — Open3D pipeline (estadística → normales → Poisson → .obj)
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from threading import Lock, Thread
from typing import Callable, Optional

import numpy as np

from edge.config import config

logger = logging.getLogger(__name__)

# ── Extensiones de nombres de archivo ──────────────────────────────
MESH_EXTENSION = ".obj"
TEXTURE_EXTENSION = ".jpg"


class HdCaptureManager:
    """
    Gestiona la captura HD bajo demanda.

    Args:
        on_complete: Callback opcional que se invoca cuando la malla
                     se ha generado. Recibe el nombre del archivo .obj.
    """

    def __init__(
        self,
        on_complete: Optional[Callable[[str], None]] = None,
    ) -> None:
        self._lock = Lock()
        self._frozen_rgb: Optional[np.ndarray] = None
        self._frozen_depth: Optional[np.ndarray] = None
        self._frame_count: int = 0
        self._busy = False
        self._on_complete = on_complete
        self._output_dir = Path(config.hd_capture_dir)
        self._output_dir.mkdir(parents=True, exist_ok=True)

    # ── Propiedades ─────────────────────────────────────────────────

    @property
    def is_busy(self) -> bool:
        """True mientras se está generando una malla."""
        return self._busy

    # ── API pública ─────────────────────────────────────────────────

    def freeze(self, rgb: np.ndarray, depth: np.ndarray, frame_count: int) -> None:
        """
        Congela el frame actual para la captura HD.

        Se llama desde el hilo principal (cámara). Es thread-safe.
        Si ya hay una captura en progreso, ignora la llamada.
        """
        if self._busy:
            logger.warning("Captura HD ya en progreso — ignorando.")
            return

        with self._lock:
            self._frozen_rgb = rgb.copy()
            self._frozen_depth = depth.copy()
            self._frame_count = frame_count

        logger.info(
            "Frame congelado para captura HD (frame=%d, shape=%s).",
            frame_count,
            rgb.shape,
        )

    def process(self) -> None:
        """
        Inicia el meshing en un hilo separado.

        No bloquea el loop de la cámara.
        """
        with self._lock:
            if self._frozen_rgb is None or self._frozen_depth is None:
                logger.warning("No hay frame congelado — abortando captura HD.")
                return
            if self._busy:
                logger.warning("Ya hay un proceso de meshing en ejecución.")
                return
            self._busy = True

        thread = Thread(target=self._mesh, daemon=True, name="hd-meshing")
        thread.start()
        logger.info("Meshing HD iniciado en hilo separado.")

    # ── Open3D pipeline ────────────────────────────────────────────

    def _mesh(self) -> None:
        """Pipeline completo de generación de malla (corre en hilo separado)."""
        import open3d as o3d

        with self._lock:
            rgb = self._frozen_rgb.copy()
            depth = self._frozen_depth.copy()
            fc = self._frame_count

        timestamp = time.strftime("%Y%m%d_%H%M%S")
        stem = f"talud_hd_{timestamp}_frame{fc}"
        obj_path = self._output_dir / f"{stem}{MESH_EXTENSION}"
        tex_path = self._output_dir / f"{stem}{TEXTURE_EXTENSION}"

        try:
            # ── 1. Crear nube de puntos densa (todos los píxeles) ──
            # Usa los MISMOS intrínsecos que PointCloudGenerator (Fix 3)
            logger.info("HD: Generando nube de puntos densa...")
            h, w = rgb.shape[:2]
            fx = float(w * 1.1)    # mismo que en generator.py
            fy = fx
            cx, cy = w / 2.0, h / 2.0
            max_depth_m = 5.0      # mismo rango que la normalización MiDaS

            # Coordenadas de píxeles
            u, v = np.meshgrid(np.arange(w), np.arange(h))
            u_f = u.astype(np.float32)
            v_f = v.astype(np.float32)
            z = depth.astype(np.float32)

            # Proyección pinhole (con filtro de profundidad)
            valid = (z > 0.1) & (z < max_depth_m)
            x = (u_f[valid] - cx) * z[valid] / fx
            y = (v_f[valid] - cy) * z[valid] / fy
            z_valid = z[valid]

            # Colores (solo píxeles válidos)
            r = rgb[:, :, 0].astype(np.float32)[valid] / 255.0
            g = rgb[:, :, 1].astype(np.float32)[valid] / 255.0
            b = rgb[:, :, 2].astype(np.float32)[valid] / 255.0

            # Stack N×6
            xyz = np.column_stack([x, y, z_valid])
            colors = np.column_stack([r, g, b])

            logger.info("HD: Nube densa = %d puntos", len(xyz))

            if len(xyz) < 1000:
                logger.warning("HD: Muy pocos puntos (%d) — abortando.", len(xyz))
                self._busy = False
                return

            # ── 2. Construir Open3D point cloud ────────────────────
            pcd = o3d.geometry.PointCloud()
            pcd.points = o3d.utility.Vector3dVector(xyz)
            pcd.colors = o3d.utility.Vector3dVector(colors)

            # ── 3. Remover outliers estadísticos ───────────────────
            logger.info("HD: Removiendo outliers...")
            pcd, _ = pcd.remove_statistical_outlier(
                nb_neighbors=20, std_ratio=2.0
            )
            logger.info("HD: Después de outlier removal = %d puntos", len(pcd.points))

            if len(pcd.points) < 1000:
                logger.warning("HD: Muy pocos puntos tras limpieza — abortando.")
                self._busy = False
                return

            # ── 4. Estimar normales ────────────────────────────────
            logger.info("HD: Estimando normales...")
            pcd.estimate_normals(
                search_param=o3d.geometry.KDTreeSearchParamHybrid(
                    radius=0.1, max_nn=30
                )
            )
            pcd.orient_normals_consistent_tangent_plane(k=15)

            # ── 5. Poisson Surface Reconstruction ──────────────────
            logger.info("HD: Ejecutando Poisson Surface Reconstruction...")
            mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
                pcd, depth=9, width=0, scale=1.1, linear_fit=False
            )

            # Recortar vértices con baja densidad (eliminar bordes especulares)
            if len(densities) > 0:
                density_threshold = np.percentile(densities, 5)
                vertices_to_remove = densities < density_threshold
                mesh.remove_vertices_by_mask(vertices_to_remove)

            logger.info(
                "HD: Malla generada: %d vértices, %d caras",
                len(mesh.vertices),
                len(mesh.triangles),
            )

            # ── 6. Vertex colors desde la nube ─────────────────────
            # Open3D preserva los colores de los vértices durante Poisson
            if mesh.has_vertex_colors():
                logger.info("HD: Malla tiene colores de vértice preservados.")
            else:
                logger.info("HD: Malla sin colores — asignando desde nube.")
                # Asignar colores aproximados por nearest-neighbor
                pcd_tree = o3d.geometry.KDTreeFlann(pcd)
                verts = np.asarray(mesh.vertices)
                vert_colors = np.zeros((len(verts), 3))
                for i, v in enumerate(verts):
                    _, idx, _ = pcd_tree.search_knn_vector_3d(v, 1)
                    vert_colors[i] = np.asarray(pcd.colors)[idx[0]]
                mesh.vertex_colors = o3d.utility.Vector3dVector(vert_colors)

            # ── 7. Subdividir si es muy grande (opcional) ──────────
            # Si la malla es muy densa (>500K caras), simplificar
            if len(mesh.triangles) > 500_000:
                logger.info("HD: Simplificando malla (>500K caras)...")
                mesh = mesh.simplify_quadric_decimation(
                    target_number_of_triangles=250_000
                )

            # ── 8. Guardar .obj ────────────────────────────────────
            logger.info("HD: Guardando .obj en %s", obj_path)
            o3d.io.write_triangle_mesh(
                str(obj_path),
                mesh,
                write_vertex_normals=True,
                write_vertex_colors=True,
                write_triangle_uvs=False,
            )

            # ── 9. Guardar textura (la foto RGB original) ──────────
            import cv2

            cv2.imwrite(str(tex_path), cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
            logger.info("HD: Textura guardada en %s", tex_path)

            # ── 10. Notificar completado ───────────────────────────
            self._busy = False
            if self._on_complete:
                self._on_complete(obj_path.name)

            logger.info("✅ Captura HD completada: %s", obj_path.name)

        except ImportError:
            logger.exception("Open3D no está instalado.")
            self._busy = False
        except Exception:
            logger.exception("Error en meshing HD.")
            self._busy = False
