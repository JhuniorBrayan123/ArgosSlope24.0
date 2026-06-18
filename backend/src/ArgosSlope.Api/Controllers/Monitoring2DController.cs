using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Protocol;

namespace ArgosSlope.Api.Controllers
{
    [ApiController]
    [Route("api/monitoring-2d")]
    public class Monitoring2DController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IMqttClient _mqttClient;
        private readonly ILogger<Monitoring2DController> _logger;

        // ── Rutas (se resuelven desde la raíz del proyecto) ─────────────
        private static readonly string ProjectRoot = Path.GetFullPath(
            Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", ".."));

        private static readonly string PythonExe = Path.Combine(
            ProjectRoot, "edge", ".venv", "Scripts", "python.exe");

        private static readonly string PipelineScript = Path.Combine(
            ProjectRoot, "edge", "diagnostics", "pipeline_monitoring.py");

        private static readonly string BaseImageDir = Path.Combine(
            ProjectRoot, "edge", "diagnostics", "output");

        private static readonly string DefaultImage = Path.Combine(
            ProjectRoot, "edge", "edge", "calibration", "calib_images", "Imagen1.jpeg");

        public Monitoring2DController(AppDbContext context, IMqttClient mqttClient,
                                       ILogger<Monitoring2DController> logger)
        {
            _context = context;
            _mqttClient = mqttClient;
            _logger = logger;
        }

        public class CaptureRequest
        {
            public string ZoneId { get; set; } = string.Empty;
            public string DeviceId { get; set; } = "raspberry-01";
            public object? Roi { get; set; }
            public string? ImageBase64 { get; set; }
        }

        // ── Ejecuta el pipeline Python como subproceso ──────────────────
        private async Task<(JsonDocument? Result, string? Error)> RunPythonPipelineAsync(string arguments)
        {
            var fullArgs = $"\"{PipelineScript}\" {arguments}";
            var psi = new ProcessStartInfo(PythonExe, fullArgs)
            {
                WorkingDirectory = Path.GetDirectoryName(PipelineScript),
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync();
            var stderrTask = process.StandardError.ReadToEndAsync();

            await process.WaitForExitAsync();

            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0)
            {
                var errorMsg = $"Pipeline Python falló (exit {process.ExitCode}): {stderr}";
                _logger.LogError("{Error}", errorMsg);
                return (null, errorMsg);
            }

            if (!string.IsNullOrEmpty(stderr))
            {
                _logger.LogWarning("Pipeline Python stderr: {Stderr}", stderr);
            }

            if (string.IsNullOrWhiteSpace(stdout))
            {
                return (null, "Pipeline no produjo salida stdout.");
            }

            // Filtrar stdout para extraer solo el JSON (última línea que empieza con {)
            // OpenCV puede escribir warnings en stdout que rompen el parsing
            string jsonStdout = ExtractJsonFromStdout(stdout);

            try
            {
                return (JsonDocument.Parse(jsonStdout), null);
            }
            catch (JsonException ex)
            {
                var errorMsg = $"Error parseando JSON del pipeline: {ex.Message}";
                _logger.LogError("{Error}\nStdout: {Stdout}\nFiltered: {Filtered}",
                    errorMsg, stdout[..Math.Min(stdout.Length, 500)], jsonStdout[..Math.Min(jsonStdout.Length, 500)]);
                return (null, errorMsg);
            }
        }

        // ── Clasifica severidad según pct_different ───────────────────
        //    < 2%  -> leve (cambio superficial mínimo)
        //    2-8%  -> moderada
        //    >= 8% -> critica (desprendimiento confirmado)
        private static string ClassifySeverity(JsonElement pipelineResult)
        {
            try
            {
                if (pipelineResult.TryGetProperty("comparison", out var comparison) &&
                    comparison.TryGetProperty("stats", out var stats) &&
                    stats.TryGetProperty("pct_different", out var pct))
                {
                    var diff = pct.GetDouble();
                    if (diff >= 8.0) return "critica";
                    if (diff >= 2.0) return "moderada";
                    return "leve";
                }
            }
            catch { /* ignorar errores de parseo */ }
            return "leve";
        }

        // ── Enriquece el JSON del resultado con severidad y tipo de evento ──
        private static string EnrichWithSeverity(JsonDocument result, string severity, string eventType)
        {
            try
            {
                var dict = JsonSerializer.Deserialize<Dictionary<string, object>>(result.RootElement.GetRawText());
                if (dict != null)
                {
                    dict["severity"] = severity;
                    dict["event_type"] = eventType;

                    // Si la severidad es crítica, agregar recomendación
                    if (severity == "critica")
                    {
                        dict["recommendation"] = "Se recomienda inspección visual inmediata y plan de remediación.";
                    }

                    return JsonSerializer.Serialize(dict);
                }
            }
            catch { /* ignorar errores de serialización */ }
            return result.RootElement.GetRawText();
        }

        // ── Crea una Alerta en DB cuando se detecta severidad crítica ──
        private async Task CreateDetachmentAlertAsync(string zoneId, string deviceId, JsonElement pipelineResult)
        {
            try
            {
                double pctDifferent = 0;
                if (pipelineResult.TryGetProperty("comparison", out var comparison) &&
                    comparison.TryGetProperty("stats", out var stats) &&
                    stats.TryGetProperty("pct_different", out var pct))
                {
                    pctDifferent = pct.GetDouble();
                }

                int detachmentCount = 0;
                if (comparison.ValueKind != JsonValueKind.Undefined &&
                    comparison.TryGetProperty("detachments", out var detachments) &&
                    detachments.ValueKind == JsonValueKind.Array)
                {
                    detachmentCount = detachments.GetArrayLength();
                }

                var mensaje = $"Desprendimiento detectado en zona {zoneId} (dispositivo {deviceId}): " +
                              $"{pctDifferent}% de diferencia, {detachmentCount} área(s) afectada(s). " +
                              "Se requiere inspección visual.";

                var alerta = new Alerta
                {
                    Fecha = DateTime.UtcNow,
                    Tipo = "critico",
                    Mensaje = mensaje,
                    UmbralSuperado = 8.0,
                    ValorActual = pctDifferent,
                    Reconocida = false,
                };

                _context.Alertas.Add(alerta);
                await _context.SaveChangesAsync();
                _logger.LogInformation("Alerta crítica creada en DB: {Pct}% diferencia en zona {Zone}",
                    pctDifferent, zoneId);

                // Publicar alerta por MQTT
                var alertPayload = JsonSerializer.Serialize(new
                {
                    type = "alerta",
                    event_type = "desprendimiento",
                    severity = "critica",
                    zone_id = zoneId,
                    device_id = deviceId,
                    pct_different = pctDifferent,
                    detachment_count = detachmentCount,
                    mensaje,
                    recommendation = "Se recomienda inspección visual inmediata y plan de remediación.",
                    timestamp = DateTime.UtcNow.ToString("o"),
                });
                await PublishToMqttAsync(deviceId, alertPayload);
            }
            catch (Exception ex)
            {
                _logger.LogError("Error creando alerta de desprendimiento: {Ex}", ex.Message);
            }
        }

        // ── Persiste el resultado del pipeline en la base de datos ─────
        private async Task SaveAnalysisToDbAsync(string zoneId, string analysisId,
                                                  string analysisType, JsonElement pipelineResult)
        {
            try
            {
                // Extraer el path del overlay desde el resultado
                string? processedImagePath = null;
                if (pipelineResult.TryGetProperty("images", out var images))
                {
                    if (images.TryGetProperty("familias_overlay", out var overlay))
                        processedImagePath = overlay.GetString();
                }

                var analysis = new MonitoringAnalysis
                {
                    Id = analysisId,
                    CaptureId = analysisId,
                    ZoneId = zoneId,
                    IsBaseImage = analysisType == "base",
                    AnalysisType = analysisType,
                    ProcessedImagePath = processedImagePath,
                    AnalysisJson = pipelineResult.GetRawText(),
                    CreatedAt = DateTime.UtcNow,
                };

                _context.MonitoringAnalyses.Add(analysis);
                await _context.SaveChangesAsync();
                _logger.LogInformation("Análisis guardado en DB: {Id} ({Type})", analysisId, analysisType);
            }
            catch (Exception ex)
            {
                // No debe romper la respuesta si falla el guardado en DB
                _logger.LogError("Error guardando análisis en DB: {Ex}", ex.Message);
            }
        }

        // ── Persiste fisuras individuales en Crack / CrackDetection / CrackMeasurement ──
        private async Task SaveCracksToDbAsync(string zoneId, string deviceId, string analysisType, JsonElement pipelineResult)
        {
            try
            {
                // Buscar el array de cracks en el resultado
                JsonElement cracksArray;
                if (!pipelineResult.TryGetProperty("cracks", out cracksArray) || cracksArray.ValueKind != JsonValueKind.Array)
                    return;

                // Crear un Capture para agrupar estas detecciones
                var capture = new Capture
                {
                    ZoneId = zoneId,
                    DeviceId = deviceId,
                    CapturedAt = DateTime.UtcNow,
                    Status = "processed",
                };
                _context.Captures.Add(capture);
                await _context.SaveChangesAsync(); // guardar para obtener el Id

                foreach (var crackElem in cracksArray.EnumerateArray())
                {
                    var crackId = crackElem.TryGetProperty("id", out var idProp) ? idProp.GetString() : null;
                    var family = crackElem.TryGetProperty("family", out var famProp) ? famProp.GetString() : "unknown";
                    var lengthPx = crackElem.TryGetProperty("length_px", out var lenProp) ? lenProp.GetDouble() : 0;
                    var orientation = crackElem.TryGetProperty("orientation", out var oriProp) ? oriProp.GetDouble() : 0;
                    var bboxX = crackElem.TryGetProperty("x", out var xProp) ? xProp.GetInt32() : 0;
                    var bboxY = crackElem.TryGetProperty("y", out var yProp) ? yProp.GetInt32() : 0;
                    var bboxW = crackElem.TryGetProperty("width", out var wProp) ? wProp.GetInt32() : 0;
                    var bboxH = crackElem.TryGetProperty("height", out var hProp) ? hProp.GetInt32() : 0;
                    var confidence = crackElem.TryGetProperty("confidence", out var confProp) ? confProp.GetDouble() : 1.0;

                    if (string.IsNullOrEmpty(crackId)) continue;

                    // Buscar crack existente por Code + ZoneId
                    var existingCrack = await _context.Cracks
                        .FirstOrDefaultAsync(c => c.Code == crackId && c.ZoneId == zoneId);

                    Crack crack;
                    if (existingCrack != null)
                    {
                        crack = existingCrack;
                        crack.LastSeenAt = DateTime.UtcNow;
                    }
                    else
                    {
                        crack = new Crack
                        {
                            ZoneId = zoneId,
                            Code = crackId,
                            FamilyId = family ?? "unknown",
                            FirstSeenAt = DateTime.UtcNow,
                            LastSeenAt = DateTime.UtcNow,
                            Status = "active",
                            RiskLevel = lengthPx > 500 ? "alto" : lengthPx > 100 ? "medio" : "bajo",
                        };
                        _context.Cracks.Add(crack);
                        await _context.SaveChangesAsync(); // guardar para obtener el Id
                    }

                    // Crear CrackDetection
                    var detection = new CrackDetection
                    {
                        CrackId = crack.Id,
                        CaptureId = capture.Id,
                        DetectedAt = DateTime.UtcNow,
                        DeviceId = deviceId,
                        BboxX = bboxX,
                        BboxY = bboxY,
                        BboxW = bboxW,
                        BboxH = bboxH,
                        CenterX = bboxX + bboxW / 2,
                        CenterY = bboxY + bboxH / 2,
                        LengthPx = lengthPx,
                        WidthPx = bboxW,
                        AreaPx2 = lengthPx * bboxW,
                        OrientationDeg = orientation,
                        FamilyId = family ?? "unknown",
                        Confidence = confidence,
                    };
                    _context.CrackDetections.Add(detection);

                    // Crear CrackMeasurement
                    var measurement = new CrackMeasurement
                    {
                        CrackId = crack.Id,
                        CaptureId = capture.Id,
                        LengthPx = lengthPx,
                        WidthPx = bboxW,
                        AreaPx2 = lengthPx * bboxW,
                        MeasuredAt = DateTime.UtcNow,
                    };
                    _context.CrackMeasurements.Add(measurement);
                }

                await _context.SaveChangesAsync();
                _logger.LogInformation("Fisuras guardadas en DB: {Count} cracks, capture #{CaptureId}",
                    cracksArray.GetArrayLength(), capture.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError("Error guardando fisuras en DB: {Ex}", ex.Message);
            }
        }

        // ── Publica resultado por MQTT para que el frontend lo reciba ──
        private async Task PublishToMqttAsync(string deviceId, string payload)
        {
            if (!_mqttClient.IsConnected)
            {
                _logger.LogWarning("MQTT no conectado, no se publicará el resultado.");
                return;
            }

            var topic = $"argos/{deviceId}/analysis2d";
            var message = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(payload)
                .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                .Build();

            try
            {
                await _mqttClient.PublishAsync(message);
                _logger.LogInformation("Resultado publicado en MQTT: {Topic}", topic);
            }
            catch (Exception ex)
            {
                _logger.LogError("Error publicando en MQTT: {Ex}", ex.Message);
            }
        }

        // ── Extrae JSON del stdout (filtra warnings de OpenCV) ──────────
        private static string ExtractJsonFromStdout(string stdout)
        {
            // Buscar la última línea que parece JSON válido (empieza con { y termina con })
            var lines = stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            for (int i = lines.Length - 1; i >= 0; i--)
            {
                var line = lines[i].Trim();
                if (line.StartsWith('{') && line.EndsWith('}'))
                {
                    // Verificar que parezca JSON válido
                    if (line.Contains('"') || line.Contains('['))
                    {
                        return line;
                    }
                }
            }
            // Fallback: intentar parsear todo el stdout
            return stdout;
        }

        // ── Convierte el ROI del request a string ──────────────────────
        private string? RoiToString(object? roi)
        {
            if (roi == null) return null;
            try
            {
                using var doc = JsonDocument.Parse(JsonSerializer.Serialize(roi));
                var root = doc.RootElement;
                double x = 0, y = 0, w = 0, h = 0;
                if (root.TryGetProperty("x", out var xEl)) x = xEl.GetDouble();
                if (root.TryGetProperty("y", out var yEl)) y = yEl.GetDouble();
                if (root.TryGetProperty("w", out var wEl)) w = wEl.GetDouble();
                if (root.TryGetProperty("h", out var hEl)) h = hEl.GetDouble();
                return $"{x},{y},{w},{h}";
            }
            catch
            {
                return null;
            }
        }

        // ── Resuelve la imagen: base64 del frontend o default ──
        private async Task<string> ResolveImagePathAsync(CaptureRequest request)
        {
            Directory.CreateDirectory(BaseImageDir);

            if (!string.IsNullOrEmpty(request.ImageBase64))
            {
                var tempPath = Path.Combine(BaseImageDir, $"_capture_{DateTime.UtcNow:yyyyMMdd_HHmmss}.jpg");
                try
                {
                    var bytes = Convert.FromBase64String(request.ImageBase64);
                    await System.IO.File.WriteAllBytesAsync(tempPath, bytes);
                    _logger.LogInformation("Imagen recibida del frontend (base64, {Len} bytes)", bytes.Length);
                    return tempPath;
                }
                catch (FormatException ex)
                {
                    _logger.LogWarning("Base64 inválido del frontend: {Ex}, usando default", ex.Message);
                }
            }

            _logger.LogInformation("Usando imagen default del pipeline: {Img}", DefaultImage);
            return DefaultImage;
        }

        // ── Sirve archivos del directorio de salida del pipeline ──────
        [HttpGet("diagnostics-output/{**filePath}")]
        public IActionResult GetDiagnosticsOutput(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return BadRequest(new { success = false, message = "filePath es requerido." });

            var resolvedPath = Path.GetFullPath(Path.Combine(BaseImageDir, filePath));

            // Security: evitar path traversal fuera del directorio base
            if (!resolvedPath.StartsWith(BaseImageDir, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { success = false, message = "Ruta no válida." });

            if (!System.IO.File.Exists(resolvedPath))
                return NotFound(new { success = false, message = "Archivo no encontrado." });

            var ext = Path.GetExtension(resolvedPath).ToLowerInvariant();
            var contentType = ext switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                ".gif" => "image/gif",
                ".csv" => "text/csv",
                ".json" => "application/json",
                ".txt" => "text/plain",
                _ => "application/octet-stream",
            };

            _logger.LogDebug("Sirviendo archivo: {Path}", resolvedPath);
            return PhysicalFile(resolvedPath, contentType, Path.GetFileName(resolvedPath));
        }

        // ================================================================
        //  CAPTURE
        // ================================================================

        [HttpPost("capture")]
        public async Task<IActionResult> Capture([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrEmpty(request.ZoneId) || string.IsNullOrEmpty(request.DeviceId))
            {
                return BadRequest(new { success = false, message = "ZoneId y DeviceId son requeridos." });
            }

            var imagePath = await ResolveImagePathAsync(request);
            var roiStr = RoiToString(request.Roi);

            var args = $"--command capture --image \"{imagePath}\"";
            if (roiStr != null)
                args += $" --roi {roiStr}";

            _logger.LogInformation("Ejecutando pipeline: {Args}", args);
            var (result, error) = await RunPythonPipelineAsync(args);

            if (result == null)
            {
                return StatusCode(500, new { success = false, message = "Pipeline Python falló.", error });
            }

            var resultJson = result.RootElement.GetRawText();
            await PublishToMqttAsync(request.DeviceId, resultJson);

            // Persistir en BD
            var analysisId = result.RootElement.TryGetProperty("analysis_id", out var aid)
                ? aid.GetString() : Guid.NewGuid().ToString();
            await SaveAnalysisToDbAsync(request.ZoneId, analysisId!, "current", result.RootElement);
            await SaveCracksToDbAsync(request.ZoneId, request.DeviceId, "current", result.RootElement);

            return Ok(result.RootElement);
        }

        // ================================================================
        //  BASE IMAGE
        // ================================================================

        [HttpPost("base-image")]
        public async Task<IActionResult> SaveBaseImage([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrEmpty(request.ZoneId) || string.IsNullOrEmpty(request.DeviceId))
            {
                return BadRequest(new { success = false, message = "ZoneId y DeviceId son requeridos." });
            }

            var imagePath = await ResolveImagePathAsync(request);
            var roiStr = RoiToString(request.Roi);

            var args = $"--command save_base --image \"{imagePath}\"";
            if (roiStr != null)
                args += $" --roi {roiStr}";

            _logger.LogInformation("Guardando base: {Args}", args);
            var (result, error) = await RunPythonPipelineAsync(args);

            if (result == null)
            {
                return StatusCode(500, new { success = false, message = "Pipeline Python falló al guardar base.", error });
            }

            var resultJson = result.RootElement.GetRawText();
            await PublishToMqttAsync(request.DeviceId, resultJson);

            // Persistir en BD
            var baseAnalysisId = result.RootElement.TryGetProperty("analysis_id", out var baseAid)
                ? baseAid.GetString() : Guid.NewGuid().ToString();
            await SaveAnalysisToDbAsync(request.ZoneId, baseAnalysisId!, "base", result.RootElement);
            await SaveCracksToDbAsync(request.ZoneId, request.DeviceId, "base", result.RootElement);

            return Ok(result.RootElement);
        }

        // ================================================================
        //  COMPARE DETACHMENT
        // ================================================================

        [HttpPost("compare-detachment")]
        public async Task<IActionResult> CompareDetachment([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrEmpty(request.ZoneId) || string.IsNullOrEmpty(request.DeviceId))
            {
                return BadRequest(new { success = false, message = "ZoneId y DeviceId son requeridos." });
            }

            // Validar que exista imagen base ANTES de ejecutar el pipeline
            var basePath = Path.Combine(BaseImageDir, "_base_ref.jpg");
            if (!System.IO.File.Exists(basePath))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "No hay imagen base guardada. Hacé clic en 'Base' primero.",
                    code = "NO_BASE_IMAGE",
                });
            }

            var imagePath = await ResolveImagePathAsync(request);
            var roiStr = RoiToString(request.Roi);

            var args = $"--command compare --image \"{imagePath}\" --base \"{basePath}\"";
            if (roiStr != null)
                args += $" --roi {roiStr}";

            _logger.LogInformation("Comparando: {Args}", args);
            var (result, error) = await RunPythonPipelineAsync(args);

            if (result == null)
            {
                _logger.LogError("Pipeline de comparación falló: {Error}", error);
                return StatusCode(500, new { success = false, message = "Pipeline de comparación falló.", error });
            }

            // ── Clasificar severidad del desprendimiento ────────────────
            string severity = ClassifySeverity(result.RootElement);
            string eventType = severity == "critica" ? "desprendimiento" : "cambio_superficial";
            _logger.LogInformation("Severidad detectada: {Sev} (evento: {Evt})", severity, eventType);

            // Enriquecer el resultado con severidad
            var resultJson = EnrichWithSeverity(result, severity, eventType);

            // ── Si es crítica, crear alerta automática ──────────────────
            if (severity == "critica")
            {
                await CreateDetachmentAlertAsync(request.ZoneId, request.DeviceId, result.RootElement);
            }

            await PublishToMqttAsync(request.DeviceId, resultJson);

            // Persistir en BD (current + comparación)
            var currentId = result.RootElement.TryGetProperty("current_analysis_id", out var curAid)
                ? curAid.GetString() : null;
            if (currentId != null)
            {
                // Extraer el current_analysis del resultado
                if (result.RootElement.TryGetProperty("current_analysis", out var curAnalysis))
                    await SaveAnalysisToDbAsync(request.ZoneId, currentId, "current", curAnalysis);
            }
            var compId = result.RootElement.TryGetProperty("comparison_id", out var compAid)
                ? compAid.GetString() : Guid.NewGuid().ToString();
            await SaveAnalysisToDbAsync(request.ZoneId, compId!, "comparison", result.RootElement);
            // Guardar fisuras individuales de la comparación
            await SaveCracksToDbAsync(request.ZoneId, request.DeviceId, "comparison", result.RootElement);

            // Devolver el JSON enriquecido con severidad (tanto HTTP como MQTT)
            return Content(resultJson, "application/json", System.Text.Encoding.UTF8);
        }

        // ================================================================
        //  ANÁLISIS HISTÓRICOS
        // ================================================================

        [HttpGet("analyses/by-zone/{zoneId}")]
        public async Task<IActionResult> GetAnalysesByZone(string zoneId,
                                                            [FromQuery] string? type = null)
        {
            var query = _context.MonitoringAnalyses
                .Where(a => a.ZoneId == zoneId);

            if (!string.IsNullOrEmpty(type))
                query = query.Where(a => a.AnalysisType == type);

            var analyses = await query
                .OrderByDescending(a => a.CreatedAt)
                .Take(50)
                .ToListAsync();

            return Ok(analyses);
        }

        [HttpGet("analyses/{id}")]
        public async Task<IActionResult> GetAnalysisById(string id)
        {
            var analysis = await _context.MonitoringAnalyses.FindAsync(id);
            if (analysis == null) return NotFound();

            return Ok(analysis);
        }
    }
}
