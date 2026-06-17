/**
 * ARGOS SLOPE 4.0 — Config Store.
 *
 * Zustand store for application configuration key-value pairs.
 * Reads from and writes to the .NET Configuracion API.
 */

import { create } from 'zustand';

// ── Store Interface ─────────────────────────────────────────────────

export interface ConfigStore {
  /** Key-value configuration map */
  config: Record<string, string>;
  loading: boolean;
  error: string | null;

  // ── Actions ──────────────────────────────────────────────────────

  /** Fetch all configuration entries from the API */
  fetchConfig: () => Promise<void>;
  /** Update a single configuration entry */
  updateConfig: (clave: string, valor: string) => Promise<void>;
  /** Reset store to initial state */
  reset: () => void;
}

// ── Initial State ────────────────────────────────────────────────────

const initialState = {
  config: {} as Record<string, string>,
  loading: false,
  error: null as string | null,
};

// ── Store ────────────────────────────────────────────────────────────

export const useConfigStore = create<ConfigStore>()((set) => ({
  ...initialState,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const { configService } = await import('@/services/config.service');
      const data = await configService.getAll();
      set({ config: (data as Record<string, string>) ?? {}, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar configuración';
      set({ error: message, loading: false });
    }
  },

  updateConfig: async (clave, valor) => {
    set({ loading: true, error: null });
    try {
      const { configService } = await import('@/services/config.service');
      await configService.update(clave, valor);
      set((state) => ({
        config: { ...state.config, [clave]: valor },
        loading: false,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al actualizar configuración';
      set({ error: message, loading: false });
    }
  },

  reset: () => set({ ...initialState }),
}));
