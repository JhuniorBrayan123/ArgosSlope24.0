namespace ArgosSlope.Api.Models;

public class Alerta
{
    public int Id { get; set; }

    public int? CrackId { get; set; }

    public DateTime Fecha { get; set; }

    public string Tipo { get; set; } = string.Empty;

    public string Mensaje { get; set; } = string.Empty;

    public double UmbralSuperado { get; set; }

    public double ValorActual { get; set; }

    public bool Reconocida { get; set; }

    public Crack? Crack { get; set; }

    // ── Analysis-level alert fields ────────────────────────────────
    public string? AnalysisId { get; set; }
    public string? ComparisonType { get; set; } // "base_vs_current", "growth"
    public int? NuevasFisuras { get; set; }
    public double? DeltaLengthCm { get; set; }
}
