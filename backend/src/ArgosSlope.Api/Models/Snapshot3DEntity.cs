namespace ArgosSlope.Api.Models;

/// <summary>
/// Historical 3D snapshot from Edge (mesh + texture + cracks).
/// </summary>
public class Snapshot3DEntity
{
    public int Id { get; set; }
    public string DeviceId { get; set; } = "";
    public DateTime CapturedAt { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public int PointCount { get; set; }
    public int CrackCount { get; set; }
    public int MeshVertexCount { get; set; }
}
