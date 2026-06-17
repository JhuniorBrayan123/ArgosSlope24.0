using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ArgosSlope.Api.Models;

[Table("rqd_calculations")]
public class RqdCalculation
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("evaluation_id")]
    public int EvaluationId { get; set; }

    [Column("method")]
    [MaxLength(50)]
    public string Method { get; set; } = string.Empty;

    [Column("jv")]
    public double? Jv { get; set; }

    [Column("lambda_value")]
    public double? LambdaValue { get; set; }

    [Column("discontinuity_count")]
    public int? DiscontinuityCount { get; set; }

    [Column("line_length_m")]
    public double? LineLengthM { get; set; }

    [Column("rqd_value")]
    public double RqdValue { get; set; }

    [Column("rqd_quality")]
    [MaxLength(50)]
    public string? RqdQuality { get; set; }

    [Column("input_data_json", TypeName = "jsonb")]
    public string? InputDataJson { get; set; }

    // Navigation properties
    [System.Text.Json.Serialization.JsonIgnore]
    [ForeignKey("EvaluationId")]
    public GeomechanicalEvaluation? Evaluation { get; set; }

    public ICollection<RqdJointFamily> JointFamilies { get; set; } = new List<RqdJointFamily>();
}
