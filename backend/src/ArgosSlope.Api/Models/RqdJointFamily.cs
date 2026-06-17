using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ArgosSlope.Api.Models;

[Table("rqd_joint_families")]
public class RqdJointFamily
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("rqd_calculation_id")]
    public int RqdCalculationId { get; set; }

    [Column("family_name")]
    [MaxLength(100)]
    public string FamilyName { get; set; } = string.Empty;

    [Column("spacing_m")]
    public double SpacingM { get; set; }

    [Column("orientation_deg")]
    public double? OrientationDeg { get; set; }

    [Column("source")]
    [MaxLength(50)]
    public string Source { get; set; } = "manual";

    [Column("detected_by_opencv")]
    public bool DetectedByOpenCv { get; set; } = false;

    // Navigation properties
    [System.Text.Json.Serialization.JsonIgnore]
    [ForeignKey("RqdCalculationId")]
    public RqdCalculation? RqdCalculation { get; set; }
}
