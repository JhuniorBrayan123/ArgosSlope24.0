namespace ArgosSlope.Api.Models.Dtos;

/// <summary>Respuesta pública de una fisura.</summary>
public record FisuraResponse(
    int Id,
    string RoiId,
    DateTime FechaDeteccion,
    double LargoMm,
    double AnchoMm,
    double AreaMm2,
    string? Orientacion,
    string? Tipo,
    string? Coordenadas,
    string? ImagenOriginal,
    string? ImagenSegmentada,
    double? DeltaPorcentaje,
    bool EsCritica
);

/// <summary>Respuesta detallada de una fisura con mediciones y alertas.</summary>
public record FisuraDetalleResponse(
    FisuraResponse Fisura,
    List<MedicionResponse> Mediciones,
    int TotalMediciones,
    List<AlertaResponse> Alertas
);

/// <summary>Medición diaria de fisura.</summary>
public record MedicionResponse(
    int Id,
    int FisuraId,
    DateTime Fecha,
    double LargoMm,
    double AnchoMm,
    double AreaMm2,
    double? DeltaPorcentaje,
    bool EsCritica
);

/// <summary>Alerta del sistema.</summary>
public record AlertaResponse(
    int Id,
    int? FisuraId,
    DateTime Fecha,
    string Tipo,
    string Mensaje,
    double UmbralSuperado,
    double ValorActual,
    bool Reconocida
);

/// <summary>Resumen del dashboard.</summary>
public record ResumenResponse(
    int TotalFisuras,
    int AlertasCriticas,
    bool RpiConectada,
    double DeformacionPromedio
);

/// <summary>Valor de configuración.</summary>
public record ConfigResponse(
    string Clave,
    string Valor,
    string? Descripcion
);

/// <summary>Request para actualizar configuración.</summary>
public record ValorConfigRequest(string Valor);

/// <summary>Error estándar de la API.</summary>
public record ErrorResponse(string Error);
