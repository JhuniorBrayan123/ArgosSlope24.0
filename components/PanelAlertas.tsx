'use client';

import { useEffect, useState, useMemo } from 'react';
import { obtenerAlertas, reconocerAlerta } from '@/lib/api';

// ── Tipos ─────────────────────────────────────────────────────────────

interface AlertaData {
  id: number;
  fisura_id: number | null;
  fecha: string;
  tipo: string;
  mensaje: string;
  umbral_superado: number;
  valor_actual: number;
  reconocida: boolean;
}

type FiltroTipo = 'todas' | 'critico' | 'advertencia' | 'informativo';
type FiltroEstado = 'todas' | 'pendientes' | 'reconocidas';

// ── Componente ────────────────────────────────────────────────────────

export default function PanelAlertas() {
  const [alertas, setAlertas] = useState<AlertaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todas');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todas');
  const [busqueda, setBusqueda] = useState('');
  const [reconociendo, setReconociendo] = useState<number | null>(null);

  // Paginación
  const [pagina, setPagina] = useState(1);
  const POR_PAGINA = 10;

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      try {
        const data = await obtenerAlertas();
        if (mounted) setAlertas(data);
      } catch {
        if (mounted) setError(true);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Resetear paginación al cambiar filtros
  useEffect(() => {
    setPagina(1);
  }, [filtroTipo, filtroEstado, busqueda]);

  // ── Filtrado ──────────────────────────────────────────────────────

  const filtradas = useMemo(() => {
    let result = [...alertas];

    // Filtro por tipo
    if (filtroTipo !== 'todas') {
      result = result.filter((a) => a.tipo === filtroTipo);
    }

    // Filtro por estado
    if (filtroEstado === 'pendientes') {
      result = result.filter((a) => !a.reconocida);
    } else if (filtroEstado === 'reconocidas') {
      result = result.filter((a) => a.reconocida);
    }

    // Búsqueda textual
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      result = result.filter(
        (a) =>
          a.mensaje.toLowerCase().includes(q) ||
          a.tipo.toLowerCase().includes(q) ||
          String(a.id).includes(q)
      );
    }

    // Ordenar: no reconocidas primero, luego por fecha descendente
    result.sort((a, b) => {
      if (a.reconocida !== b.reconocida) return a.reconocida ? 1 : -1;
      return new Date(b.fecha).getTime() - new Date(a.fecha).getTime();
    });

    return result;
  }, [alertas, filtroTipo, filtroEstado, busqueda]);

  // ── Paginación ────────────────────────────────────────────────────
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginadas = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);

  // ── Reconocer alerta ──────────────────────────────────────────────
  async function handleReconocer(id: number) {
    setReconociendo(id);
    try {
      const updated = await reconocerAlerta(id);
      if (updated) {
        setAlertas((prev) => prev.map((a) => (a.id === id ? { ...a, reconocida: true } : a)));
      }
    } catch {
      // Silencioso
    } finally {
      setReconociendo(null);
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    return {
      total: alertas.length,
      criticas: alertas.filter((a) => a.tipo === 'critico').length,
      pendientes: alertas.filter((a) => !a.reconocida).length,
    };
  }, [alertas]);

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-dark-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dark-border bg-dark-surface">
        <p className="text-sm text-dark-secondary">
          No se pudieron cargar las alertas. Verifica la conexión.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-dark-border bg-dark-surface p-3">
          <p className="text-xs text-dark-secondary">Total Alertas</p>
          <p className="text-xl font-bold text-dark-text">{stats.total}</p>
        </div>
        <div className="rounded-lg border border-dark-border bg-dark-surface p-3">
          <p className="text-xs text-dark-secondary">Críticas</p>
          <p className="text-xl font-bold text-dark-danger">{stats.criticas}</p>
        </div>
        <div className="rounded-lg border border-dark-border bg-dark-surface p-3">
          <p className="text-xs text-dark-secondary">Pendientes</p>
          <p className="text-xl font-bold text-dark-warning">{stats.pendientes}</p>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dark-border bg-dark-surface p-4">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Buscar alertas..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-dark-border bg-dark-primary px-4 py-2 text-sm text-dark-text placeholder-dark-secondary/50 outline-none focus:border-dark-accent"
          />
        </div>

        {/* Filtro tipo */}
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
          className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent"
        >
          <option value="todas">Todos los tipos</option>
          <option value="critico">Críticas</option>
          <option value="advertencia">Advertencias</option>
          <option value="informativo">Informativas</option>
        </select>

        {/* Filtro estado */}
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value as FiltroEstado)}
          className="rounded-lg border border-dark-border bg-dark-primary px-3 py-2 text-sm text-dark-text outline-none focus:border-dark-accent"
        >
          <option value="todas">Todos los estados</option>
          <option value="pendientes">Pendientes</option>
          <option value="reconocidas">Reconocidas</option>
        </select>
      </div>

      {/* ── Lista ── */}
      {paginadas.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-dark-border bg-dark-surface">
          <p className="text-sm text-dark-secondary">
            {busqueda || filtroTipo !== 'todas' || filtroEstado !== 'todas'
              ? 'No hay alertas que coincidan con los filtros.'
              : 'No hay alertas registradas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginadas.map((alerta) => (
            <div
              key={alerta.id}
              className={`rounded-lg border p-4 transition-colors ${
                alerta.reconocida
                  ? 'border-dark-border bg-dark-surface/50'
                  : alerta.tipo === 'critico'
                  ? 'border-dark-danger/30 bg-dark-danger/5'
                  : 'border-dark-border bg-dark-surface'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    {/* Badge tipo */}
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        alerta.tipo === 'critico'
                          ? 'bg-dark-danger/15 text-dark-danger'
                          : alerta.tipo === 'advertencia'
                          ? 'bg-dark-warning/15 text-dark-warning'
                          : 'bg-dark-accent/15 text-dark-accent'
                      }`}
                    >
                      {alerta.tipo}
                    </span>

                    {/* Estado */}
                    <span
                      className={`text-[10px] font-medium ${
                        alerta.reconocida ? 'text-dark-accent' : 'text-dark-warning'
                      }`}
                    >
                      {alerta.reconocida ? '✓ Reconocida' : '○ Pendiente'}
                    </span>

                    {/* Fisura ID */}
                    {alerta.fisura_id && (
                      <span className="text-[10px] text-dark-secondary">
                        Fisura #{alerta.fisura_id}
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-dark-text">{alerta.mensaje}</p>

                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-dark-secondary">
                    <span>
                      {new Date(alerta.fecha).toLocaleString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span>
                      Valor: {alerta.valor_actual.toFixed(2)}% | Umbral:{' '}
                      {alerta.umbral_superado.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Botón reconocer */}
                {!alerta.reconocida && (
                  <button
                    onClick={() => handleReconocer(alerta.id)}
                    disabled={reconociendo === alerta.id}
                    className="shrink-0 rounded-lg bg-dark-accent/10 px-4 py-2 text-xs font-semibold text-dark-accent transition-colors hover:bg-dark-accent/20 disabled:opacity-50"
                  >
                    {reconociendo === alerta.id ? '...' : 'Reconocer'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Paginación ── */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPagina((p) => Math.max(1, p - 1))}
            disabled={pagina === 1}
            className="rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs text-dark-secondary disabled:opacity-30"
          >
            Anterior
          </button>

          {Array.from({ length: totalPaginas }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 2)
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center gap-1">
                {idx > 0 && arr[idx - 1] !== p - 1 && (
                  <span className="text-dark-secondary/50">...</span>
                )}
                <button
                  onClick={() => setPagina(p)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    p === pagina
                      ? 'bg-dark-accent text-dark-primary'
                      : 'border border-dark-border bg-dark-surface text-dark-secondary hover:bg-dark-hover'
                  }`}
                >
                  {p}
                </button>
              </span>
            ))}

          <button
            onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            disabled={pagina === totalPaginas}
            className="rounded-lg border border-dark-border bg-dark-surface px-3 py-1.5 text-xs text-dark-secondary disabled:opacity-30"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
