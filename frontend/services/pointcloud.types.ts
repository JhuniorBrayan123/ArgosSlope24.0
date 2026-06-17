/**
 * ARGOS SLOPE 4.0 — Point Cloud & 3D Snapshot Types.
 *
 * Mirrors the Snapshot3D payload published by Edge's publish_snapshot_3d()
 * (edge/edge/mqtt/publisher.py → topic "mineria/talud/alertas")
 * and historical snapshots stored in .NET / PostgreSQL.
 *
 * Pipeline:
 *   Camera → ROI → SceneValidator → MiDaS depth → DepthProcessor
 *   → MeshGenerator → CrackProjector → MQTT → Frontend
 */

/** Single coloured 3D point: [x, y, z, r, g, b] */
export type PointCloudPoint = [number, number, number, number, number, number];

/** Triangle mesh derived from depth map */
export interface Mesh3D {
  vertices: number[];
  indices: number[];
  uvs: number[];
  /** Centroid subtracted on Edge (for crack alignment) */
  centroid?: number[];
  /** Scale factor applied on Edge */
  scale?: number;
}

/** Camera calibration metadata */
export interface Calibration3D {
  calibrated: boolean;
  fx?: number;
  fy?: number;
  cx?: number;
  cy?: number;
  pixels_per_mm?: number;
}

/**
 * Reconstruction quality metadata included in every Snapshot3D payload.
 *   "3d_valid"      → mesh is present and passes all quality gates
 *   "2d_only"       → scene/depth/mesh failed a gate; only 2D image + cracks
 *   "invalid_scene" → scene validator rejected before depth processing
 */
export type ReconstructionMode = '3d_valid' | '2d_only' | 'invalid_scene';

export interface ReconstructionStatus {
  mode: ReconstructionMode;
  scene_valid: boolean;
  quality_score?: number;
  reject_reason?: string;
  /** Spanish user-facing message when not 3d_valid */
  message?: string;
}

/**
 * Fisura/Crack detected by the Edge and projected to 3D camera space.
 * surface_valid=true means x3d/y3d/z3d were computed from the mesh surface
 * (median depth in bbox, aligned to mesh centroid+scale).
 */
export interface Crack3D {
  roi_id?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x3d?: number;
  y3d?: number;
  z3d?: number;
  classification?: string;
  length_mm?: number;
  width_mm?: number;
  /** True when 3D coordinates are aligned to the mesh surface */
  surface_valid?: boolean;
}

/**
 * Full Snapshot3D payload from MQTT or historical API.
 */
export interface Snapshot3DPayload {
  device_id: string;
  timestamp: string;
  /** Reconstruction metadata — always present in v2 payloads */
  reconstruction?: ReconstructionStatus;
  image_base64?: string;
  mesh?: Mesh3D;
  point_cloud?: PointCloudPoint[];
  cracks: Crack3D[];
  image_path?: string;
  point_count?: number;
  calibration?: Calibration3D;
}

/** @deprecated Use Snapshot3DPayload — kept for backward compatibility */
export type Alert3DPayload = Snapshot3DPayload;

/**
 * Snapshot stored in .NET backend for historical playback.
 */
export interface Snapshot3D {
  id: number;
  device_id: string;
  captured_at: string;
  /** JSON string of Snapshot3DPayload */
  payload_json: string;
  point_count: number;
  crack_count: number;
  mesh_vertex_count?: number;
  reconstruction_meta?: ReconstructionStatus;
  /** Parsed convenience field */
  payload?: Snapshot3DPayload;
}

/**
 * Result of comparing two snapshots.
 */
export interface SnapshotComparison {
  snapshot_a: Snapshot3D;
  snapshot_b: Snapshot3D;
  new_cracks: Crack3D[];
  grown_cracks: Array<Crack3D & { delta_width_mm: number }>;
  removed_cracks: Crack3D[];
  point_count_delta: number;
}
