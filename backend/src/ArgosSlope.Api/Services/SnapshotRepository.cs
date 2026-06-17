using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;

namespace ArgosSlope.Api.Services;

public interface ISnapshotRepository
{
    Task<List<Snapshot3DEntity>> ListAsync(int limit = 100);
    Task<Snapshot3DEntity?> GetByIdAsync(int id);
    Task<Snapshot3DEntity?> GetLatestAsync(string? deviceId = null);
    Task<Snapshot3DEntity> CreateAsync(Snapshot3DEntity snapshot);
    Task<SnapshotComparisonResponse> CompareAsync(int idA, int idB);
}

public class SnapshotRepository : ISnapshotRepository
{
    private readonly AppDbContext _db;
    private readonly JsonSerializerOptions _jsonOptions;

    public SnapshotRepository(AppDbContext db)
    {
        _db = db;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        };
    }

    public async Task<List<Snapshot3DEntity>> ListAsync(int limit = 100)
    {
        return await _db.Snapshots3D
            .OrderByDescending(s => s.CapturedAt)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<Snapshot3DEntity?> GetByIdAsync(int id)
    {
        return await _db.Snapshots3D.FindAsync(id);
    }

    public async Task<Snapshot3DEntity?> GetLatestAsync(string? deviceId = null)
    {
        var query = _db.Snapshots3D.AsQueryable();
        if (!string.IsNullOrEmpty(deviceId))
            query = query.Where(s => s.DeviceId == deviceId);

        return await query
            .OrderByDescending(s => s.CapturedAt)
            .FirstOrDefaultAsync();
    }

    public async Task<Snapshot3DEntity> CreateAsync(Snapshot3DEntity snapshot)
    {
        _db.Snapshots3D.Add(snapshot);
        await _db.SaveChangesAsync();
        return snapshot;
    }

    public async Task<SnapshotComparisonResponse> CompareAsync(int idA, int idB)
    {
        var snapA = await GetByIdAsync(idA)
            ?? throw new KeyNotFoundException($"Snapshot {idA} no encontrado");
        var snapB = await GetByIdAsync(idB)
            ?? throw new KeyNotFoundException($"Snapshot {idB} no encontrado");

        var payloadA = JsonSerializer.Deserialize<Snapshot3DPayloadDto>(snapA.PayloadJson, _jsonOptions)
            ?? new Snapshot3DPayloadDto();
        var payloadB = JsonSerializer.Deserialize<Snapshot3DPayloadDto>(snapB.PayloadJson, _jsonOptions)
            ?? new Snapshot3DPayloadDto();

        var cracksA = payloadA.Cracks.Where(c => !string.IsNullOrEmpty(c.RoiId)).ToList();
        var cracksB = payloadB.Cracks.Where(c => !string.IsNullOrEmpty(c.RoiId)).ToList();

        var idsA = cracksA.Select(c => c.RoiId!).ToHashSet();
        var idsB = cracksB.Select(c => c.RoiId!).ToHashSet();

        var newCracks = cracksB.Where(c => c.RoiId != null && !idsA.Contains(c.RoiId)).ToList();
        var removedCracks = cracksA.Where(c => c.RoiId != null && !idsB.Contains(c.RoiId)).ToList();

        var grownCracks = new List<GrownCrackDto>();
        foreach (var cb in cracksB)
        {
            if (cb.RoiId is null) continue;
            var ca = cracksA.FirstOrDefault(c => c.RoiId == cb.RoiId);
            if (ca is null) continue;

            var widthA = ca.Ancho ?? 0;
            var widthB = cb.Ancho ?? 0;
            if (widthB > widthA + 0.01)
            {
                grownCracks.Add(new GrownCrackDto
                {
                    RoiId = cb.RoiId,
                    X3d = cb.X3d,
                    Y3d = cb.Y3d,
                    Z3d = cb.Z3d,
                    Classification = cb.Classification,
                    Largo = cb.Largo,
                    Ancho = cb.Ancho,
                    DeltaAncho = widthB - widthA,
                });
            }
        }

        return new SnapshotComparisonResponse
        {
            SnapshotA = MapToResponse(snapA, payloadA),
            SnapshotB = MapToResponse(snapB, payloadB),
            NewCracks = newCracks,
            GrownCracks = grownCracks,
            RemovedCracks = removedCracks,
            PointCountDelta = snapB.PointCount - snapA.PointCount,
        };
    }

    public static Snapshot3DResponse MapToResponse(
        Snapshot3DEntity entity,
        Snapshot3DPayloadDto? payload = null)
    {
        payload ??= JsonSerializer.Deserialize<Snapshot3DPayloadDto>(
            entity.PayloadJson,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
        );

        return new Snapshot3DResponse
        {
            Id = entity.Id,
            DeviceId = entity.DeviceId,
            CapturedAt = entity.CapturedAt.ToString("o"),
            PayloadJson = entity.PayloadJson,
            PointCount = entity.PointCount,
            CrackCount = entity.CrackCount,
            MeshVertexCount = entity.MeshVertexCount,
            ReconstructionMeta = payload?.Reconstruction,
            Payload = payload,
        };
    }
}
