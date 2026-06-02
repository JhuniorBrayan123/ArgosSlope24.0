namespace ArgosSlope.Api.Models;

/// <summary>
/// Medición diaria de seguimiento para una fisura detectada.
/// Mapea a la tabla "medicion_diaria".
/// </summary>
public class MedicionDiaria
{
    public int Id { get; set; }

    /// <summary>FK a Fisura.</summary>
    public int FisuraId { get; set; }

    /// <summary>Fecha de la medición.</summary>
    public DateTime Fecha { get; set; }

    /// <summary>Largo en mm.</summary>
    public double LargoMm { get; set; }

    /// <summary>Ancho en mm.</summary>
    public double AnchoMm { get; set; }

    /// <summary>Área en mm².</summary>
    public double AreaMm2 { get; set; }

    /// <summary>Porcentaje de crecimiento delta desde la medición anterior.</summary>
    public double? DeltaPorcentaje { get; set; }

    /// <summary>True cuando Δ% supera el umbral crítico.</summary>
    public bool EsCritica { get; set; }

    // ── Navigation ──
    public Fisura Fisura { get; set; } = null!;
}
