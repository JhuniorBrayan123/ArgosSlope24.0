namespace ArgosSlope.Api.Models;

public class Capture
{
    public int Id { get; set; }
    public string ZoneId { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public DateTime CapturedAt { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "processed";
    
    // File references
    public int? OriginalMediaId { get; set; }
    public int? ProcessedMediaId { get; set; }
    public int? ThumbnailMediaId { get; set; }
    
    public ICollection<CrackDetection> Detections { get; set; } = new List<CrackDetection>();
}
