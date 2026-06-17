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

    /// <summary>Listar fisuras con paginación</summary>
    [HttpGet]
    public async Task<ActionResult<PagedResponse<FisuraResponse>>> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var (cracks, totalCount) = await _repo.GetAllPagedAsync(page, pageSize);
        var totalPages = (int)Math.Ceiling((double)totalCount / pageSize);

        return new PagedResponse<FisuraResponse>(
            Items: cracks.Select(MapToResponse).ToList(),
            Page: page,
            PageSize: pageSize,
            TotalCount: totalCount,
            TotalPages: totalPages
        );
    }

    /// <summary>Obtener detalle de una fisura por ID</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<FisuraDetalleResponse>> GetById(int id)
    {
        var crack = await _repo.GetByIdAsync(id);
        if (crack is null)
            return NotFound(new ErrorResponse("Fisura no encontrada"));

        var mediciones = await _repo.GetMedicionesAsync(id);
        var alertasList = await _repo.GetAlertasAsync();
        var alertasFisura = alertasList.Where(a => a.CrackId == id).ToList();

        return new FisuraDetalleResponse(
            Fisura: MapToResponse(crack),
            Mediciones: mediciones.Select(MapToMedicionResponse).ToList(),
            TotalMediciones: mediciones.Count,
            Alertas: alertasFisura.Select(MapToAlertaResponse).ToList()
        );
    }

    /// <summary>Obtener mediciones históricas de una fisura</summary>
    [HttpGet("{id:int}/mediciones")]
    public async Task<ActionResult<List<MedicionResponse>>> GetMediciones(
        int id,
        [FromQuery] int? dias)
    {
        var mediciones = await _repo.GetMedicionesAsync(id, dias);
        return mediciones.Select(MapToMedicionResponse).ToList();
    }

    /// <summary>Registrar una nueva fisura desde la API REST</summary>
    [HttpPost]
    public async Task<ActionResult<FisuraResponse>> Create(
        [FromBody] RegistrarFisuraRequest request)
    {
        // Validar si ya existe por RoiId
        var existing = await _repo.GetByRoiIdAsync(request.RoiId);
        if (existing is not null)
        {
            return Conflict(new ErrorResponse(
                $"Ya existe una fisura con RoiId '{request.RoiId}' (ID={existing.Id}). " +
                $"Use PUT /api/fisuras/{existing.Id} para actualizarla."));
        }

        var ahora = DateTime.UtcNow;

        var crack = new Crack
        {
            Code = request.RoiId,
            FirstSeenAt = ahora,
            LastSeenAt = ahora,
        };

        var created = await _repo.CreateAsync(crack);

        // Crear la primera medición automáticamente
        var medicion = new CrackMeasurement
        {
            CrackId = created.Id,
            MeasuredAt = ahora,
            LengthPx = request.Largo,
            WidthPx = request.Ancho,
            AreaPx2 = request.Area,
            GrowthPercent = 0,
        };
        await _repo.AddMedicionAsync(medicion);

        return CreatedAtAction(nameof(GetById), new { id = created.Id }, MapToResponse(created));
    }

    /// <summary>Actualizar una fisura existente</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<FisuraResponse>> Update(
        int id,
        [FromBody] RegistrarFisuraRequest request)
    {
        var update = new Crack
        {
            Status = "active",
            LastSeenAt = DateTime.UtcNow
        };

        var updated = await _repo.UpdateAsync(id, update);
        if (updated is null)
            return NotFound(new ErrorResponse("Fisura no encontrada"));

        return MapToResponse(updated);
    }

    /// <summary>Registrar una nueva medición para una fisura</summary>
    [HttpPost("{id:int}/mediciones")]
    public async Task<ActionResult<MedicionResponse>> AddMedicion(
        int id,
        [FromBody] RegistrarMedicionRequest request)
    {
        var crack = await _repo.GetByIdAsync(id);
        if (crack is null)
            return NotFound(new ErrorResponse("Fisura no encontrada"));

        var medicion = new CrackMeasurement
        {
            CrackId = id,
            MeasuredAt = DateTime.UtcNow,
            LengthPx = request.Largo,
            WidthPx = request.Ancho,
            AreaPx2 = request.Area,
        };

        var created = await _repo.AddMedicionAsync(medicion);
        return CreatedAtAction(nameof(GetMediciones), new { id }, MapToMedicionResponse(created));
    }

    /// <summary>Obtener predicciones de tendencia para todas las fisuras</summary>
    [HttpGet("predicciones")]
    public async Task<ActionResult<List<Dictionary<string, object>>>> GetPredicciones()
    {
        var predicciones = await _repo.GetPrediccionesAsync();
        return Ok(predicciones);
    }

    /// <summary>Obtener predicción para una fisura específica por RoiId</summary>
    [HttpGet("predicciones/{roiId}")]
    public async Task<ActionResult<Dictionary<string, object>>> GetPrediccionByCrack(string roiId)
    {
        var prediccion = await _repo.GetPrediccionByCrackAsync(roiId);
        if (prediccion is null)
            return NotFound(new ErrorResponse("Fisura no encontrada"));
        return Ok(prediccion);
    }

    // ── Mappers ──────────────────────────────────────────────────────

    private static FisuraResponse MapToResponse(Crack c)
    {
        var lastMedicion = c.Measurements?.OrderByDescending(m => m.MeasuredAt).FirstOrDefault();
        var lastDetection = c.Detections?.OrderByDescending(d => d.DetectedAt).FirstOrDefault();
        
        return new FisuraResponse(
            Id: c.Id,
            RoiId: c.Code,
            FechaDeteccion: c.FirstSeenAt,
            Largo: lastMedicion?.LengthPx ?? 0,
            Ancho: lastMedicion?.WidthPx ?? 0,
            Area: lastMedicion?.AreaPx2 ?? 0,
            Orientacion: "N/A", // Not stored in new Crack model directly
            Tipo: "Crack",
            Coordenadas: "{}",
            ImagenOriginal: lastDetection?.ImagePath ?? "",
            ImagenSegmentada: lastDetection?.MaskPath ?? "",
            DeltaPorcentaje: lastMedicion?.GrowthPercent,
            EsCritica: (lastMedicion?.GrowthPercent ?? 0) > 5.0,
            Unidad: lastMedicion?.IsCalibrated == true ? "mm" : "px",
            Calibrado: lastMedicion?.IsCalibrated ?? false,
            Confianza: 1.0,
            Origen: "real",
            EstadoAlerta: c.RiskLevel,
            DeviceId: "edge-01"
        );
    }

    private static MedicionResponse MapToMedicionResponse(CrackMeasurement m) => new(
        Id: m.Id,
        FisuraId: m.CrackId,
        Fecha: m.MeasuredAt,
        Largo: m.LengthPx,
        Ancho: m.WidthPx,
        Area: m.AreaPx2,
        DeltaPorcentaje: m.GrowthPercent,
        EsCritica: m.GrowthPercent > 5.0
    );

    private static AlertaResponse MapToAlertaResponse(Alerta a) => new(
        Id: a.Id,
        CrackId: a.CrackId ?? 0,
        Fecha: a.Fecha,
        Tipo: a.Tipo,
        Mensaje: a.Mensaje,
        UmbralSuperado: a.UmbralSuperado,
        ValorActual: a.ValorActual,
        Reconocida: a.Reconocida
    );
}
