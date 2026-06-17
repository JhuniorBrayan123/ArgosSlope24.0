using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/geotecnia")]
public class GeotechnicalController : ControllerBase
{
    private readonly IGeotechnicalServices _geo;

    public GeotechnicalController(IGeotechnicalServices geo)
    {
        _geo = geo;
    }

    /// <summary>Calcular RQD (Rock Quality Designation)</summary>
    [HttpPost("rqd")]
    public ActionResult<RqdResult> CalculateRqd([FromBody] RqdRequest request)
    {
        try
        {
            var result = _geo.CalculateRqd(
                request.PieceLengthsCm,
                request.CoreLengthM,
                request.MinBlockCm);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Calcular velocidad de deformación</summary>
    [HttpPost("deformacion")]
    public ActionResult<DeformationResult> CalculateDeformation(
        [FromBody] DeformationRequest request)
    {
        try
        {
            var result = _geo.CalculateDeformation(
                request.DisplacementPx,
                request.DaysElapsed,
                request.ZMeters,
                request.FMm);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>Evaluar crecimiento contra umbral</summary>
    [HttpPost("crecimiento")]
    public ActionResult<GrowthResult> CheckGrowth([FromBody] GrowthRequest request)
    {
        try
        {
            var result = _geo.CheckGrowth(
                request.MeasurementsMm,
                request.ThresholdPercent);
            return Ok(result);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}

public record RqdRequest(double[] PieceLengthsCm, double CoreLengthM, double MinBlockCm = 10.0);
public record DeformationRequest(double DisplacementPx, double DaysElapsed, double ZMeters, double FMm);
public record GrowthRequest(double[] MeasurementsMm, double ThresholdPercent = 5.0);
