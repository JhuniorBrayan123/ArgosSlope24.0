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

    /// <summary>Listar todas las alertas</summary>
    [HttpGet]
    public async Task<ActionResult<List<AlertaResponse>>> GetAll(
        [FromQuery(Name = "solo_no_reconocidas")] bool soloNoReconocidas = false)
    {
        var alertas = await _repo.GetAlertasAsync(soloNoReconocidas);
        return alertas.Select(a => new AlertaResponse(
            Id: a.Id,
            CrackId: a.CrackId,
            Fecha: a.Fecha,
            Tipo: a.Tipo,
            Mensaje: a.Mensaje,
            UmbralSuperado: a.UmbralSuperado,
            ValorActual: a.ValorActual,
            Reconocida: a.Reconocida
        )).ToList();
    }

    /// <summary>Reconocer (acknowledge) una alerta</summary>
    [HttpPut("{id:int}/reconocer")]
    public async Task<ActionResult<AlertaResponse>> Reconocer(int id)
    {
        var alerta = await _repo.ReconocerAlertaAsync(id);
        if (alerta is null)
            return NotFound(new ErrorResponse("Alerta no encontrada"));

        return new AlertaResponse(
            Id: alerta.Id,
            CrackId: alerta.CrackId,
            Fecha: alerta.Fecha,
            Tipo: alerta.Tipo,
            Mensaje: alerta.Mensaje,
            UmbralSuperado: alerta.UmbralSuperado,
            ValorActual: alerta.ValorActual,
            Reconocida: alerta.Reconocida
        );
    }

    /// <summary>Crear una alerta manualmente</summary>
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
            CrackId: created.CrackId,
            Fecha: created.Fecha,
            Tipo: created.Tipo,
            Mensaje: created.Mensaje,
            UmbralSuperado: created.UmbralSuperado,
            ValorActual: created.ValorActual,
            Reconocida: created.Reconocida
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

    /// <summary>Generar alertas basadas en la última medición</summary>
    [HttpPost("generate-from-analysis")]
    public async Task<IActionResult> GenerateFromAnalysis()
    {
        // Reglas:
        // Ancho > 5mm -> critico
        // Delta > 10% -> alto / advertencia
        
        var recentMeasurements = await _context.CrackMeasurements
            .Include(m => m.Crack)
            .OrderByDescending(m => m.MeasuredAt)
            .GroupBy(m => m.CrackId)
            .Select(g => g.FirstOrDefault())
            .ToListAsync();

        int generatedCount = 0;

        foreach (var m in recentMeasurements)
        {
            if (m == null) continue;

            string tipoAlerta = null;
            string mensaje = null;
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
                // Evitar duplicar: buscar alerta no reconocida del mismo tipo para esta fisura
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

        if (generatedCount > 0)
        {
            await _context.SaveChangesAsync();
        }

        return Ok(new { generated = generatedCount, message = $"{generatedCount} alertas generadas." });
    }
}
