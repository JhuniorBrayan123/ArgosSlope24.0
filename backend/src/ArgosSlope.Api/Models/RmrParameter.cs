using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ArgosSlope.Api.Models;

[Table("rmr_parameters")]
public class RmrParameter
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("evaluation_id")]
    public int EvaluationId { get; set; }

    [Column("parameter_key")]
    [MaxLength(100)]
    public string ParameterKey { get; set; } = string.Empty;

    [Column("selected_code")]
    [MaxLength(50)]
    public string SelectedCode { get; set; } = string.Empty;

    [Column("selected_label")]
    [MaxLength(200)]
    public string SelectedLabel { get; set; } = string.Empty;

    [Column("score")]
    public int Score { get; set; }

    [Column("source")]
    [MaxLength(50)]
    public string Source { get; set; } = "manual";

    [Column("is_auto")]
    public bool IsAuto { get; set; } = false;

    // Navigation properties
    [System.Text.Json.Serialization.JsonIgnore]
    [ForeignKey("EvaluationId")]
    public GeomechanicalEvaluation? Evaluation { get; set; }
}
