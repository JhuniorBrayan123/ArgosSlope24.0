namespace ArgosSlope.Api.Models;

public class MediaFile
{
    public int Id { get; set; }
    public string RelatedType { get; set; } = string.Empty; // "Capture", "Crack", etc.
    public int? RelatedId { get; set; }
    public string FileType { get; set; } = string.Empty; // "original", "processed", "mask", "thumbnail"
    public string StoragePath { get; set; } = string.Empty;
    public string PublicUrl { get; set; } = string.Empty;
    public string MimeType { get; set; } = "image/jpeg";
    public long SizeBytes { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
