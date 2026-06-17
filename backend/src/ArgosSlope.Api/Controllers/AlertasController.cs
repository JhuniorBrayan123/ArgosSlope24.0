using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Models;
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

    /// <summary>Listar todas las alertas</summary>
    [HttpGet]
    public async Task<ActionResult<List<AlertaResponse>>> GetAll(
        [FromQuery] bool soloNoReconocidas = false)
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
}
