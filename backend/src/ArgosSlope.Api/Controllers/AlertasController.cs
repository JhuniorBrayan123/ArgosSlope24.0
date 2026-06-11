using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/alertas")]
public class AlertasController : ControllerBase
{
    private readonly IFisuraRepository _repo;

    public AlertasController(IFisuraRepository repo)
    {
        _repo = repo;
    }

    /// <summary>Listar alertas, con filtro opcional de no reconocidas.</summary>
    [HttpGet]
    public async Task<ActionResult<List<AlertaResponse>>> GetAll(
        [FromQuery] bool soloNoReconocidas = false)
    {
        var alertas = await _repo.GetAlertasAsync(soloNoReconocidas);
        return alertas.Select(a => new AlertaResponse(
            Id: a.Id,
            FisuraId: a.FisuraId,
            Fecha: a.Fecha,
            Tipo: a.Tipo,
            Mensaje: a.Mensaje,
            UmbralSuperado: a.UmbralSuperado,
            ValorActual: a.ValorActual,
            Reconocida: a.Reconocida
        )).ToList();
    }

    /// <summary>Reconocer (ack) una alerta.</summary>
    [HttpPut("{id:int}/reconocer")]
    public async Task<ActionResult<AlertaResponse>> Reconocer(int id)
    {
        var alerta = await _repo.ReconocerAlertaAsync(id);
        if (alerta is null)
            return NotFound(new ErrorResponse("Alerta no encontrada"));

        return new AlertaResponse(
            Id: alerta.Id,
            FisuraId: alerta.FisuraId,
            Fecha: alerta.Fecha,
            Tipo: alerta.Tipo,
            Mensaje: alerta.Mensaje,
            UmbralSuperado: alerta.UmbralSuperado,
            ValorActual: alerta.ValorActual,
            Reconocida: alerta.Reconocida
        );
    }
}
