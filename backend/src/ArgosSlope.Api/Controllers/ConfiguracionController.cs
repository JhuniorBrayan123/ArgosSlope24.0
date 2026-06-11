using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/configuracion")]
public class ConfiguracionController : ControllerBase
{
    private readonly IFisuraRepository _repo;

    public ConfiguracionController(IFisuraRepository repo)
    {
        _repo = repo;
    }

    /// <summary>Obtener toda la configuración.</summary>
    [HttpGet]
    public async Task<ActionResult<List<ConfigResponse>>> GetAll()
    {
        var entries = await _repo.GetConfiguracionAsync();
        return entries.Select(e => new ConfigResponse(
            Clave: e.Clave,
            Valor: e.Valor,
            Descripcion: e.Descripcion
        )).ToList();
    }

    /// <summary>Actualizar o crear un valor de configuración.</summary>
    [HttpPut("{clave}")]
    public async Task<ActionResult<ConfigResponse>> Update(
        string clave,
        [FromBody] ValorConfigRequest body)
    {
        var entry = await _repo.UpsertConfiguracionAsync(clave, body.Valor);
        return new ConfigResponse(
            Clave: entry.Clave,
            Valor: entry.Valor,
            Descripcion: entry.Descripcion
        );
    }
}
