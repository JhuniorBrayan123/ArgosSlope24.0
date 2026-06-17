namespace ArgosSlope.Api.Models;

public class Crack
{
    public int Id { get; set; }
    public string ZoneId { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty; // e.g. "CRK-001"
    public string FamilyId { get; set; } = string.Empty; // "F1", "F2", etc.
    
    public DateTime FirstSeenAt { get; set; } = DateTime.UtcNow;
    public DateTime LastSeenAt { get; set; } = DateTime.UtcNow;
    
    public string Status { get; set; } = "active";
    public string RiskLevel { get; set; } = "estable";
    
    public ICollection<CrackMeasurement> Measurements { get; set; } = new List<CrackMeasurement>();
    public ICollection<CrackDetection> Detections { get; set; } = new List<CrackDetection>();
}
