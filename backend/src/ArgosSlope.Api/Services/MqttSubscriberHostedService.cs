using System.Text;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using Microsoft.EntityFrameworkCore;

namespace ArgosSlope.Api.Services;

public class MqttSubscriberHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<MqttSubscriberHostedService> _logger;
    private readonly IConfiguration _configuration;
    private readonly JsonSerializerOptions _jsonOptions;
    private readonly string _mode;

    private readonly IMqttClient _client;
    private MqttClientOptions? _options;
    private const int RECONNECT_DELAY_MS = 10_000;

    public MqttSubscriberHostedService(
        IServiceProvider services,
        ILogger<MqttSubscriberHostedService> logger,
        IConfiguration configuration,
        IMqttClient mqttClient)
    {
        _services = services;
        _logger = logger;
        _configuration = configuration;
        _client = mqttClient;
        _mode = Environment.GetEnvironmentVariable("DEMO_MODE") ?? "false";
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {

        var mqttSection = _configuration.GetSection("Mqtt");

        var broker = Environment.GetEnvironmentVariable("MQTT_BROKER")
                   ?? mqttSection["Broker"]
                   ?? "localhost";

        var portStr = Environment.GetEnvironmentVariable("MQTT_PORT")
                   ?? mqttSection["Port"]
                   ?? "1883";
        var port = int.Parse(portStr);

        var username = Environment.GetEnvironmentVariable("MQTT_USERNAME")
                    ?? mqttSection["Username"]
                    ?? "";

        var password = Environment.GetEnvironmentVariable("MQTT_PASSWORD")
                    ?? mqttSection["Password"]
                    ?? "";

        var tlsStr = Environment.GetEnvironmentVariable("MQTT_TLS_ENABLED")
                  ?? mqttSection["TlsEnabled"]
                  ?? "false";
        var tlsEnabled = string.Equals(tlsStr, "true", StringComparison.OrdinalIgnoreCase);

        var builder = new MqttClientOptionsBuilder()
            .WithTcpServer(broker, port)
            .WithCredentials(username, password)
            .WithClientId($"argos-backend-{Guid.NewGuid():N}")
            .WithCleanSession()
            .WithKeepAlivePeriod(TimeSpan.FromSeconds(60));

        if (tlsEnabled)
        {
            builder.WithTlsOptions(o => o.UseTls(true));
        }

        _options = builder.Build();

        _client.ConnectedAsync += OnConnectedAsync;
        _client.DisconnectedAsync += OnDisconnectedAsync;
        _client.ApplicationMessageReceivedAsync += OnMessageReceivedAsync;

        _logger.LogInformation("MQTT Subscriber starting (mode: {Mode})...", _mode);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _client.ConnectAsync(_options, stoppingToken);
                _logger.LogInformation("MQTT connected to {Broker}:{Port} (TLS: {Tls})", broker, port, tlsEnabled);

                // Block until cancelled
                await Task.Delay(Timeout.Infinite, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("MQTT connection failed: {Ex}. Retrying in {Delay}s...",
                    ex.Message, RECONNECT_DELAY_MS / 1000);
                await Task.Delay(RECONNECT_DELAY_MS, stoppingToken);
            }
        }
    }

    private Task OnConnectedAsync(MqttClientConnectedEventArgs args)
    {
        _logger.LogInformation("MQTT connected successfully.");

        if (_client is null) return Task.CompletedTask;

        var topics = new[]
        {
            "argos/+/fisura",       // Crack detection events
            "argos/+/telemetry",    // System health / telemetry
            "argos/+/snapshot",     // Image snapshots
            "mineria/talud/alertas", // External alert source
            "argos/+/analysis2d"    // 2D Monitoring Analysis results
        };

        foreach (var topic in topics)
        {
            _client.SubscribeAsync(new MqttTopicFilterBuilder()
                .WithTopic(topic)
                .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                .Build());
            _logger.LogInformation("Subscribed to: {Topic}", topic);
        }

        return Task.CompletedTask;
    }

    private async Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs args)
    {
        _logger.LogWarning("MQTT disconnected. Reason: {Reason}", args.Reason);

        if (args.Reason != MqttClientDisconnectReason.NormalDisconnection)
        {
            _logger.LogInformation("Reconnecting in 5s...");
            await Task.Delay(5000);
            if (_client is not null && _options is not null)
            {
                try { await _client.ConnectAsync(_options); }
                catch (Exception ex) { _logger.LogWarning("Reconnect failed: {Ex}", ex.Message); }
            }
        }
    }

    private async Task OnMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        var topic = args.ApplicationMessage.Topic;
        var payload = Encoding.UTF8.GetString(args.ApplicationMessage.PayloadSegment);

        _logger.LogDebug("MQTT ← {Topic}: {Payload}", topic, Truncate(payload, 200));

        try
        {
            if (topic.Contains("/fisura"))
            {
                await HandleFisuraMessage(payload);
            }
            else if (topic.Contains("/telemetry"))
            {
                await HandleTelemetryMessage(payload);
            }
            else if (topic.Contains("/snapshot"))
            {
                await HandleSnapshotMessage(payload);
            }
            else if (topic.Contains("mineria/talud/alertas"))
            {
                await HandleExternalAlert(payload);
            }
            else if (topic.Contains("/analysis2d"))
            {
                await HandleAnalysis2dMessage(payload);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("Error processing MQTT on {Topic}: {Ex}", topic, ex);
        }
    }

    private async Task HandleFisuraMessage(string payload)
    {
        var mqttMsg = JsonSerializer.Deserialize<MqttFisuraPayload>(payload, _jsonOptions);
        if (mqttMsg is null) return;

        using var scope = _services.CreateScope();
        var consolidationService = scope.ServiceProvider.GetRequiredService<ICrackConsolidationService>();

        await consolidationService.ProcessDetectionAsync(mqttMsg);
    }

    private async Task HandleTelemetryMessage(string payload)
    {
        var telemetry = JsonSerializer.Deserialize<MqttTelemetryPayload>(payload, _jsonOptions);
        if (telemetry is null) return;

        EdgeHeartbeatCache.Update(telemetry.DeviceId, telemetry);

        _logger.LogDebug("Telemetry from {Device}: FPS={Fps}, Cracks={Count}, Temp={Temp}°C",
            telemetry.DeviceId, telemetry.Fps, telemetry.CracksCount,
            telemetry.CpuTempC?.ToString("F1") ?? "N/A");
    }

    private async Task HandleSnapshotMessage(string payload)
    {
        var snapshot = JsonSerializer.Deserialize<MqttSnapshotPayload>(payload, _jsonOptions);
        if (snapshot is null) return;

        _logger.LogInformation("Snapshot received from {Device}: {Count} fisuras, path={Path}",
            snapshot.DeviceId, snapshot.FisuraCount ?? 0, snapshot.ImagePath ?? "inline");

        await Task.CompletedTask;
    }

    private async Task HandleExternalAlert(string payload)
    {
        _logger.LogInformation("External 3D snapshot received (len={Len})", payload.Length);

        try
        {
            var snapshot = JsonSerializer.Deserialize<Snapshot3DPayloadDto>(payload, _jsonOptions);
            if (snapshot is null || string.IsNullOrEmpty(snapshot.DeviceId))
            {
                _logger.LogWarning("Invalid 3D snapshot payload — skipping persistence.");
                return;
            }

            DateTime capturedAt = DateTime.UtcNow;
            if (!string.IsNullOrEmpty(snapshot.Timestamp)
                && DateTime.TryParse(snapshot.Timestamp, out var parsed))
            {
                capturedAt = parsed.ToUniversalTime();
            }

            var pointCount = snapshot.PointCount
                ?? snapshot.PointCloud?.Count
                ?? 0;
            var crackCount = snapshot.Cracks?.Count ?? 0;
            var meshVertexCount = snapshot.Mesh?.Vertices.Count / 3 ?? 0;

            using var scope = _services.CreateScope();
            var snapshotRepo = scope.ServiceProvider.GetRequiredService<ISnapshotRepository>();

            var entity = new Snapshot3DEntity
            {
                DeviceId = snapshot.DeviceId,
                CapturedAt = capturedAt,
                PayloadJson = payload,
                PointCount = pointCount,
                CrackCount = crackCount,
                MeshVertexCount = meshVertexCount,
            };

            await snapshotRepo.CreateAsync(entity);
            _logger.LogInformation(
                "Snapshot3D persisted: id pending, device={Device}, pts={Pts}, cracks={Cracks}, mesh_verts={Verts}",
                snapshot.DeviceId, pointCount, crackCount, meshVertexCount);
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Could not persist 3D snapshot: {Ex}", ex.Message);
        }
    }

    private async Task HandleAnalysis2dMessage(string payload)
    {
        try
        {
            var analysisObj = JsonSerializer.Deserialize<JsonElement>(payload);
            
            var captureId = analysisObj.TryGetProperty("captureId", out var capEl) ? capEl.GetString() : Guid.NewGuid().ToString();
            var zoneId = analysisObj.TryGetProperty("zoneId", out var zoneEl) ? zoneEl.GetString() : "unknown";
            
            var isBaseImage = false;
            if (analysisObj.TryGetProperty("isBaseImage", out var baseImageElement) && baseImageElement.ValueKind == JsonValueKind.True)
            {
                isBaseImage = true;
            }

            string? processedImagePath = null;
            if (analysisObj.TryGetProperty("processedImagePath", out var processedImagePathElement))
            {
                processedImagePath = processedImagePathElement.GetString();
            }

            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var analysis = new MonitoringAnalysis
            {
                CaptureId = captureId ?? Guid.NewGuid().ToString(),
                ZoneId = zoneId ?? "unknown",
                IsBaseImage = isBaseImage,
                ProcessedImagePath = processedImagePath,
                AnalysisJson = payload,
                CreatedAt = DateTime.UtcNow
            };

            db.MonitoringAnalyses.Add(analysis);
            await db.SaveChangesAsync();

            _logger.LogInformation("Saved 2D Analysis for CaptureId: {CaptureId}, ZoneId: {ZoneId}", captureId, zoneId);
        }
        catch (Exception ex)
        {
            _logger.LogError("Error processing 2D analysis MQTT message: {Ex}", ex.Message);
        }
    }

    private static string Truncate(string value, int maxLength)
        => value.Length <= maxLength ? value : value[..maxLength] + "...";
}

public static class EdgeHeartbeatCache
{
    private static readonly Dictionary<string, MqttTelemetryPayload> _heartbeats = new();
    private static readonly object _lock = new();

    public static void Update(string deviceId, MqttTelemetryPayload payload)
    {
        lock (_lock)
        {
            _heartbeats[deviceId] = payload;
        }
    }

    public static bool IsConnected(string deviceId)
    {
        lock (_lock)
        {
            if (!_heartbeats.TryGetValue(deviceId, out var last)) return false;
            var age = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - last.Timestamp;
            return age < 60; // 60 segundos de tolerancia
        }
    }

    public static bool AnyConnected()
    {
        lock (_lock)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            return _heartbeats.Values.Any(v => (now - v.Timestamp) < 60);
        }
    }
}
