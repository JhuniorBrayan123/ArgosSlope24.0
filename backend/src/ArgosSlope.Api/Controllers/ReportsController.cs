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
    public async Task<ActionResult<ReportSummaryResponse>> GetSummary()
    {
        var totalCracks = await _db.Cracks.CountAsync();
        var totalDetections = await _db.CrackDetections.CountAsync();
        var totalMeasurements = await _db.CrackMeasurements.CountAsync();
        var totalAlerts = await _db.Alertas.CountAsync();
        var activeAlerts = await _db.Alertas.CountAsync(a => !a.Reconocida);

        var avgWidth = totalMeasurements > 0
            ? await _db.CrackMeasurements.AverageAsync(m => m.WidthPx)
            : 0;

        var maxGrowth = totalMeasurements > 0
            ? await _db.CrackMeasurements.MaxAsync(m => m.GrowthPercent)
            : 0;

        var lastDetection = totalDetections > 0
            ? await _db.CrackDetections.MaxAsync(d => (DateTime?)d.DetectedAt)
            : null;

        return new ReportSummaryResponse(
            TotalCracks: totalCracks,
            TotalDetections: totalDetections,
            TotalMeasurements: totalMeasurements,
            TotalAlerts: totalAlerts,
            ActiveAlerts: activeAlerts,
            AvgWidthPx: Math.Round(avgWidth, 2),
            MaxGrowthPercent: Math.Round(maxGrowth, 1),
            LastDetectionAt: lastDetection
        );
    }

    /// <summary>Tendencia de ancho promedio por día (para gráficos)</summary>
    [HttpGet("trends")]
    public async Task<ActionResult<List<ReportTrendPoint>>> GetTrends(
        [FromQuery] int dias = 30)
    {
        var cutoff = DateTime.UtcNow.AddDays(-dias);

        var rawData = await _db.CrackMeasurements
            .Where(m => m.MeasuredAt >= cutoff)
            .Select(m => new { m.MeasuredAt.Date, m.WidthPx, m.CrackId })
            .ToListAsync();

        var measurements = rawData
            .GroupBy(m => m.Date)
            .Select(g => new ReportTrendPoint(
                g.Key.ToString("yyyy-MM-dd"),
                Math.Round(g.Average(m => m.WidthPx), 4),
                g.Select(m => m.CrackId).Distinct().Count()
            ))
            .OrderBy(t => t.Date)
            .ToList();

        return measurements;
    }

    /// <summary>Resumen de alertas agrupado por tipo</summary>
    [HttpGet("alerts")]
    public async Task<ActionResult<List<ReportAlertSummary>>> GetAlertsSummary()
    {
        var summary = await _db.Alertas
            .GroupBy(a => a.Tipo)
            .Select(g => new ReportAlertSummary(
                g.Key,
                g.Count()
            ))
            .ToListAsync();

        return summary;
    }
}
