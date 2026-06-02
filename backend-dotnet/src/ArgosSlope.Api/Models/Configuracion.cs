namespace ArgosSlope.Api.Models;

/// <summary>
/// Parámetro de configuración clave-valor del sistema.
/// Mapea a la tabla "configuracion".
/// </summary>
public class Configuracion
{
    public int Id { get; set; }

    /// <summary>Clave única de configuración.</summary>
    public string Clave { get; set; } = string.Empty;

    /// <summary>Valor (stringificado).</summary>
    public string Valor { get; set; } = string.Empty;

    /// <summary>Descripción legible en español.</summary>
    public string? Descripcion { get; set; }
}
