using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ArgosSlope.Api.Models;

[Table("geomechanical_evaluations")]
public class GeomechanicalEvaluation
{
    [Key]
    [Column("id")]
    public int Id { get; set; }

    [Column("zone_id")]
    [MaxLength(100)]
    public string? ZoneId { get; set; }

    [Column("monitoring_id")]
    [MaxLength(100)]
    public string? MonitoringId { get; set; }

    [Column("image_id")]
    [MaxLength(100)]
    public string? ImageId { get; set; }

    [Column("rqd_method")]
    [MaxLength(50)]
    public string? RqdMethod { get; set; }

    [Column("rqd_value")]
    public double? RqdValue { get; set; }

    [Column("rqd_quality")]
    [MaxLength(50)]
    public string? RqdQuality { get; set; }

    [Column("rmr_value")]
    public int? RmrValue { get; set; }

    [Column("rmr_class")]
    [MaxLength(10)]
    public string? RmrClass { get; set; }

    [Column("rmr_quality")]
    [MaxLength(50)]
    public string? RmrQuality { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("created_by")]
    [MaxLength(100)]
    public string? CreatedBy { get; set; }

    [Column("notes", TypeName = "text")]
    public string? Notes { get; set; }

    // Navigation properties
    public RqdCalculation? RqdCalculation { get; set; }
    public ICollection<RmrParameter> RmrParameters { get; set; } = new List<RmrParameter>();
}
