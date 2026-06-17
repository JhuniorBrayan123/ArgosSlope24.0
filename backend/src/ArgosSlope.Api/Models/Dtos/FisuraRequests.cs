namespace ArgosSlope.Api.Models.Dtos;

/// <summary>
/// Request para registrar una nueva fisura desde la API REST
/// (alternativa a la ingesta MQTT)
/// </summary>
public record RegistrarFisuraRequest(
    string RoiId,
    double Largo,
    double Ancho,
    double Area,
    string? Orientacion,
    string? Tipo,
    string? Coordenadas
);

/// <summary>
/// Request para registrar una nueva medición desde la API REST
/// </summary>
public record RegistrarMedicionRequest(
    double Largo,
    double Ancho,
    double Area
);

/// <summary>
/// Request para registrar una alerta manual desde la API REST
/// </summary>
public record RegistrarAlertaRequest(
    string Tipo,
    string Mensaje,
    double UmbralSuperado,
    double ValorActual
);

/// <summary>
/// Payload MQTT para snapshot/image
/// </summary>
public class MqttSnapshotPayload
{
    public string Event { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public double Timestamp { get; set; }
    public string ImageBase64 { get; set; } = string.Empty;
    public string? ImagePath { get; set; }
    public int? FisuraCount { get; set; }
}
