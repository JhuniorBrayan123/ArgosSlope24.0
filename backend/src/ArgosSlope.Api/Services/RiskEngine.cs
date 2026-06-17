using ArgosSlope.Api.Models;

namespace ArgosSlope.Api.Services;

/// <summary>
/// Risk Engine para ARGOS SLOPE 4.0.
/// Evalúa fisuras contra umbrales configurables y genera alertas reales.
/// </summary>
public interface IRiskEngine
{
    /// <summary>
    /// Evaluar una fisura y sus mediciones contra todos los umbrales.
    /// </summary>
    Task<RiskEvaluation> EvaluateAsync(Crack fisura, CrackMeasurement? ultimaMedicion);

    /// <summary>
    /// Obtener los umbrales actuales desde configuración.
    /// </summary>
    Task<RiskThresholds> GetThresholdsAsync();
}

/// <summary>
/// Umbrales configurables para el Risk Engine
/// </summary>
public record RiskThresholds
{
    public double AnchoCriticoMm { get; init; } = 0.3;
    public double CrecimientoPctAlerta { get; init; } = 5.0;
    public double VelocidadMmDiaAlerta { get; init; } = 0.5;
    public double CrecimientoPctCritico { get; init; } = 10.0;
    public double VelocidadMmDiaCritico { get; init; } = 1.0;

    public static RiskThresholds FromConfig(List<Configuracion> configs)
    {
        var t = new RiskThresholds();
        foreach (var c in configs)
        {
            if (double.TryParse(c.Valor, System.Globalization.NumberStyles.Any,
                System.Globalization.CultureInfo.InvariantCulture, out var val))
            {
                switch (c.Clave)
                {
                    case "umbral_ancho": t = t with { AnchoCriticoMm = val }; break;
                    case "umbral_crecimiento_pct": t = t with { CrecimientoPctAlerta = val }; break;
                    case "umbral_velocidad_mm_dia": t = t with { VelocidadMmDiaAlerta = val }; break;
                }
            }
        }
        return t;
    }
}

/// <summary>
/// Resultado de la evaluación de riesgo para una fisura
/// </summary>
public record RiskEvaluation
{
    public string RoiId { get; init; } = string.Empty;
    public string NivelRiesgo { get; init; } = "bajo"; // bajo | medio | alto | critico
    public double Ancho { get; init; }
    public double CrecimientoPct { get; init; }
    public double VelocidadMmDia { get; init; }
    public List<string> FactoresRiesgo { get; init; } = new();
    public bool GenerarAlerta { get; init; }
    public string MensajeAlerta { get; init; } = string.Empty;
    public double ValorUmbralSuperado { get; init; }
}

public class RiskEngine : IRiskEngine
{
    private readonly IFisuraRepository _repo;
    private readonly ILogger<RiskEngine> _logger;

    public RiskEngine(IFisuraRepository repo, ILogger<RiskEngine> logger)
    {
        _repo = repo;
        _logger = logger;
    }

    public async Task<RiskEvaluation> EvaluateAsync(Crack fisura, CrackMeasurement? ultimaMedicion)
    {
        var configs = await _repo.GetConfiguracionAsync();
        var thresholds = RiskThresholds.FromConfig(configs);

        var factores = new List<string>();
        var nivel = "bajo";
        var generarAlerta = false;
        var mensajeAlerta = string.Empty;
        var valorUmbral = 0.0;

        var Ancho = ultimaMedicion?.WidthMm ?? ultimaMedicion?.WidthPx ?? 0;
        var crecimientoPct = ultimaMedicion?.GrowthPercent ?? 0;
        var velocidadMmDia = 0.0;

        // Calcular velocidad (mm/día) desde la primera medición
        var mediciones = await _repo.GetMedicionesAsync(fisura.Id);
        if (mediciones.Count >= 2)
        {
            var primera = mediciones.First();
            var ultima = mediciones.Last();
            var dias = (ultima.MeasuredAt - primera.MeasuredAt).TotalDays;
            if (dias > 0)
            {
                var largoPrimera = primera.LengthMm ?? primera.LengthPx;
                var largoUltima = ultima.LengthMm ?? ultima.LengthPx;
                velocidadMmDia = (largoUltima - largoPrimera) / dias;
            }
        }

        // ── Evaluación multi-factor ──────────────────────────────────

        // Factor 1: Ancho de fisura
        if (Ancho >= thresholds.AnchoCriticoMm)
        {
            factores.Add($"Ancho ({Ancho:F2}mm) supera umbral ({thresholds.AnchoCriticoMm}mm)");
        }

        // Factor 2: Crecimiento porcentual
        if (crecimientoPct >= thresholds.CrecimientoPctCritico)
        {
            factores.Add($"Crecimiento ({crecimientoPct:F1}%) supera umbral crítico ({thresholds.CrecimientoPctCritico}%)");
            nivel = "critico";
            generarAlerta = true;
            valorUmbral = crecimientoPct;
        }
        else if (crecimientoPct >= thresholds.CrecimientoPctAlerta)
        {
            factores.Add($"Crecimiento ({crecimientoPct:F1}%) supera umbral de alerta ({thresholds.CrecimientoPctAlerta}%)");
            nivel = "alto";
            generarAlerta = true;
            valorUmbral = crecimientoPct;
        }

        // Factor 3: Velocidad de crecimiento
        if (velocidadMmDia >= thresholds.VelocidadMmDiaCritico)
        {
            factores.Add($"Velocidad ({velocidadMmDia:F2}mm/día) supera umbral crítico ({thresholds.VelocidadMmDiaCritico}mm/día)");
            nivel = "critico";
            generarAlerta = true;
            valorUmbral = Math.Max(valorUmbral, velocidadMmDia);
        }
        else if (velocidadMmDia >= thresholds.VelocidadMmDiaAlerta)
        {
            factores.Add($"Velocidad ({velocidadMmDia:F2}mm/día) supera umbral de alerta ({thresholds.VelocidadMmDiaAlerta}mm/día)");
            if (nivel != "critico")
            {
                nivel = "alto";
                generarAlerta = true;
            }
            valorUmbral = Math.Max(valorUmbral, velocidadMmDia);
        }

        // Factor 4: Clasificación combinada
        if (Ancho >= thresholds.AnchoCriticoMm && crecimientoPct > 0)
        {
            _logger.LogDebug("Riesgo combinado para {RoiId}: ancho={Ancho}mm, crecimiento={Crec}Pct, vel={Vel}mm/día",
                fisura.Code, Ancho, crecimientoPct, velocidadMmDia);
        }

        // Determinar nivel final si hay factores pero no superó umbrales numéricos
        if (factores.Count == 0)
        {
            nivel = "bajo";
        }
        else if (nivel == "bajo")
        {
            nivel = "medio";
        }

        if (generarAlerta)
        {
            mensajeAlerta =
                $"Riesgo {nivel.ToUpper()} en {fisura.Code}: " +
                $"{string.Join("; ", factores)}";
        }

        return new RiskEvaluation
        {
            RoiId = fisura.Code,
            NivelRiesgo = nivel,
            Ancho = Ancho,
            CrecimientoPct = crecimientoPct,
            VelocidadMmDia = velocidadMmDia,
            FactoresRiesgo = factores,
            GenerarAlerta = generarAlerta,
            MensajeAlerta = mensajeAlerta,
            ValorUmbralSuperado = valorUmbral,
        };
    }

    public async Task<RiskThresholds> GetThresholdsAsync()
    {
        var configs = await _repo.GetConfiguracionAsync();
        return RiskThresholds.FromConfig(configs);
    }
}
