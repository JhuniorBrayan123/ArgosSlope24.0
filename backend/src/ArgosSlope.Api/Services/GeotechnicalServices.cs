namespace ArgosSlope.Api.Services;

/// <summary>
/// Servicios geotécnicos migrados desde archived/backend/services/.
///
/// Origen:
///   archived/backend/services/rqd.py — Rock Quality Designation
///   archived/backend/services/deformation.py — Deformation velocity
///   archived/backend/services/growth_alert.py — Growth alert thresholds
///
/// Estos servicios están adaptados al ecosistema .NET y conectados al flujo activo.
/// </summary>
public interface IGeotechnicalServices
{
    /// <summary>
    /// Calcular RQD (Rock Quality Designation).
    /// RQD = (suma de piezas intactas ≥ 10cm / largo total del testigo) × 100
    /// </summary>
    RqdResult CalculateRqd(double[] pieceLengthsCm, double coreLengthM, double minBlockCm = 10.0);

    /// <summary>
    /// Calcular velocidad de deformación usando modelo pinhole.
    /// D_real = D_pixel × (Z / f)
    /// </summary>
    DeformationResult CalculateDeformation(double displacementPx, double daysElapsed, double zMeters, double fMm);

    /// <summary>
    /// Evaluar crecimiento contra umbral.
    /// Δ = ((actual - anterior) / anterior) × 100
    /// </summary>
    GrowthResult CheckGrowth(double[] measurementsMm, double thresholdPercent = 5.0);
}

public record RqdResult
{
    public double RqdPercent { get; init; }
    public int IntactPiecesCount { get; init; }
    public int PiecesBelowThreshold { get; init; }
    public double TotalIntactLengthCm { get; init; }
    public string QualityClass { get; init; } = string.Empty;

    /// <summary>
    /// Clasificación de calidad según RQD:
    ///   0-25%:  Muy pobre
    ///   25-50%: Pobre
    ///   50-75%: Regular
    ///   75-90%: Buena
    ///   90-100%: Excelente
    /// </summary>
    public static string Classify(double rqd)
    {
        return rqd switch
        {
            >= 90 => "excelente",
            >= 75 => "buena",
            >= 50 => "regular",
            >= 25 => "pobre",
            _ => "muy_pobre"
        };
    }
}

public record DeformationResult
{
    public double DisplacementMm { get; init; }
    public double VelocityMmPerDay { get; init; }
}

public record GrowthResult
{
    public bool IsCritical { get; init; }
    public double DeltaPercent { get; init; }
}

public class GeotechnicalServices : IGeotechnicalServices
{
    private readonly ILogger<GeotechnicalServices> _logger;

    public GeotechnicalServices(ILogger<GeotechnicalServices> logger)
    {
        _logger = logger;
    }

    public RqdResult CalculateRqd(double[] pieceLengthsCm, double coreLengthM, double minBlockCm = 10.0)
    {
        if (coreLengthM <= 0)
            throw new ArgumentException("coreLengthM must be > 0", nameof(coreLengthM));
        if (minBlockCm <= 0)
            throw new ArgumentException("minBlockCm must be > 0", nameof(minBlockCm));
        if (pieceLengthsCm.Length == 0)
            throw new ArgumentException("pieceLengthsCm must not be empty", nameof(pieceLengthsCm));

        var coreLengthCm = coreLengthM * 100.0;

        var intactPieces = pieceLengthsCm.Where(p => p >= minBlockCm).ToArray();
        var belowThreshold = pieceLengthsCm.Where(p => p < minBlockCm).ToArray();

        var totalIntactCm = intactPieces.Sum();
        var rqdPercent = Math.Round((totalIntactCm / coreLengthCm) * 100.0, 2);

        _logger.LogDebug("RQD calculated: {Rqd}% ({Intact} intact pieces, {Below} below threshold)",
            rqdPercent, intactPieces.Length, belowThreshold.Length);

        return new RqdResult
        {
            RqdPercent = rqdPercent,
            IntactPiecesCount = intactPieces.Length,
            PiecesBelowThreshold = belowThreshold.Length,
            TotalIntactLengthCm = totalIntactCm,
            QualityClass = RqdResult.Classify(rqdPercent),
        };
    }

    public DeformationResult CalculateDeformation(double displacementPx, double daysElapsed, double zMeters, double fMm)
    {
        if (displacementPx < 0)
            throw new ArgumentException("displacementPx must be ≥ 0", nameof(displacementPx));
        if (daysElapsed <= 0)
            throw new ArgumentException("daysElapsed must be > 0", nameof(daysElapsed));
        if (zMeters <= 0)
            throw new ArgumentException("z (sensor distance) must be > 0", nameof(zMeters));
        if (fMm <= 0)
            throw new ArgumentException("f (focal length) must be > 0", nameof(fMm));

        // D_real = D_pixel × (Z_mm / f_mm)
        var zMm = zMeters * 1000.0;
        var displacementMm = displacementPx * (zMm / fMm);
        var velocityMmPerDay = displacementMm / daysElapsed;

        return new DeformationResult
        {
            DisplacementMm = Math.Round(displacementMm, 4),
            VelocityMmPerDay = Math.Round(velocityMmPerDay, 4),
        };
    }

    public GrowthResult CheckGrowth(double[] measurementsMm, double thresholdPercent = 5.0)
    {
        if (measurementsMm.Length < 2)
            throw new ArgumentException("At least 2 measurements required", nameof(measurementsMm));
        if (thresholdPercent <= 0)
            throw new ArgumentException("thresholdPercent must be > 0", nameof(thresholdPercent));
        if (measurementsMm[0] == 0)
            throw new ArgumentException("First measurement cannot be zero", nameof(measurementsMm));

        var first = measurementsMm[0];
        var last = measurementsMm[^1];
        var deltaPercent = ((last - first) / first) * 100.0;

        return new GrowthResult
        {
            IsCritical = deltaPercent > thresholdPercent,
            DeltaPercent = Math.Round(deltaPercent, 2),
        };
    }
}
