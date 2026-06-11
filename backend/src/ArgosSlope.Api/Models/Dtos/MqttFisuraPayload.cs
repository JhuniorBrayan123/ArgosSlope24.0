using System.Text.Json.Serialization;

namespace ArgosSlope.Api.Models.Dtos;

/// <summary>
/// Payload MQTT recibido desde el edge (Raspberry Pi).
/// Corresponde al JSON publicado por edge/mqtt/publisher.py publish_fisura().
/// Los nombres de propiedad usan [JsonPropertyName] para mapear desde snake_case (Python) a PascalCase (C#).
/// </summary>
public class MqttFisuraPayload
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = string.Empty;

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public double Timestamp { get; set; }

    // ── Datos de la fisura ──
    [JsonPropertyName("roi_id")]
    public string RoiId { get; set; } = string.Empty;

    [JsonPropertyName("x")]
    public int X { get; set; }

    [JsonPropertyName("y")]
    public int Y { get; set; }

    [JsonPropertyName("width")]
    public int Width { get; set; }

    [JsonPropertyName("height")]
    public int Height { get; set; }

    [JsonPropertyName("center_x")]
    public int CenterX { get; set; }

    [JsonPropertyName("center_y")]
    public int CenterY { get; set; }

    [JsonPropertyName("length_mm")]
    public double LengthMm { get; set; }

    [JsonPropertyName("width_mm")]
    public double WidthMm { get; set; }

    [JsonPropertyName("area_mm2")]
    public double AreaMm2 { get; set; }

    [JsonPropertyName("classification")]
    public string Classification { get; set; } = "none";

    [JsonPropertyName("orientation_deg")]
    public double OrientationDeg { get; set; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    // ── Alertas (para crecimiento/umbral) ──
    [JsonPropertyName("delta_percent")]
    public double? DeltaPercent { get; set; }

    [JsonPropertyName("threshold_percent")]
    public double? ThresholdPercent { get; set; }

    [JsonPropertyName("is_critical")]
    public bool? IsCritical { get; set; }
}

/// <summary>
/// Payload MQTT de telemetría del edge.
/// </summary>
public class MqttTelemetryPayload
{
    public string Event { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public double Timestamp { get; set; }
    public double Fps { get; set; }
    public int CracksCount { get; set; }
    public double? CpuTempC { get; set; }
    public double? CpuPercent { get; set; }
    public double? MemoryPercent { get; set; }
}
