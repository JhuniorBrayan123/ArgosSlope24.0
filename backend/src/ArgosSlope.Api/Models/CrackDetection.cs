namespace ArgosSlope.Api.Models;

public class CrackDetection
{
    public int Id { get; set; }
    
    public int CrackId { get; set; }
    public Crack? Crack { get; set; }

    public int? CaptureId { get; set; }
    public Capture? Capture { get; set; }

    public DateTime DetectedAt { get; set; } = DateTime.UtcNow;
    public string DeviceId { get; set; } = string.Empty;

    public int BboxX { get; set; }
    public int BboxY { get; set; }
    public int BboxW { get; set; }
    public int BboxH { get; set; }

    public int CenterX { get; set; }
    public int CenterY { get; set; }

    public double LengthPx { get; set; }
    public double WidthPx { get; set; }
    public double AreaPx2 { get; set; }
    public double OrientationDeg { get; set; }

    public string FamilyId { get; set; } = string.Empty; // e.g. "F1", "F2", "unknown"
    public double Confidence { get; set; }

    public string? ImagePath { get; set; }
    public string? MaskPath { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
