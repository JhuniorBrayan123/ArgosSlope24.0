using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;

namespace ArgosSlope.Api.Services;

public interface ICrackConsolidationService
{
    Task ProcessDetectionAsync(MqttFisuraPayload payload);
}

public class CrackConsolidationService : ICrackConsolidationService
{
    private readonly AppDbContext _db;
    private readonly IFileStorageService _fileStorage;
    private readonly IRiskEngine _riskEngine;
    private readonly ILogger<CrackConsolidationService> _logger;
    private const double MaxCentroidDistancePx = 50.0;

    public CrackConsolidationService(AppDbContext db, IFileStorageService fileStorage, IRiskEngine riskEngine, ILogger<CrackConsolidationService> logger)
    {
        _db = db;
        _fileStorage = fileStorage;
        _riskEngine = riskEngine;
        _logger = logger;
    }

    public async Task ProcessDetectionAsync(MqttFisuraPayload payload)
    {
        var timestamp = DateTimeOffset.FromUnixTimeSeconds((long)payload.Timestamp).UtcDateTime;
        if (timestamp < new DateTime(2020, 1, 1)) timestamp = DateTime.UtcNow;

        // 1. Guardar imágenes en FS
        string? imagePath = null;
        string? maskPath = null;

        if (!string.IsNullOrEmpty(payload.ImageBase64))
        {
            imagePath = await _fileStorage.SaveImageBase64Async(payload.ImageBase64, "cracks/images", payload.RoiId);
        }

        if (!string.IsNullOrEmpty(payload.MaskBase64))
        {
            maskPath = await _fileStorage.SaveImageBase64Async(payload.MaskBase64, "cracks/masks", payload.RoiId);
        }

        // 2. Buscar fisura existente por ROI ID o por proximidad
        var activeCracks = await _db.Cracks
            .Where(c => c.Status == "active")
            .ToListAsync();

        Crack? targetCrack = null;

        // Intentar match por RoiId explícito si el edge ya lo trackea
        targetCrack = activeCracks.FirstOrDefault(c => c.Code == payload.RoiId);

        // Si no hay match por ID, intentar por proximidad de centroides con la última detección conocida
        if (targetCrack == null)
        {
            foreach (var crack in activeCracks)
            {
                var lastDetection = await _db.CrackDetections
                    .Where(d => d.CrackId == crack.Id)
                    .OrderByDescending(d => d.DetectedAt)
                    .FirstOrDefaultAsync();

                if (lastDetection != null)
                {
                    double dx = lastDetection.CenterX - payload.CenterX;
                    double dy = lastDetection.CenterY - payload.CenterY;
                    double distance = Math.Sqrt(dx * dx + dy * dy);

                    if (distance <= MaxCentroidDistancePx)
                    {
                        targetCrack = crack;
                        break;
                    }
                }
            }
        }

        // 3. Crear fisura consolidada si no existe
        if (targetCrack == null)
        {
            targetCrack = new Crack
            {
                Code = payload.RoiId,
                FirstSeenAt = timestamp,
                LastSeenAt = timestamp,
                Status = "active",
                RiskLevel = "bajo",
            };
            _db.Cracks.Add(targetCrack);
            await _db.SaveChangesAsync();
        }
        else
        {
            targetCrack.LastSeenAt = timestamp;
        }

        // 4. Crear Detección (Raw)
        var detection = new CrackDetection
        {
            CrackId = targetCrack.Id,
            DetectedAt = timestamp,
            DeviceId = payload.DeviceId,
            BboxX = payload.X,
            BboxY = payload.Y,
            BboxW = payload.Width,
            BboxH = payload.Height,
            CenterX = payload.CenterX,
            CenterY = payload.CenterY,
            OrientationDeg = payload.OrientationDeg,
            Confidence = payload.Confidence,
            ImagePath = imagePath,
            MaskPath = maskPath,
        };
        _db.CrackDetections.Add(detection);

        // 5. Crear Medición (Procesada)
        // Para simplificar, asumimos 1 medición por detección. Se podría agregar lógica de agregación por hora/día.
        var measurement = new CrackMeasurement
        {
            CrackId = targetCrack.Id,
            MeasuredAt = timestamp,
            LengthMm = payload.Largo,
            WidthMm = payload.Ancho,
            AreaMm2 = payload.Area,
            IsCalibrated = payload.Calibrado,
            GrowthPercent = 0 // Se actualizaría asíncronamente o en el RiskEngine
        };
        
        // Si ya hay una medición anterior, calcular growth
        var prevMeasurement = await _db.CrackMeasurements
            .Where(m => m.CrackId == targetCrack.Id)
            .OrderByDescending(m => m.MeasuredAt)
            .FirstOrDefaultAsync();

        if (prevMeasurement != null)
        {
            var prevLength = prevMeasurement.LengthMm ?? prevMeasurement.LengthPx;
            if (prevLength > 0)
            {
                measurement.GrowthPercent = ((payload.Largo - prevLength) / prevLength) * 100;
            }
        }

        _db.CrackMeasurements.Add(measurement);

        await _db.SaveChangesAsync();

        // 6. Evaluar riesgos y generar alertas
        var riskEvaluation = await _riskEngine.EvaluateAsync(targetCrack, measurement);
        
        targetCrack.RiskLevel = riskEvaluation.NivelRiesgo;
        _db.Cracks.Update(targetCrack);

        if (riskEvaluation.GenerarAlerta)
        {
            var tipoAlerta = riskEvaluation.NivelRiesgo; // critico, advertencia, informativo

            // Evitar duplicar alertas no reconocidas del mismo tipo para esta fisura
            var existingAlerta = await _db.Alertas.FirstOrDefaultAsync(a => 
                a.CrackId == targetCrack.Id && 
                a.Tipo == tipoAlerta && 
                !a.Reconocida);

            if (existingAlerta == null)
            {
                var alerta = new Alerta
                {
                    CrackId = targetCrack.Id,
                    Tipo = tipoAlerta,
                    Mensaje = riskEvaluation.MensajeAlerta,
                    UmbralSuperado = riskEvaluation.ValorUmbralSuperado,
                    ValorActual = Math.Max(measurement.WidthPx, measurement.GrowthPercent), // Aproximación, depende del factor principal
                    Fecha = DateTime.UtcNow,
                    Reconocida = false
                };
                
                _db.Alertas.Add(alerta);
                _logger.LogInformation("Nueva alerta generada para fisura {CrackCode}: {Nivel} - {Mensaje}", targetCrack.Code, tipoAlerta, riskEvaluation.MensajeAlerta);
            }
        }

        await _db.SaveChangesAsync();
    }
}
