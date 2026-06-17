using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ArgosSlope.Api.Models;

[Table("rmr_catalog_option")]
public class RmrCatalogOption
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Required]
    [Column("parameter_key")]
    [MaxLength(100)]
    public string ParameterKey { get; set; } = string.Empty;

    [Required]
    [Column("code")]
    [MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    [Required]
    [Column("label")]
    [MaxLength(200)]
    public string Label { get; set; } = string.Empty;

    [Required]
    [Column("score")]
    public int Score { get; set; }

    [Column("min_value")]
    public double? MinValue { get; set; }

    [Column("max_value")]
    public double? MaxValue { get; set; }
}
