namespace ArgosSlope.Api.Models;

/// <summary>
/// Fisura detectada en el talud minero.
/// Mapea a la tabla "fisura" en PostgreSQL (compatible con el esquema existente).
/// </summary>
public class Fisura
{
    public int Id { get; set; }

    /// <summary>Identificador de la región de interés (ROI).</summary>
    public string RoiId { get; set; } = string.Empty;

    /// <summary>Fecha/hora de detección inicial.</summary>
    public DateTime FechaDeteccion { get; set; }

    /// <summary>Largo estimado de la fisura en mm.</summary>
    public double LargoMm { get; set; }

    /// <summary>Ancho promedio de la fisura en mm.</summary>
    public double AnchoMm { get; set; }

    /// <summary>Área superficial en mm².</summary>
    public double AreaMm2 { get; set; }

    /// <summary>Ángulo de orientación (grados).</summary>
    public string? Orientacion { get; set; }

    /// <summary>Tipo: fina / media / gruesa.</summary>
    public string? Tipo { get; set; }

    /// <summary>Coordenadas ROI en JSON: {"x":120,"y":340,"w":80,"h":60}.</summary>
    public string? Coordenadas { get; set; }

    /// <summary>Ruta a la imagen original.</summary>
    public string? ImagenOriginal { get; set; }

    /// <summary>Ruta a la imagen segmentada por IA.</summary>
    public string? ImagenSegmentada { get; set; }

    // ── Navigation properties ──
    public ICollection<MedicionDiaria> Mediciones { get; set; } = new List<MedicionDiaria>();
    public ICollection<Alerta> Alertas { get; set; } = new List<Alerta>();
}
