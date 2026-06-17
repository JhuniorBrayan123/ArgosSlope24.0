/**
 * ARGOS SLOPE 4.0 — Snapshots Service.
 *
 * API service for the .NET backend's snapshot/history endpoints.
 * Each snapshot contains a point cloud + cracks captured at a moment in time.
 *
 * Endpoints (to be implemented in .NET):
 *   GET  /api/snapshots          — list all snapshots
 *   GET  /api/snapshots/{id}     — get one snapshot with full payload
 *   GET  /api/snapshots/latest   — get the most recent snapshot
 *   POST /api/snapshots/compare  — compare two snapshots
 */

import apiClient from './api-client';
import type { Snapshot3D, SnapshotComparison } from './pointcloud.types';

export const snapshotsService = {
  /**
   * List all available snapshots (metadata only, no payload).
   * GET /api/snapshots
   */
  list(): Promise<Snapshot3D[]> {
    return apiClient.get<Snapshot3D[]>('/api/snapshots');
  },

  /**
   * Get a single snapshot by ID with full payload.
   * GET /api/snapshots/{id}
   */
  getById(id: number): Promise<Snapshot3D> {
    return apiClient.get<Snapshot3D>(`/api/snapshots/${id}`);
  },

  /**
   * Get the most recent snapshot.
   * GET /api/snapshots/latest
   */
  getLatest(): Promise<Snapshot3D> {
    return apiClient.get<Snapshot3D>('/api/snapshots/latest');
  },

  /**
   * Compare two snapshots and get differences.
   * POST /api/snapshots/compare
   */
  compare(idA: number, idB: number): Promise<SnapshotComparison> {
    return apiClient.post<SnapshotComparison>('/api/snapshots/compare', {
      snapshot_id_a: idA,
      snapshot_id_b: idB,
    });
  },
};

export default snapshotsService;
