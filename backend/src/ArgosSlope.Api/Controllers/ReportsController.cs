using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models.Dtos;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    private readonly AppDbContext _db;

    public ReportsController(AppDbContext db)
    {
        _db = db;
    }

    /// <summary>Resumen agregado para el módulo de reportes</summary>
    [HttpGet("summary")]
    public async Task<ActionResult<ReportSummaryResponse>> GetSummary(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var cracksQuery = _db.Cracks.AsQueryable();
        var detectionsQuery = _db.CrackDetections.AsQueryable();
        var measurementsQuery = _db.CrackMeasurements.AsQueryable();
        var alertsQuery = _db.Alertas.AsQueryable();

        if (startDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(startDate.Value, DateTimeKind.Utc);
            cracksQuery = cracksQuery.Where(c => c.FirstSeenAt >= startUtc);
            detectionsQuery = detectionsQuery.Where(d => d.DetectedAt >= startUtc);
            measurementsQuery = measurementsQuery.Where(m => m.MeasuredAt >= startUtc);
            alertsQuery = alertsQuery.Where(a => a.Fecha >= startUtc);
        }

        if (endDate.HasValue)
        {
            var endOfDay = DateTime.SpecifyKind(endDate.Value.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
            cracksQuery = cracksQuery.Where(c => c.FirstSeenAt <= endOfDay);
            detectionsQuery = detectionsQuery.Where(d => d.DetectedAt <= endOfDay);
            measurementsQuery = measurementsQuery.Where(m => m.MeasuredAt <= endOfDay);
            alertsQuery = alertsQuery.Where(a => a.Fecha <= endOfDay);
        }

        var totalCracks = await cracksQuery.CountAsync();
        var totalDetections = await detectionsQuery.CountAsync();
        var totalMeasurements = await measurementsQuery.CountAsync();
        var totalAlerts = await alertsQuery.CountAsync();
        var activeAlerts = await alertsQuery.CountAsync(a => !a.Reconocida);

        var validMeasurements = await measurementsQuery.CountAsync(m => m.WidthMm.HasValue);
        var avgWidth = validMeasurements > 0
            ? await measurementsQuery.Where(m => m.WidthMm.HasValue).AverageAsync(m => m.WidthMm!.Value)
            : 0;

        var maxGrowth = totalMeasurements > 0
            ? await measurementsQuery.MaxAsync(m => m.GrowthPercent)
            : 0;

        var lastDetection = totalDetections > 0
            ? await detectionsQuery.MaxAsync(d => (DateTime?)d.DetectedAt)
            : null;

        // ── Compute new metrics ────────────────────────────────────
        // Total length from measurements with LengthMm (convert mm → cm)
        var lengthData = await measurementsQuery
            .Where(m => m.LengthMm.HasValue)
            .Select(m => new { m.CrackId, m.LengthMm, m.MeasuredAt })
            .ToListAsync();

        double totalLengthCm = 0;
        if (lengthData.Count > 0)
        {
            totalLengthCm = lengthData
                .GroupBy(m => m.CrackId)
                .Select(g => g.OrderByDescending(m => m.MeasuredAt).First().LengthMm!.Value)
                .Sum() / 10.0;
        }

        // Families breakdown from CrackDetection.FamilyId
        var familiesRaw = await detectionsQuery
            .Where(d => d.FamilyId != null && d.FamilyId != "")
            .GroupBy(d => d.FamilyId)
            .Select(g => new { Family = g.Key, Count = g.Count() })
            .ToListAsync();

        var families = familiesRaw.ToDictionary(
            g => g.Family,
            g => (object)new { count = g.Count, total_cm = 0.0 }
        );

        return new ReportSummaryResponse(
            TotalCracks: totalCracks,
            TotalDetections: totalDetections,
            TotalMeasurements: totalMeasurements,
            TotalAlerts: totalAlerts,
            ActiveAlerts: activeAlerts,
            AvgWidthPx: Math.Round(avgWidth, 2),
            MaxGrowthPercent: Math.Round(maxGrowth, 1),
            LastDetectionAt: lastDetection,
            TotalLengthCm: Math.Round(totalLengthCm, 1),
            Families: families
        );
    }

    /// <summary>Tendencia de ancho promedio por día (para gráficos)</summary>
    [HttpGet("trends")]
    public async Task<ActionResult<List<ReportTrendPoint>>> GetTrends(
        [FromQuery] int dias = 30,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var query = _db.CrackMeasurements.Where(m => m.WidthMm.HasValue);

        if (startDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(startDate.Value, DateTimeKind.Utc);
            query = query.Where(m => m.MeasuredAt >= startUtc);
        }
        else
        {
            var cutoff = DateTime.UtcNow.AddDays(-dias);
            query = query.Where(m => m.MeasuredAt >= cutoff);
        }

        if (endDate.HasValue)
        {
            var endOfDay = DateTime.SpecifyKind(endDate.Value.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
            query = query.Where(m => m.MeasuredAt <= endOfDay);
        }

        var rawData = await query
            .Select(m => new { m.MeasuredAt.Date, WidthMm = m.WidthMm!.Value, m.CrackId })
            .ToListAsync();

        var measurements = rawData
            .GroupBy(m => m.Date)
            .Select(g => new ReportTrendPoint(
                g.Key.ToString("yyyy-MM-dd"),
                Math.Round(g.Average(m => m.WidthMm), 4),
                g.Select(m => m.CrackId).Distinct().Count(),
                g.Count()
            ))
            .OrderBy(t => t.Date)
            .ToList();

        return measurements;
    }

    /// <summary>Resumen de alertas agrupado por tipo</summary>
    [HttpGet("alerts")]
    public async Task<ActionResult<List<ReportAlertSummary>>> GetAlertsSummary(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        var query = _db.Alertas.AsQueryable();

        if (startDate.HasValue)
        {
            var startUtc = DateTime.SpecifyKind(startDate.Value, DateTimeKind.Utc);
            query = query.Where(a => a.Fecha >= startUtc);
        }
        if (endDate.HasValue)
        {
            var endOfDay = DateTime.SpecifyKind(endDate.Value.Date.AddDays(1).AddTicks(-1), DateTimeKind.Utc);
            query = query.Where(a => a.Fecha <= endOfDay);
        }

        var summary = await query
            .GroupBy(a => a.Tipo)
            .Select(g => new ReportAlertSummary(
                g.Key,
                g.Count()
            ))
            .ToListAsync();

        return summary;
    }
}
