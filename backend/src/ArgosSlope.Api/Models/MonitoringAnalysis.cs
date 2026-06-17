using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace ArgosSlope.Api.Models
{
    [Table("monitoring_analyses")]
    public class MonitoringAnalysis
    {
        [Key]
        [Column("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString();

        [Required]
        [Column("capture_id")]
        [MaxLength(100)]
        public string CaptureId { get; set; } = string.Empty;

        [Required]
        [Column("zone_id")]
        [MaxLength(100)]
        public string ZoneId { get; set; } = string.Empty;

        [Column("is_base_image")]
        public bool IsBaseImage { get; set; } = false;

        [Column("processed_image_path")]
        [MaxLength(500)]
        public string? ProcessedImagePath { get; set; }

        [Required]
        [Column("analysis_json", TypeName = "jsonb")]
        public string AnalysisJson { get; set; } = "{}";

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
