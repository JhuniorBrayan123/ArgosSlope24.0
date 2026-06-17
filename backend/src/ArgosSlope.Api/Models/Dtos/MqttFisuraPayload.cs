using System.Text.Json.Serialization;

namespace ArgosSlope.Api.Models.Dtos;

public class MqttFisuraPayload
{
    [JsonPropertyName("event")]
    public string Event { get; set; } = string.Empty;

    [JsonPropertyName("device_id")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("timestamp")]
    public double Timestamp { get; set; }

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

    [JsonPropertyName("largo")]
    public double Largo { get; set; }

    [JsonPropertyName("ancho")]
    public double Ancho { get; set; }

    [JsonPropertyName("area")]
    public double Area { get; set; }

    [JsonPropertyName("classification")]
    public string Classification { get; set; } = "none";

    [JsonPropertyName("orientation_deg")]
    public double OrientationDeg { get; set; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    [JsonPropertyName("delta_percent")]
    public double? DeltaPercent { get; set; }

    [JsonPropertyName("threshold_percent")]
    public double? ThresholdPercent { get; set; }

    [JsonPropertyName("is_critical")]
    public bool? IsCritical { get; set; }

    [JsonPropertyName("unidad")]
    public string Unidad { get; set; } = "px";

    [JsonPropertyName("calibrado")]
    public bool Calibrado { get; set; }

    [JsonPropertyName("origen")]
    public string Origen { get; set; } = "real";

    [JsonPropertyName("image_base64")]
    public string? ImageBase64 { get; set; }

    [JsonPropertyName("mask_base64")]
    public string? MaskBase64 { get; set; }
}

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
