namespace ArgosSlope.Api.Models;

public class CrackMeasurement
{
    public int Id { get; set; }
    
    public int CrackId { get; set; }
    public Crack Crack { get; set; } = null!;
    
    public int? CaptureId { get; set; }
    public Capture? Capture { get; set; }

    public double LengthPx { get; set; }
    public double WidthPx { get; set; }
    public double AreaPx2 { get; set; }

    public double? LengthMm { get; set; }
    public double? WidthMm { get; set; }
    public double? AreaMm2 { get; set; }

    public double GrowthPercent { get; set; }
    public bool IsCalibrated { get; set; }
    public double? MmPerPixel { get; set; }

    public DateTime MeasuredAt { get; set; } = DateTime.UtcNow;
}
