using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/snapshots")]
public class SnapshotsController : ControllerBase
{
    private readonly ISnapshotRepository _repo;
    private readonly JsonSerializerOptions _jsonOptions;

    public SnapshotsController(ISnapshotRepository repo)
    {
        _repo = repo;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        };
    }

    /// <summary>List snapshot metadata (most recent first).</summary>
    [HttpGet]
    public async Task<ActionResult<List<Snapshot3DResponse>>> List()
    {
        var snapshots = await _repo.ListAsync();
        return snapshots.Select(s =>
        {
            var payload = JsonSerializer.Deserialize<Snapshot3DPayloadDto>(s.PayloadJson, _jsonOptions);
            return SnapshotRepository.MapToResponse(s, payload);
        }).ToList();
    }

    /// <summary>Get a single snapshot with full payload.</summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<Snapshot3DResponse>> GetById(int id)
    {
        var snap = await _repo.GetByIdAsync(id);
        if (snap is null) return NotFound(new { error = "Snapshot no encontrado" });

        var payload = JsonSerializer.Deserialize<Snapshot3DPayloadDto>(snap.PayloadJson, _jsonOptions);
        return SnapshotRepository.MapToResponse(snap, payload);
    }

    /// <summary>Get the most recent snapshot.</summary>
    [HttpGet("latest")]
    public async Task<ActionResult<Snapshot3DResponse>> GetLatest(
        [FromQuery] string? device_id)
    {
        var snap = await _repo.GetLatestAsync(device_id);
        if (snap is null) return NotFound(new { error = "No hay snapshots disponibles" });

        var payload = JsonSerializer.Deserialize<Snapshot3DPayloadDto>(snap.PayloadJson, _jsonOptions);
        return SnapshotRepository.MapToResponse(snap, payload);
    }

    /// <summary>Compare two snapshots.</summary>
    [HttpPost("compare")]
    public async Task<ActionResult<SnapshotComparisonResponse>> Compare(
        [FromBody] SnapshotCompareRequest request)
    {
        try
        {
            var result = await _repo.CompareAsync(request.SnapshotIdA, request.SnapshotIdB);
            return result;
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }
}
