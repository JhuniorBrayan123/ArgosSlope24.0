using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/alertas")]
public class AlertasController : ControllerBase
{
    private readonly IFisuraRepository _repo;
    private readonly AppDbContext _context;

    public AlertasController(IFisuraRepository repo, AppDbContext context)
    {
        _repo = repo;
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<List<AlertaResponse>>> GetAll(
        [FromQuery(Name = "solo_no_reconocidas")] bool soloNoReconocidas = false)
    {
        var alertas = await _repo.GetAlertasAsync(soloNoReconocidas);
        return alertas.Select(a => new AlertaResponse(
            Id: a.Id,
            FisuraId: a.CrackId,
            Fecha: a.Fecha,
            Tipo: a.Tipo,
            Mensaje: a.Mensaje,
            UmbralSuperado: a.UmbralSuperado,
            ValorActual: a.ValorActual,
            Reconocida: a.Reconocida,
            AnalysisId: a.AnalysisId
        )).ToList();
    }
    [HttpPut("{id:int}/reconocer")]
    public async Task<ActionResult<AlertaResponse>> Reconocer(int id)
    {
        var alerta = await _repo.ReconocerAlertaAsync(id);
        if (alerta is null)
            return NotFound(new ErrorResponse("Alerta no encontrada"));

        return new AlertaResponse(
            Id: alerta.Id,
            FisuraId: alerta.CrackId,
            Fecha: alerta.Fecha,
            Tipo: alerta.Tipo,
            Mensaje: alerta.Mensaje,
            UmbralSuperado: alerta.UmbralSuperado,
            ValorActual: alerta.ValorActual,
            Reconocida: alerta.Reconocida,
            AnalysisId: alerta.AnalysisId
        );
    }

    [HttpPost]
    public async Task<ActionResult<AlertaResponse>> Create(
        [FromBody] RegistrarAlertaRequest request)
    {
        var alerta = new Alerta
        {
            Fecha = DateTime.UtcNow,
            Tipo = request.Tipo,
            Mensaje = request.Mensaje,
            UmbralSuperado = request.UmbralSuperado,
            ValorActual = request.ValorActual,
            Reconocida = false,
        };

        var created = await _repo.CreateAlertaAsync(alerta);

        return CreatedAtAction(nameof(GetAll), new AlertaResponse(
            Id: created.Id,
            FisuraId: created.CrackId,
            Fecha: created.Fecha,
            Tipo: created.Tipo,
            Mensaje: created.Mensaje,
            UmbralSuperado: created.UmbralSuperado,
            ValorActual: created.ValorActual,
            Reconocida: created.Reconocida,
            AnalysisId: created.AnalysisId
        ));
    }

    /// <summary>Resumen de alertas</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var total = await _context.Alertas.CountAsync();
        var criticas = await _context.Alertas.CountAsync(a => a.Tipo.ToLower() == "critico" && !a.Reconocida);
        var pendientes = await _context.Alertas.CountAsync(a => !a.Reconocida);

        var items = await _context.Alertas
            .OrderByDescending(a => a.Fecha)
            .Take(10)
            .Select(a => new
            {
                id = a.Id,
                severidad = a.Tipo,
                tipo = "apertura",
                mensaje = a.Mensaje,
                fisura_id = a.CrackId,
                estado = a.Reconocida ? "resuelta" : "pendiente",
                created_at = a.Fecha
            })
            .ToListAsync();

        return Ok(new
        {
            total,
            criticas,
            pendientes,
            items
        });
    }

    /// <summary>
    /// Generate alerts from an analysis comparison.
    /// Optional query param: analysisId — if provided, compares base vs current analysis JSON.
    /// Without analysisId: falls back to measurement-based alert generation (original behavior).
    /// </summary>
    [HttpPost("generate-from-analysis")]
    public async Task<IActionResult> GenerateFromAnalysis(
        [FromQuery] string? analysisId = null)
    {
        int generatedCount = 0;

        if (!string.IsNullOrEmpty(analysisId))
        {
            // ── Analysis-based alert generation ─────────────────────
            var analysis = await _context.Set<MonitoringAnalysis>()
                .FirstOrDefaultAsync(a => a.Id == analysisId);

            if (analysis == null)
                return NotFound(new ErrorResponse("Análisis no encontrado"));

            var parsed = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(analysis.AnalysisJson);
            var summary = parsed.TryGetProperty("summary", out var s) ? s : parsed;

            var totalFisuras = summary.TryGetProperty("total_fisuras", out var tf) ? tf.GetInt32() : 0;
            var longitudTotal = summary.TryGetProperty("longitud_total_cm", out var lt) ? lt.GetDouble() : 0;

            // Find base analysis for comparison
            var baseAnalysis = await _context.Set<MonitoringAnalysis>()
                .Where(a => a.ZoneId == analysis.ZoneId && a.AnalysisType == "base"
                    && a.CreatedAt < analysis.CreatedAt)
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            int nuevasFisuras = 0;
            double deltaLengthCm = 0;

            if (baseAnalysis != null)
            {
                var baseParsed = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(baseAnalysis.AnalysisJson);
                var baseSummary = baseParsed.TryGetProperty("summary", out var bs) ? bs : baseParsed;

                var baseTotal = baseSummary.TryGetProperty("total_fisuras", out var btf) ? btf.GetInt32() : 0;
                var baseLength = baseSummary.TryGetProperty("longitud_total_cm", out var blt) ? blt.GetDouble() : 0;

                nuevasFisuras = totalFisuras - baseTotal;
                deltaLengthCm = Math.Round(longitudTotal - baseLength, 1);

                // ── Alert: new cracks detected ──────────────────────
                if (nuevasFisuras > 0)
                {
                    var existingNew = await _context.Alertas.AnyAsync(a =>
                        a.AnalysisId == analysisId && a.Tipo == "advertencia"
                        && a.Fecha >= DateTime.UtcNow.AddHours(-24));

                    if (!existingNew)
                    {
                        _context.Alertas.Add(new Alerta
                        {
                            AnalysisId = analysisId,
                            ComparisonType = "base_vs_current",
                            Tipo = "advertencia",
                            Mensaje = $"Se detectaron {nuevasFisuras} nuevas fisuras en el último análisis comparado con la línea base",
                            NuevasFisuras = nuevasFisuras,
                            DeltaLengthCm = deltaLengthCm,
                            UmbralSuperado = 0,
                            ValorActual = nuevasFisuras,
                            Fecha = DateTime.UtcNow,
                            Reconocida = false
                        });
                        generatedCount++;
                    }
                }

                // ── Alert: length change >50cm ───────────────────────
                if (Math.Abs(deltaLengthCm) > 50)
                {
                    var existingLength = await _context.Alertas.AnyAsync(a =>
                        a.AnalysisId == analysisId && a.Tipo == "critico"
                        && a.ComparisonType == "base_vs_current"
                        && a.Fecha >= DateTime.UtcNow.AddHours(-24));

                    if (!existingLength)
                    {
                        _context.Alertas.Add(new Alerta
                        {
                            AnalysisId = analysisId,
                            ComparisonType = "base_vs_current",
                            Tipo = "critico",
                            Mensaje = $"La longitud total de fisuras cambió {Math.Abs(deltaLengthCm):F1} cm entre análisis (umbral: 50 cm)",
                            NuevasFisuras = nuevasFisuras,
                            DeltaLengthCm = deltaLengthCm,
                            UmbralSuperado = 50,
                            ValorActual = Math.Abs(deltaLengthCm),
                            Fecha = DateTime.UtcNow,
                            Reconocida = false
                        });
                        generatedCount++;
                    }
                }

                // ── Alert: family growth >5 cracks ───────────────────
                var currentFamilies = summary.TryGetProperty("familias", out var cf)
                    ? DeserializeFamilies(cf) : new Dictionary<string, int>();
                var baseFamilies = baseSummary.TryGetProperty("familias", out var bf)
                    ? DeserializeFamilies(bf) : new Dictionary<string, int>();

                foreach (var kvp in currentFamilies)
                {
                    if (baseFamilies.TryGetValue(kvp.Key, out var baseCount))
                    {
                        var delta = kvp.Value - baseCount;
                        if (delta > 5)
                        {
                            var existingFamily = await _context.Alertas.AnyAsync(a =>
                                a.AnalysisId == analysisId && a.Tipo == "alto"
                                && a.Mensaje != null && a.Mensaje.Contains(kvp.Key)
                                && a.Fecha >= DateTime.UtcNow.AddHours(-24));

                            if (!existingFamily)
                            {
                                _context.Alertas.Add(new Alerta
                                {
                                    AnalysisId = analysisId,
                                    ComparisonType = "growth",
                                    Tipo = "alto",
                                    Mensaje = $"La familia {kvp.Key} creció {delta} fisuras en el último análisis",
                                    NuevasFisuras = delta,
                                    DeltaLengthCm = null,
                                    UmbralSuperado = 5,
                                    ValorActual = delta,
                                    Fecha = DateTime.UtcNow,
                                    Reconocida = false
                                });
                                generatedCount++;
                            }
                        }
                    }
                }
            }
        }
        else
        {
            // ── Legacy measurement-based alert generation ───────────
            var recentMeasurements = await _context.CrackMeasurements
                .Include(m => m.Crack)
                .OrderByDescending(m => m.MeasuredAt)
                .GroupBy(m => m.CrackId)
                .Select(g => g.FirstOrDefault())
                .ToListAsync();

            foreach (var m in recentMeasurements)
            {
                if (m == null) continue;

                string? tipoAlerta = null;
                string? mensaje = null;
                double umbral = 0;
                double valor = 0;

                if (m.WidthMm > 5)
                {
                    tipoAlerta = "critico";
                    mensaje = $"Fisura {m.Crack?.Code ?? m.CrackId.ToString()} supera el umbral crítico de ancho (> 5mm)";
                    umbral = 5;
                    valor = m.WidthMm.Value;
                }
                else if (m.GrowthPercent > 10)
                {
                    tipoAlerta = "alto";
                    mensaje = $"Fisura {m.Crack?.Code ?? m.CrackId.ToString()} presenta crecimiento elevado (> 10%)";
                    umbral = 10;
                    valor = m.GrowthPercent;
                }

                if (tipoAlerta != null)
                {
                    var existing = await _context.Alertas.FirstOrDefaultAsync(a =>
                        a.CrackId == m.CrackId &&
                        a.Tipo == tipoAlerta &&
                        !a.Reconocida);

                    if (existing == null)
                    {
                        _context.Alertas.Add(new Alerta
                        {
                            CrackId = m.CrackId,
                            Tipo = tipoAlerta,
                            Mensaje = mensaje,
                            UmbralSuperado = umbral,
                            ValorActual = valor,
                            Fecha = DateTime.UtcNow,
                            Reconocida = false
                        });
                        generatedCount++;
                    }
                }
            }
        }

        if (generatedCount > 0)
        {
            await _context.SaveChangesAsync();
        }

        return Ok(new { generated = generatedCount, message = $"{generatedCount} alertas generadas." });
    }

    private static Dictionary<string, int> DeserializeFamilies(System.Text.Json.JsonElement familiasElement)
    {
        var result = new Dictionary<string, int>();
        if (familiasElement.ValueKind != System.Text.Json.JsonValueKind.Object)
            return result;

        foreach (var entry in familiasElement.EnumerateObject())
        {
            var count = entry.Value.TryGetProperty("count", out var c) ? c.GetInt32() : 0;
            result[entry.Name] = count;
        }
        return result;
    }
}
