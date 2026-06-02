using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/fisuras")]
public class FisurasController : ControllerBase
{
    private readonly IFisuraRepository _repo;

    public FisurasController(IFisuraRepository repo)
    {
        _repo = repo;
    }

    /// <summary>Listar todas las fisuras detectadas.</summary>
    [HttpGet]
    public async Task<ActionResult<List<FisuraResponse>>> GetAll()
    {
        var fisuras = await _repo.GetAllAsync();
        return fisuras.Select(MapToResponse).ToList();
    }

    /// <summary>Detalle completo de una fisura con mediciones y alertas.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<FisuraDetalleResponse>> GetById(int id)
    {
        var fisura = await _repo.GetByIdAsync(id);
        if (fisura is null)
            return NotFound(new ErrorResponse("Fisura no encontrada"));

        var mediciones = await _repo.GetMedicionesAsync(id);
        var alertasList = await _repo.GetAlertasAsync();
        var alertasFisura = alertasList.Where(a => a.FisuraId == id).ToList();

        return new FisuraDetalleResponse(
            Fisura: MapToResponse(fisura),
            Mediciones: mediciones.Select(MapToMedicionResponse).ToList(),
            TotalMediciones: mediciones.Count,
            Alertas: alertasFisura.Select(MapToAlertaResponse).ToList()
        );
    }

    /// <summary>Mediciones diarias de una fisura.</summary>
    [HttpGet("{id:int}/mediciones")]
    public async Task<ActionResult<List<MedicionResponse>>> GetMediciones(
        int id,
        [FromQuery] int? dias)
    {
        var mediciones = await _repo.GetMedicionesAsync(id, dias);
        return mediciones.Select(MapToMedicionResponse).ToList();
    }

    // ── Mappers ────────────────────────────────────────────────────

    private static FisuraResponse MapToResponse(Fisura f) => new(
        Id: f.Id,
        RoiId: f.RoiId,
        FechaDeteccion: f.FechaDeteccion,
        LargoMm: f.LargoMm,
        AnchoMm: f.AnchoMm,
        AreaMm2: f.AreaMm2,
        Orientacion: f.Orientacion,
        Tipo: f.Tipo,
        Coordenadas: f.Coordenadas,
        ImagenOriginal: f.ImagenOriginal,
        ImagenSegmentada: f.ImagenSegmentada
    );

    private static MedicionResponse MapToMedicionResponse(MedicionDiaria m) => new(
        Id: m.Id,
        FisuraId: m.FisuraId,
        Fecha: m.Fecha,
        LargoMm: m.LargoMm,
        AnchoMm: m.AnchoMm,
        AreaMm2: m.AreaMm2,
        DeltaPorcentaje: m.DeltaPorcentaje,
        EsCritica: m.EsCritica
    );

    private static AlertaResponse MapToAlertaResponse(Alerta a) => new(
        Id: a.Id,
        FisuraId: a.FisuraId,
        Fecha: a.Fecha,
        Tipo: a.Tipo,
        Mensaje: a.Mensaje,
        UmbralSuperado: a.UmbralSuperado,
        ValorActual: a.ValorActual,
        Reconocida: a.Reconocida
    );
}
