namespace ArgosSlope.Api.Models;

/// <summary>
/// Alerta generada cuando una medición de fisura supera el umbral configurado.
/// Mapea a la tabla "alerta".
/// </summary>
public class Alerta
{
    public int Id { get; set; }

    /// <summary>FK opcional a Fisura.</summary>
    public int? FisuraId { get; set; }

    /// <summary>Timestamp de generación de la alerta.</summary>
    public DateTime Fecha { get; set; }

    /// <summary>Tipo: critico / advertencia / informativo.</summary>
    public string Tipo { get; set; } = string.Empty;

    /// <summary>Mensaje legible en español.</summary>
    public string Mensaje { get; set; } = string.Empty;

    /// <summary>Valor del umbral que fue superado.</summary>
    public double UmbralSuperado { get; set; }

    /// <summary>Valor medido que disparó la alerta.</summary>
    public double ValorActual { get; set; }

    /// <summary>Si el operador ha reconocido la alerta.</summary>
    public bool Reconocida { get; set; }

    // ── Navigation ──
    public Fisura? Fisura { get; set; }
}
