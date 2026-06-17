using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GeomechanicsController : ControllerBase
{
    private readonly RmrCatalogService _catalogService;
    private readonly RqdCalculationService _rqdService;
    private readonly RmrCalculationService _rmrService;
    private readonly GeomechanicalEvaluationService _evaluationService;

    public GeomechanicsController(
        RmrCatalogService catalogService,
        RqdCalculationService rqdService,
        RmrCalculationService rmrService,
        GeomechanicalEvaluationService evaluationService)
    {
        _catalogService = catalogService;
        _rqdService = rqdService;
        _rmrService = rmrService;
        _evaluationService = evaluationService;
    }

    [HttpGet("catalogs")]
    public async Task<IActionResult> GetCatalogs()
    {
        var catalog = await _catalogService.GetCatalogAsync();
        return Ok(catalog);
    }

    [HttpPost("rqd/hudson")]
    public IActionResult CalculateRqdHudson([FromBody] HudsonCalculationRequest request)
    {
        try
        {
            var result = _rqdService.CalculateHudson(request);
            return Ok(result);
        }
        catch (System.Exception ex)
        {
            return BadRequest(new { Error = ex.Message });
        }
    }

    [HttpPost("rqd/palmstrom")]
    public IActionResult CalculateRqdPalmstrom([FromBody] PalmstromCalculationRequest request)
    {
        try
        {
            var result = _rqdService.CalculatePalmstrom(request);
            return Ok(result);
        }
        catch (System.Exception ex)
        {
            return BadRequest(new { Error = ex.Message });
        }
    }

    [HttpPost("rmr/calculate")]
    public IActionResult CalculateRmr([FromBody] RmrCalculationRequest request)
    {
        try
        {
            var result = _rmrService.CalculateRmr(request);
            return Ok(result);
        }
        catch (System.Exception ex)
        {
            return BadRequest(new { Error = ex.Message });
        }
    }

    [HttpPost("evaluations")]
    public async Task<IActionResult> SaveEvaluation([FromBody] GeomechanicalEvaluationRequest request)
    {
        var evaluation = await _evaluationService.SaveEvaluationAsync(request);
        return CreatedAtAction(nameof(GetEvaluationById), new { id = evaluation.Id }, evaluation);
    }

    [HttpGet("evaluations")]
    public async Task<IActionResult> GetEvaluations()
    {
        var evaluations = await _evaluationService.GetEvaluationsAsync();
        return Ok(evaluations);
    }

    [HttpGet("evaluations/{id}")]
    public async Task<IActionResult> GetEvaluationById(int id)
    {
        var evaluation = await _evaluationService.GetEvaluationByIdAsync(id);
        if (evaluation == null)
        {
            return NotFound();
        }
        return Ok(evaluation);
    }

    [HttpGet("evaluations/by-zone/{zoneId}")]
    public async Task<IActionResult> GetEvaluationsByZone(string zoneId)
    {
        var evaluations = await _evaluationService.GetEvaluationsByZoneAsync(zoneId);
        return Ok(evaluations);
    }

    [HttpGet("evaluations/by-monitoring/{monitoringId}")]
    public async Task<IActionResult> GetEvaluationsByMonitoring(string monitoringId)
    {
        var evaluations = await _evaluationService.GetEvaluationsByMonitoringAsync(monitoringId);
        return Ok(evaluations);
    }
}
