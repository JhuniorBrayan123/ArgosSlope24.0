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

        // Thresholds based on user request (temporarily in px as default if no mm, or unified)
        // Ancho bajo: >= 20 px
        // Ancho medio: >= 80 px
        // Ancho critico: >= 150 px
        // Delta medio: >= 10%
        // Delta critico: >= 25%
        // Velocidad critica: >= thresholds.VelocidadMmDiaCritico (e.g. 1.0)
        
        bool isCalibrated = ultimaMedicion?.IsCalibrated ?? false;
        string unidadStr = isCalibrated ? "mm" : "px [Estimado]";

        double anchoCritico = isCalibrated ? thresholds.AnchoCriticoMm : 150;
        double anchoMedio = isCalibrated ? (thresholds.AnchoCriticoMm / 2.0) : 80;
        double anchoBajo = isCalibrated ? (thresholds.AnchoCriticoMm / 5.0) : 20;

        double largoMedio = isCalibrated ? 80 : 80; // Example
        var largo = ultimaMedicion?.LengthMm ?? ultimaMedicion?.LengthPx ?? 0;

        // ── Evaluación multi-factor ──────────────────────────────────

        // RMR / RQD Placeholder - Preparado para integración futura con módulo geomecánico
        int rmrClass = 1; // 1 to 5
        bool rqdBajo = false;
        bool hasSevereCracks = false;

        // Factor: Crítico
        if (Ancho >= anchoCritico)
        {
            factores.Add($"Ancho ({Ancho:F2} {unidadStr}) supera umbral crítico ({anchoCritico} {unidadStr})");
            nivel = "critico";
            generarAlerta = true;
            valorUmbral = anchoCritico;
        }
        else if (crecimientoPct >= thresholds.CrecimientoPctCritico || crecimientoPct >= 25)
        {
            double deltaCritico = Math.Max(thresholds.CrecimientoPctCritico, 25);
            factores.Add($"Crecimiento ({crecimientoPct:F1}%) supera umbral crítico ({deltaCritico}%)");
            nivel = "critico";
            generarAlerta = true;
            valorUmbral = deltaCritico;
        }
        else if (velocidadMmDia >= thresholds.VelocidadMmDiaCritico)
        {
            factores.Add($"Velocidad ({velocidadMmDia:F2} {unidadStr}/día) supera umbral crítico ({thresholds.VelocidadMmDiaCritico} {unidadStr}/día)");
            nivel = "critico";
            generarAlerta = true;
            valorUmbral = Math.Max(valorUmbral, velocidadMmDia);
        }
        else if (rmrClass >= 4 || (rqdBajo && hasSevereCracks))
        {
            // Placeholder rule for RMR/RQD
            factores.Add($"Clasificación RMR/RQD en estado crítico");
            nivel = "critico";
            generarAlerta = true;
            valorUmbral = rmrClass;
        }
        // Factor: Advertencia (Medio)
        else if (Ancho >= anchoMedio)
        {
            factores.Add($"Ancho ({Ancho:F2} {unidadStr}) supera umbral medio ({anchoMedio} {unidadStr})");
            nivel = "advertencia";
            generarAlerta = true;
            valorUmbral = anchoMedio;
        }
        else if (largo >= largoMedio)
        {
            factores.Add($"Largo ({largo:F2} {unidadStr}) supera umbral medio ({largoMedio} {unidadStr})");
            nivel = "advertencia";
            generarAlerta = true;
            valorUmbral = largoMedio;
        }
        else if (crecimientoPct >= thresholds.CrecimientoPctAlerta || crecimientoPct >= 10)
        {
            double deltaMedio = Math.Max(thresholds.CrecimientoPctAlerta, 10);
            factores.Add($"Crecimiento ({crecimientoPct:F1}%) supera umbral medio ({deltaMedio}%)");
            nivel = "advertencia";
            generarAlerta = true;
            valorUmbral = deltaMedio;
        }
        else if (rmrClass == 3 && Ancho >= anchoBajo) // rmr clase III con fisuras relevantes
        {
            factores.Add($"RMR Clase III con fisuras relevantes");
            nivel = "advertencia";
            generarAlerta = true;
            valorUmbral = rmrClass;
        }
        // Factor: Informativo (Bajo)
        else if (Ancho >= anchoBajo)
        {
            factores.Add($"Ancho ({Ancho:F2} {unidadStr}) supera umbral bajo ({anchoBajo} {unidadStr})");
            nivel = "informativo";
            generarAlerta = true;
            valorUmbral = anchoBajo;
        }
        else if (mediciones.Count <= 1)
        {
            // New crack detected
            factores.Add($"Fisura nueva detectada");
            nivel = "informativo";
            generarAlerta = true;
            valorUmbral = 0;
        }

        // Determinar nivel final si hay factores pero no superó umbrales
        if (factores.Count == 0)
        {
            nivel = "estable";
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
