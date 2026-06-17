using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api")]
public class HealthController : ControllerBase
{
    [HttpGet("health")]
    public IActionResult Health()
    {
        return Ok(new
        {
            status = "ok",
            service = "argos-slope-dotnet-backend",
            version = "1.0.0",
        });
    }

    [HttpGet("resumen")]
    public async Task<IActionResult> GetResumen(
        [FromServices] IFisuraRepository repo)
    {
        var data = await repo.GetResumenAsync();

        return Ok(new
        {
            total_fisuras = data["total_fisuras"],
            alertas_criticas = data["alertas_criticas"],
            rpi_conectada = EdgeHeartbeatCache.AnyConnected(),
            deformacion_promedio = 0.0, 
        });
    }

    [HttpGet]
    [Route("/")]
    public IActionResult Root()
    {
        return Ok(new
        {
            service = "ARGOS SLOPE 4.0 — .NET Backend",
            version = "1.0.0",
            docs = "/swagger",
            endpoints = new
            {
                health = "GET /api/health",
                resumen = "GET /api/resumen",
                fisuras = "GET /api/fisuras",
                fisura_detail = "GET /api/fisuras/{id}",
                fisura_mediciones = "GET /api/fisuras/{id}/mediciones",
                alertas = "GET /api/alertas",
                reconocer_alerta = "PUT /api/alertas/{id}/reconocer",
                configuracion = "GET /api/configuracion",
                actualizar_config = "PUT /api/configuracion/{clave}",
            },
        });
    }
}
