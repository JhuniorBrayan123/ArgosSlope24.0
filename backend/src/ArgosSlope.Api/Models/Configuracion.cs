namespace ArgosSlope.Api.Models;

public class Configuracion
{
    public int Id { get; set; }

    public string Clave { get; set; } = string.Empty;

    public string Valor { get; set; } = string.Empty;

    public string? Descripcion { get; set; }
}
