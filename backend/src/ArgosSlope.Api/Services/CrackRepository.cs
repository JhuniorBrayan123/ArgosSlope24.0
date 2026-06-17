using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;

namespace ArgosSlope.Api.Services;

public interface IFisuraRepository
{
    // ── Cracks ────────────────────────────────────────────────────────
    Task<List<Crack>> GetAllAsync();
    Task<(List<Crack> Items, int TotalCount)> GetAllPagedAsync(int page = 1, int pageSize = 50);
    Task<Crack?> GetByIdAsync(int id);
    Task<Crack?> GetByRoiIdAsync(string roiId);
    Task<Crack> CreateAsync(Crack crack);
    Task<Crack?> UpdateAsync(int id, Crack update);

    // ── Measurements ───────────────────────────────────────────────────
    Task<List<CrackMeasurement>> GetMedicionesAsync(int crackId, int? dias = null);
    Task<CrackMeasurement> AddMedicionAsync(CrackMeasurement medicion);

    // ── Alertas ────────────────────────────────────────────────────────
    Task<List<Alerta>> GetAlertasAsync(bool soloNoReconocidas = false);
    Task<Alerta?> ReconocerAlertaAsync(int alertaId);
    Task<Alerta> CreateAlertaAsync(Alerta alerta);

    // ── Configuración ──────────────────────────────────────────────────
    Task<List<Configuracion>> GetConfiguracionAsync();
    Task<Configuracion> UpsertConfiguracionAsync(string clave, string valor);

    // ── Dashboard ──────────────────────────────────────────────────────
    Task<Dictionary<string, int>> GetResumenAsync();

    // ── Predicciones básicas ───────────────────────────────────────────
    Task<List<Dictionary<string, object>>> GetPrediccionesAsync();
    Task<Dictionary<string, object>?> GetPrediccionByCrackAsync(string roiId);
}

public class FisuraRepository : IFisuraRepository
{
    private readonly AppDbContext _db;

    public FisuraRepository(AppDbContext db)
    {
        _db = db;
    }

    // ═════════════════════════════════════════════════════════════════
    //  CRACKS
    // ═════════════════════════════════════════════════════════════════

    public async Task<List<Crack>> GetAllAsync()
    {
        return await _db.Cracks
            .Include(c => c.Measurements.OrderByDescending(m => m.MeasuredAt).Take(1))
            .Include(c => c.Detections.OrderByDescending(d => d.DetectedAt).Take(1))
            .OrderByDescending(c => c.FirstSeenAt)
            .ToListAsync();
    }

    public async Task<(List<Crack> Items, int TotalCount)> GetAllPagedAsync(int page = 1, int pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 10;
        if (pageSize > 200) pageSize = 200;

        var totalCount = await _db.Cracks.CountAsync();

        var items = await _db.Cracks
            .Include(c => c.Measurements.OrderByDescending(m => m.MeasuredAt).Take(1))
            .Include(c => c.Detections.OrderByDescending(d => d.DetectedAt).Take(1))
            .OrderByDescending(c => c.FirstSeenAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return (items, totalCount);
    }

    public async Task<Crack?> GetByIdAsync(int id)
    {
        return await _db.Cracks.FindAsync(id);
    }

    public async Task<Crack?> GetByRoiIdAsync(string roiId)
    {
        return await _db.Cracks
            .FirstOrDefaultAsync(c => c.Code == roiId); // ROI -> Code in the new model
    }

    public async Task<Crack> CreateAsync(Crack crack)
    {
        _db.Cracks.Add(crack);
        await _db.SaveChangesAsync();
        return crack;
    }

    public async Task<Crack?> UpdateAsync(int id, Crack update)
    {
        var existing = await _db.Cracks.FindAsync(id);
        if (existing is null) return null;

        existing.Status = update.Status;
        existing.RiskLevel = update.RiskLevel;
        existing.LastSeenAt = update.LastSeenAt;

        await _db.SaveChangesAsync();
        return existing;
    }

    // ═════════════════════════════════════════════════════════════════
    //  MEASUREMENTS
    // ═════════════════════════════════════════════════════════════════

    public async Task<List<CrackMeasurement>> GetMedicionesAsync(int crackId, int? dias = null)
    {
        var query = _db.CrackMeasurements
            .Where(m => m.CrackId == crackId)
            .OrderBy(m => m.MeasuredAt);

        if (dias.HasValue && dias.Value > 0)
        {
            var cutoff = DateTime.UtcNow.AddDays(-dias.Value);
            query = (IOrderedQueryable<CrackMeasurement>)query.Where(m => m.MeasuredAt >= cutoff);
        }

        return await query.ToListAsync();
    }

    public async Task<CrackMeasurement> AddMedicionAsync(CrackMeasurement medicion)
    {
        // Calcular delta contra la primera medición
        var primeraMedicion = await _db.CrackMeasurements
            .Where(m => m.CrackId == medicion.CrackId)
            .OrderBy(m => m.MeasuredAt)
            .FirstOrDefaultAsync();

        if (primeraMedicion != null && primeraMedicion.LengthMm > 0 && medicion.LengthMm.HasValue)
        {
            var deltaMm = medicion.LengthMm.Value - primeraMedicion.LengthMm.Value;
            medicion.GrowthPercent = (deltaMm / primeraMedicion.LengthMm.Value) * 100;
        }
        else if (primeraMedicion != null && primeraMedicion.LengthPx > 0)
        {
            var deltaPx = medicion.LengthPx - primeraMedicion.LengthPx;
            medicion.GrowthPercent = (deltaPx / primeraMedicion.LengthPx) * 100;
        }
        else
        {
            medicion.GrowthPercent = 0;
        }

        _db.CrackMeasurements.Add(medicion);
        await _db.SaveChangesAsync();
        return medicion;
    }

    // ═════════════════════════════════════════════════════════════════
    //  ALERTAS
    // ═════════════════════════════════════════════════════════════════

    public async Task<List<Alerta>> GetAlertasAsync(bool soloNoReconocidas = false)
    {
        var query = _db.Alertas.AsQueryable();

        if (soloNoReconocidas)
            query = query.Where(a => !a.Reconocida);

        return await query
            .OrderByDescending(a => a.Fecha)
            .ToListAsync();
    }

    public async Task<Alerta?> ReconocerAlertaAsync(int alertaId)
    {
        var alerta = await _db.Alertas.FindAsync(alertaId);
        if (alerta is null) return null;

        alerta.Reconocida = true;
        await _db.SaveChangesAsync();
        return alerta;
    }

    public async Task<Alerta> CreateAlertaAsync(Alerta alerta)
    {
        _db.Alertas.Add(alerta);
        await _db.SaveChangesAsync();
        return alerta;
    }

    // ═════════════════════════════════════════════════════════════════
    //  CONFIGURACIÓN
    // ═════════════════════════════════════════════════════════════════

    public async Task<List<Configuracion>> GetConfiguracionAsync()
    {
        return await _db.Configuraciones.ToListAsync();
    }

    public async Task<Configuracion> UpsertConfiguracionAsync(string clave, string valor)
    {
        var entry = await _db.Configuraciones
            .FirstOrDefaultAsync(c => c.Clave == clave);

        if (entry is not null)
        {
            entry.Valor = valor;
        }
        else
        {
            entry = new Configuracion { Clave = clave, Valor = valor };
            _db.Configuraciones.Add(entry);
        }

        await _db.SaveChangesAsync();
        return entry;
    }

    // ═════════════════════════════════════════════════════════════════
    //  DASHBOARD RESUMEN
    // ═════════════════════════════════════════════════════════════════

    public async Task<Dictionary<string, int>> GetResumenAsync()
    {
        var totalFisuras = await _db.Cracks.CountAsync();
        var alertasCriticas = await _db.Alertas
            .CountAsync(a => a.Tipo == "critico" && !a.Reconocida);
        var alertasPendientes = await _db.Alertas
            .CountAsync(a => !a.Reconocida);

        return new Dictionary<string, int>
        {
            ["total_fisuras"] = totalFisuras,
            ["alertas_criticas"] = alertasCriticas,
            ["alertas_pendientes"] = alertasPendientes,
        };
    }

    // ═════════════════════════════════════════════════════════════════
    //  PREDICCIONES BÁSICAS (regresión lineal simple)
    // ═════════════════════════════════════════════════════════════════

    public async Task<List<Dictionary<string, object>>> GetPrediccionesAsync()
    {
        var cracks = await _db.Cracks
            .Include(c => c.Measurements.OrderBy(m => m.MeasuredAt))
            .ToListAsync();

        var result = new List<Dictionary<string, object>>();
        foreach (var c in cracks)
        {
            result.Add(await ComputePredictionAsync(c));
        }
        return result;
    }

    public async Task<Dictionary<string, object>?> GetPrediccionByCrackAsync(string roiId)
    {
        var crack = await _db.Cracks
            .Include(c => c.Measurements.OrderBy(m => m.MeasuredAt))
            .FirstOrDefaultAsync(c => c.Code == roiId);

        if (crack is null) return null;

        return await ComputePredictionAsync(crack);
    }

    private async Task<Dictionary<string, object>> ComputePredictionAsync(Crack crack)
    {
        var mediciones = crack.Measurements.OrderBy(m => m.MeasuredAt).ToList();

        if (mediciones.Count < 2)
        {
            return new()
            {
                ["fisura_id"] = crack.Id,
                ["roi_id"] = crack.Code,
                ["mediciones_disponibles"] = mediciones.Count,
                ["tendencia"] = "insuficiente",
                ["mensaje"] = "Se necesitan al menos 2 mediciones para calcular tendencia",
            };
        }

        // Regresión lineal simple: largo vs días desde la primera medición
        var primeraFecha = mediciones.First().MeasuredAt;
        var puntos = mediciones.Select(m => new
        {
            Dias = (m.MeasuredAt - primeraFecha).TotalDays,
            Largo = m.LengthMm ?? m.LengthPx
        }).ToList();

        double n = puntos.Count;
        double sumX = puntos.Sum(p => p.Dias);
        double sumY = puntos.Sum(p => p.Largo);
        double sumXY = puntos.Sum(p => p.Dias * p.Largo);
        double sumX2 = puntos.Sum(p => p.Dias * p.Dias);

        double pendiente;
        if (Math.Abs(n * sumX2 - sumX * sumX) < 0.001)
        {
            pendiente = 0;
        }
        else
        {
            pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        }

        double ultimoLargo = mediciones.Last().LengthMm ?? mediciones.Last().LengthPx;
        double primeraMedicion = mediciones.First().LengthMm ?? mediciones.First().LengthPx;
        double crecimientoTotal = ultimoLargo - primeraMedicion;
        double crecimientoPct = primeraMedicion > 0
            ? (crecimientoTotal / primeraMedicion) * 100
            : 0;

        var tendencia = pendiente switch
        {
            > 0.1 => "creciendo",
            < -0.1 => "contrayendo",
            _ => "estable"
        };

        // Proyección a 7 días
        double proyeccion7d = ultimoLargo + pendiente * 7;

        return new()
        {
            ["fisura_id"] = crack.Id,
            ["roi_id"] = crack.Code,
            ["mediciones_disponibles"] = mediciones.Count,
            ["tendencia"] = tendencia,
            ["velocidad_mm_dia"] = Math.Round(pendiente, 3),
            ["crecimiento_total_mm"] = Math.Round(crecimientoTotal, 2),
            ["crecimiento_porcentual"] = Math.Round(crecimientoPct, 1),
            ["proyeccion_7d_mm"] = Math.Round(proyeccion7d, 2),
            ["ultimo_largo"] = Math.Round(ultimoLargo, 2),
        };
    }
}

