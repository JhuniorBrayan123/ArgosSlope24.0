namespace ArgosSlope.Api.Models.Dtos;

public record FisuraResponse(
    int Id,
    string RoiId,
    DateTime FechaDeteccion,
    double Largo,
    double Ancho,
    double Area,
    string? Orientacion,
    string? Tipo,
    string? Coordenadas,
    string? ImagenOriginal,
    string? ImagenSegmentada,
    double? DeltaPorcentaje,
    bool EsCritica,
    string Unidad = "px",
    bool Calibrado = false,
    double Confianza = 0.0,
    string Origen = "real",
    string? EstadoAlerta = null,
    string? DeviceId = null
);

public record FisuraDetalleResponse(
    FisuraResponse Fisura,
    List<MedicionResponse> Mediciones,
    int TotalMediciones,
    List<AlertaResponse> Alertas
);

public record MedicionResponse(
    int Id,
    int FisuraId,
    DateTime Fecha,
    double Largo,
    double Ancho,
    double Area,
    double? DeltaPorcentaje,
    bool EsCritica
);

public record AlertaResponse(
    int Id,
    int? FisuraId,
    DateTime Fecha,
    string Tipo,
    string Mensaje,
    double UmbralSuperado,
    double ValorActual,
    bool Reconocida,
    string? AnalysisId = null
);

public record ResumenResponse(
    int TotalFisuras,
    int AlertasCriticas,
    bool RpiConectada,
    double DeformacionPromedio
);

public record ConfigResponse(
    string Clave,
    string Valor,
    string? Descripcion
);

public record ValorConfigRequest(string Valor);

public record ErrorResponse(string Error);

// ── Paginated response ──────────────────────────────────────────────

public record PagedResponse<T>(
    List<T> Items,
    int Page,
    int PageSize,
    int TotalCount,
    int TotalPages
);

// ── Report DTOs ─────────────────────────────────────────────────────

public record ReportSummaryResponse(
    int TotalCracks,
    int TotalDetections,
    int TotalMeasurements,
    int TotalAlerts,
    int ActiveAlerts,
    double AvgWidthPx,
    double MaxGrowthPercent,
    DateTime? LastDetectionAt,
    double TotalLengthCm = 0,
    object? Families = null
);

public record ReportTrendPoint(
    string Date,
    double AvgWidthPx,
    int CrackCount,
    int MeasurementCount = 0
);

public record ReportAlertSummary(
    string Tipo,
    int Count
);
