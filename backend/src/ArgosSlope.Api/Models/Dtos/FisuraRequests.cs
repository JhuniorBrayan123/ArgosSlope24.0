namespace ArgosSlope.Api.Models.Dtos;

public record RegistrarFisuraRequest(
    string RoiId,
    double Largo,
    double Ancho,
    double Area,
    string? Orientacion,
    string? Tipo,
    string? Coordenadas
);

public record RegistrarMedicionRequest(
    double Largo,
    double Ancho,
    double Area
);
public record RegistrarAlertaRequest(
    string Tipo,
    string Mensaje,
    double UmbralSuperado,
    double ValorActual
);
public class MqttSnapshotPayload
{
    public string Event { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public double Timestamp { get; set; }
    public string ImageBase64 { get; set; } = string.Empty;
    public string? ImagePath { get; set; }
    public int? FisuraCount { get; set; }
}
