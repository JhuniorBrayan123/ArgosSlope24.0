using System.Diagnostics;
using System.Text;
using System.Text.Json;
using ArgosSlope.Api.Data;
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

            // Leer stdout y stderr en paralelo
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

            try
            {
                return (JsonDocument.Parse(stdout), null);
            }
            catch (JsonException ex)
            {
                var errorMsg = $"Error parseando JSON del pipeline: {ex.Message}";
                _logger.LogError("{Error}\nStdout: {Stdout}",
                    errorMsg, stdout[..Math.Min(stdout.Length, 500)]);
                return (null, errorMsg);
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

        // ── Intenta obtener una captura de cámara (MJPEG) o usa imagen default ──
        private string ResolveImagePath(CaptureRequest request)
        {
            // Si hay un stream MJPEG configurado, podemos capturar de ahí
            var mjpegUrl = Environment.GetEnvironmentVariable("NEXT_PUBLIC_MJPEG_URL")
                        ?? "http://localhost:8082";

            // Por ahora, usamos la imagen default del pipeline
            // En producción, se capturaría del stream
            Directory.CreateDirectory(BaseImageDir);
            return DefaultImage;
        }

        // ================================================================
        //  CAPTURE
        // ================================================================

        [HttpPost("capture")]
        public async Task<IActionResult> Capture([FromBody] CaptureRequest request)
        {
            if (string.IsNullOrEmpty(request.ZoneId) || string.IsNullOrEmpty(request.DeviceId))
            {
                return BadRequest("ZoneId and DeviceId are required.");
            }

            var imagePath = ResolveImagePath(request);
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

            // Publicar resultado por MQTT (lo recibe el frontend)
            var resultJson = result.RootElement.GetRawText();
            await PublishToMqttAsync(request.DeviceId, resultJson);

            // También devolver el resultado directamente en HTTP
            return Ok(new { success = true, message = "Captura completada.", data = result.RootElement });
        }

        // ================================================================
        //  BASE IMAGE
        // ================================================================

        [HttpPost("base-image")]
        public async Task<IActionResult> SaveBaseImage([FromBody] CaptureRequest request)
        {
            var imagePath = ResolveImagePath(request);
            var baseOutput = Path.Combine(BaseImageDir, "_base_ref.jpg");
            var roiStr = RoiToString(request.Roi);

            var args = $"--command save_base --image \"{imagePath}\" --output \"{baseOutput}\"";
            if (roiStr != null)
                args += $" --roi {roiStr}";

            _logger.LogInformation("Guardando base: {Args}", args);
            var (result, error) = await RunPythonPipelineAsync(args);

            if (result == null)
            {
                return StatusCode(500, new { success = false, message = "Pipeline Python falló al guardar base.", error });
            }

            var mqttPayload = new
            {
                zoneId = request.ZoneId,
                isBaseImage = true,
                message = "Imagen base guardada localmente",
                path = baseOutput,
            };
            var mqttJson = JsonSerializer.Serialize(mqttPayload);
            await PublishToMqttAsync(request.DeviceId, mqttJson);

            return Ok(mqttPayload);
        }

        // ================================================================
        //  COMPARE DETACHMENT
        // ================================================================

        [HttpPost("compare-detachment")]
        public async Task<IActionResult> CompareDetachment([FromBody] CaptureRequest request)
        {
            var imagePath = ResolveImagePath(request);
            var basePath = Path.Combine(BaseImageDir, "_base_ref.jpg");
            var roiStr = RoiToString(request.Roi);

            if (!System.IO.File.Exists(basePath))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "No hay imagen base guardada. Ejecutá 'Base' primero.",
                    code = "NO_BASE_IMAGE"
                });
            }

            var args = $"--command compare --image \"{imagePath}\" --base \"{basePath}\"";
            if (roiStr != null)
                args += $" --roi {roiStr}";

            _logger.LogInformation("Comparando: {Args}", args);
            var (result, error) = await RunPythonPipelineAsync(args);

            if (result == null)
            {
                return StatusCode(500, new { success = false, message = "Pipeline Python falló al comparar.", error });
            }

            var resultJson = result.RootElement.GetRawText();
            await PublishToMqttAsync(request.DeviceId, resultJson);

            return Ok(new { success = true, message = "Comparación completada.", data = result.RootElement });
        }

        [HttpGet("analyses/by-zone/{zoneId}")]
        public async Task<IActionResult> GetAnalysesByZone(string zoneId)
        {
            var analyses = await _context.MonitoringAnalyses
                .Where(a => a.ZoneId == zoneId)
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
