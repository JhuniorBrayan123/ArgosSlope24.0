using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController : ControllerBase
{
    private readonly AppDbContext _context;

    public DashboardController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var totalFisuras = await _context.Cracks.CountAsync();
        var today = DateTime.UtcNow.Date;
        var fisurasHoy = await _context.Cracks.CountAsync(c => c.FirstSeenAt.Date == today);
        var alertasCriticas = await _context.Alertas.CountAsync(a => a.Tipo.ToLower() == "critico" && !a.Reconocida);
        
        var hasMeasurements = await _context.CrackMeasurements.AnyAsync();
        double aperturaPromedioMm = 0;
        double deltaMaximoPorcentaje = 0;
        DateTime? ultimaDeteccion = null;

        if (hasMeasurements)
        {
            // Solo calcular promedio si hay mediciones con WidthMm
            if (await _context.CrackMeasurements.AnyAsync(m => m.WidthMm.HasValue))
            {
                aperturaPromedioMm = await _context.CrackMeasurements
                    .Where(m => m.WidthMm.HasValue)
                    .AverageAsync(m => m.WidthMm!.Value);
            }
            
            deltaMaximoPorcentaje = await _context.CrackMeasurements
                .MaxAsync(m => m.GrowthPercent);
        }

        if (totalFisuras > 0)
        {
            ultimaDeteccion = await _context.Cracks.MaxAsync(c => c.LastSeenAt);
        }

        string riesgoActual = "bajo";
        if (deltaMaximoPorcentaje > 20 || alertasCriticas > 2)
            riesgoActual = "critico";
        else if (deltaMaximoPorcentaje > 10 || alertasCriticas > 0)
            riesgoActual = "alto";
        else if (deltaMaximoPorcentaje > 5)
            riesgoActual = "medio";

        return Ok(new
        {
            total_fisuras = totalFisuras,
            fisuras_hoy = fisurasHoy,
            alertas_criticas = alertasCriticas,
            apertura_promedio_mm = aperturaPromedioMm,
            delta_maximo_porcentaje = deltaMaximoPorcentaje,
            riesgo_actual = riesgoActual,
            ultima_deteccion = ultimaDeteccion,
            estado = riesgoActual
        });
    }
}
