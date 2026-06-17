using System.Text.Json.Serialization;

namespace ArgosSlope.Api.Models.Dtos;

public class Mesh3DDto
{
    [JsonPropertyName("vertices")]
    public List<double> Vertices { get; set; } = [];

    [JsonPropertyName("indices")]
    public List<int> Indices { get; set; } = [];

    [JsonPropertyName("uvs")]
    public List<double> Uvs { get; set; } = [];
}

public class Crack3DDto
{
    [JsonPropertyName("roi_id")]
    public string? RoiId { get; set; }

    [JsonPropertyName("x")]
    public double? X { get; set; }

    [JsonPropertyName("y")]
    public double? Y { get; set; }

    [JsonPropertyName("w")]
    public double? W { get; set; }

    [JsonPropertyName("h")]
    public double? H { get; set; }

    [JsonPropertyName("x3d")]
    public double? X3d { get; set; }

    [JsonPropertyName("y3d")]
    public double? Y3d { get; set; }

    [JsonPropertyName("z3d")]
    public double? Z3d { get; set; }

    [JsonPropertyName("classification")]
    public string? Classification { get; set; }

    [JsonPropertyName("largo")]
    public double? Largo { get; set; }

    [JsonPropertyName("ancho")]
    public double? Ancho { get; set; }

    [JsonPropertyName("surface_valid")]
    public bool SurfaceValid { get; set; }
}

public class Calibration3DDto
{
    [JsonPropertyName("calibrated")]
    public bool Calibrated { get; set; }

    [JsonPropertyName("fx")]
    public double? Fx { get; set; }

    [JsonPropertyName("fy")]
    public double? Fy { get; set; }

    [JsonPropertyName("cx")]
    public double? Cx { get; set; }

    [JsonPropertyName("cy")]
    public double? Cy { get; set; }

    [JsonPropertyName("pixels_per_mm")]
    public double? PixelsPerMm { get; set; }
}

public class ReconstructionStatusDto
{
    [JsonPropertyName("mode")]
    public string Mode { get; set; } = "2d_only";

    [JsonPropertyName("scene_valid")]
    public bool SceneValid { get; set; }

    [JsonPropertyName("quality_score")]
    public double? QualityScore { get; set; }

    [JsonPropertyName("reject_reason")]
    public string? RejectReason { get; set; }

    [JsonPropertyName("message")]
    public string? Message { get; set; }
}

/// <summary>
/// Snapshot3D payload from Edge MQTT (mineria/talud/alertas).
/// </summary>
public class Snapshot3DPayloadDto
{
    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = "";

    [JsonPropertyName("timestamp")]
    public string Timestamp { get; set; } = "";

    [JsonPropertyName("reconstruction")]
    public ReconstructionStatusDto? Reconstruction { get; set; }

    [JsonPropertyName("image_base64")]
    public string? ImageBase64 { get; set; }

    [JsonPropertyName("mesh")]
    public Mesh3DDto? Mesh { get; set; }

    [JsonPropertyName("point_cloud")]
    public List<List<double>>? PointCloud { get; set; }

    [JsonPropertyName("cracks")]
    public List<Crack3DDto> Cracks { get; set; } = [];

    [JsonPropertyName("image_path")]
    public string? ImagePath { get; set; }

    [JsonPropertyName("point_count")]
    public int? PointCount { get; set; }

    [JsonPropertyName("calibration")]
    public Calibration3DDto? Calibration { get; set; }
}

public class Snapshot3DResponse
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = "";

    [JsonPropertyName("captured_at")]
    public string CapturedAt { get; set; } = "";

    [JsonPropertyName("payload_json")]
    public string PayloadJson { get; set; } = "";

    [JsonPropertyName("point_count")]
    public int PointCount { get; set; }

    [JsonPropertyName("crack_count")]
    public int CrackCount { get; set; }

    [JsonPropertyName("mesh_vertex_count")]
    public int MeshVertexCount { get; set; }

    [JsonPropertyName("reconstruction_meta")]
    public ReconstructionStatusDto? ReconstructionMeta { get; set; }

    [JsonPropertyName("payload")]
    public Snapshot3DPayloadDto? Payload { get; set; }
}

public class SnapshotCompareRequest
{
    [JsonPropertyName("snapshot_id_a")]
    public int SnapshotIdA { get; set; }

    [JsonPropertyName("snapshot_id_b")]
    public int SnapshotIdB { get; set; }
}

public class GrownCrackDto : Crack3DDto
{
    [JsonPropertyName("delta_ancho")]
    public double DeltaAncho { get; set; }
}

public class SnapshotComparisonResponse
{
    [JsonPropertyName("snapshot_a")]
    public Snapshot3DResponse SnapshotA { get; set; } = new();

    [JsonPropertyName("snapshot_b")]
    public Snapshot3DResponse SnapshotB { get; set; } = new();

    [JsonPropertyName("new_cracks")]
    public List<Crack3DDto> NewCracks { get; set; } = [];

    [JsonPropertyName("grown_cracks")]
    public List<GrownCrackDto> GrownCracks { get; set; } = [];

    [JsonPropertyName("removed_cracks")]
    public List<Crack3DDto> RemovedCracks { get; set; } = [];

    [JsonPropertyName("point_count_delta")]
    public int PointCountDelta { get; set; }
}
