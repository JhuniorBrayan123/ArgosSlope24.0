using System.Text;
using System.Text.Json;
using MQTTnet;
using MQTTnet.Client;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using Microsoft.EntityFrameworkCore;

namespace ArgosSlope.Api.Services;

/// <summary>
/// Background service que se suscribe a MQTT para recibir telemetría
/// de fisuras desde el edge (Raspberry Pi).
///
/// Topics suscritos:
///   - argos/+/fisura    → Fisura detectada / alerta de crecimiento
///   - argos/+/telemetry → Telemetría del dispositivo
///   - argos/+/snapshot  → Snapshot de imagen (opcional)
/// </summary>
public class MqttSubscriberHostedService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<MqttSubscriberHostedService> _logger;
    private readonly IConfiguration _configuration;
    private readonly JsonSerializerOptions _jsonOptions;

    private IMqttClient? _client;
    private MqttClientOptions? _options;

    public MqttSubscriberHostedService(
        IServiceProvider services,
        ILogger<MqttSubscriberHostedService> logger,
        IConfiguration configuration)
    {
        _services = services;
        _logger = logger;
        _configuration = configuration;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var factory = new MqttFactory();

        // ── Configuración (appsettings.json + env vars override) ────
        // Las variables de entorno tienen prioridad sobre appsettings.json
        // Formato env var: Mqtt__Broker (doble underscore) o MQTT_BROKER (legacy)
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

        // TLS para HiveMQ Cloud / conexiones seguras
        if (tlsEnabled)
        {
            builder.WithTlsOptions(o => o.UseTls(true));
        }

        _options = builder.Build();

        _client = factory.CreateMqttClient();

        // ── Callbacks ──────────────────────────────────────────────
        _client.ConnectedAsync += OnConnectedAsync;
        _client.DisconnectedAsync += OnDisconnectedAsync;
        _client.ApplicationMessageReceivedAsync += OnMessageReceivedAsync;

        // ── Bucle de reconexión ────────────────────────────────────
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _client.ConnectAsync(_options, stoppingToken);
                _logger.LogInformation("MQTT connected to {Broker}:{Port}", broker, port);

                // Mantener conexión
                await Task.Delay(Timeout.Infinite, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogWarning("MQTT connection failed: {Ex}. Retrying in 10s...", ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }
    }

    private Task OnConnectedAsync(MqttClientConnectedEventArgs args)
    {
        _logger.LogInformation("MQTT connected successfully.");

        if (_client is null) return Task.CompletedTask;

        // Suscribirse a todos los tópicos de ARGOS
        var topics = new[]
        {
            "argos/+/fisura",     // Detecciones y alertas
            "argos/+/telemetry",  // Telemetría del edge
            "argos/+/snapshot",   // Snapshots (opcional)
        };

        foreach (var topic in topics)
        {
            _client.SubscribeAsync(new MqttTopicFilterBuilder()
                .WithTopic(topic)
                .WithQualityOfServiceLevel(MQTTnet.Protocol.MqttQualityOfServiceLevel.AtLeastOnce)
                .Build());
            _logger.LogInformation("Subscribed to MQTT topic: {Topic}", topic);
        }

        return Task.CompletedTask;
    }

    private async Task OnDisconnectedAsync(MqttClientDisconnectedEventArgs args)
    {
        _logger.LogWarning("MQTT disconnected. Reason: {Reason}", args.Reason);

        if (args.Reason != MqttClientDisconnectReason.NormalDisconnection)
        {
            // Auto-reconnect
            await Task.Delay(5000);
            if (_client is not null && _options is not null)
            {
                try { await _client.ConnectAsync(_options); }
                catch { /* next retry cycle */ }
            }
        }
    }

    private async Task OnMessageReceivedAsync(MqttApplicationMessageReceivedEventArgs args)
    {
        var topic = args.ApplicationMessage.Topic;
        var payload = Encoding.UTF8.GetString(args.ApplicationMessage.PayloadSegment);

        _logger.LogDebug("MQTT received on {Topic}: {Payload}", topic, payload);

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
            // snapshot se ignora por ahora para no saturar
        }
        catch (Exception ex)
        {
            _logger.LogError("Error processing MQTT message on {Topic}: {Ex}", topic, ex);
        }
    }

    /// <summary>
    /// Procesa un mensaje de fisura recibido por MQTT.
    /// Crea o actualiza la fisura en la base de datos.
    /// </summary>
    private async Task HandleFisuraMessage(string payload)
    {
        var mqttMsg = JsonSerializer.Deserialize<MqttFisuraPayload>(payload, _jsonOptions);
        if (mqttMsg is null) return;

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Buscar fisura existente por ROI ID
        var fisura = await db.Fisuras
            .FirstOrDefaultAsync(f => f.RoiId == mqttMsg.RoiId);

        var ahora = DateTime.UtcNow;
        var coordenadasJson = $"{{\"x\":{mqttMsg.X},\"y\":{mqttMsg.Y},\"w\":{mqttMsg.Width},\"h\":{mqttMsg.Height}}}";

        if (fisura is null)
        {
            // Crear nueva fisura
            fisura = new Fisura
            {
                RoiId = mqttMsg.RoiId,
                FechaDeteccion = ahora,
                LargoMm = mqttMsg.LengthMm,
                AnchoMm = mqttMsg.WidthMm,
                AreaMm2 = mqttMsg.AreaMm2,
                Orientacion = $"{mqttMsg.OrientationDeg:F1}°",
                Tipo = mqttMsg.Classification,
                Coordenadas = coordenadasJson,
            };
            db.Fisuras.Add(fisura);
            await db.SaveChangesAsync();

            _logger.LogInformation("Nueva fisura creada: {RoiId}", mqttMsg.RoiId);
        }
        else
        {
            // Actualizar métricas existentes
            fisura.LargoMm = mqttMsg.LengthMm;
            fisura.AnchoMm = mqttMsg.WidthMm;
            fisura.AreaMm2 = mqttMsg.AreaMm2;
            fisura.Tipo = mqttMsg.Classification;
            fisura.Orientacion = $"{mqttMsg.OrientationDeg:F1}°";
            fisura.Coordenadas = coordenadasJson;
            await db.SaveChangesAsync();
        }

        // Crear medición diaria
        var delta = mqttMsg.DeltaPercent;
        var esCritica = mqttMsg.IsCritical ?? false;

        var medicion = new MedicionDiaria
        {
            FisuraId = fisura.Id,
            Fecha = ahora,
            LargoMm = mqttMsg.LengthMm,
            AnchoMm = mqttMsg.WidthMm,
            AreaMm2 = mqttMsg.AreaMm2,
            DeltaPorcentaje = delta,
            EsCritica = esCritica,
        };
        db.MedicionesDiarias.Add(medicion);
        await db.SaveChangesAsync();

        // Si es crítica, crear alerta
        if (esCritica && mqttMsg.DeltaPercent.HasValue && mqttMsg.ThresholdPercent.HasValue)
        {
            var alerta = new Alerta
            {
                FisuraId = fisura.Id,
                Fecha = ahora,
                Tipo = "critico",
                Mensaje = $"Crecimiento crítico detectado en {mqttMsg.RoiId}: Δ={mqttMsg.DeltaPercent:F1}% supera el umbral del {mqttMsg.ThresholdPercent:F1}%",
                UmbralSuperado = mqttMsg.ThresholdPercent.Value,
                ValorActual = mqttMsg.DeltaPercent.Value,
                Reconocida = false,
            };
            db.Alertas.Add(alerta);
            await db.SaveChangesAsync();

            _logger.LogWarning("Alerta crítica creada para {RoiId}: Δ={Delta}%",
                mqttMsg.RoiId, mqttMsg.DeltaPercent);
        }
    }

    /// <summary>
    /// Procesa un mensaje de telemetría del edge.
    /// Actualiza el estado RPi en caché (se sirve desde el health endpoint).
    /// </summary>
    private async Task HandleTelemetryMessage(string payload)
    {
        var telemetry = JsonSerializer.Deserialize<MqttTelemetryPayload>(payload, _jsonOptions);
        if (telemetry is null) return;

        // Actualizar último heartbeat del edge
        EdgeHeartbeatCache.Update(telemetry.DeviceId, telemetry);

        _logger.LogDebug("Telemetry from {Device}: FPS={Fps}, Cracks={Count}, Temp={Temp}°C",
            telemetry.DeviceId, telemetry.Fps, telemetry.CracksCount,
            telemetry.CpuTempC?.ToString("F1") ?? "N/A");
    }
}

/// <summary>
/// Caché en memoria del último heartbeat de cada edge device.
/// </summary>
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
            // Considerar conectado si el heartbeat tiene menos de 30 segundos
            var age = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - last.Timestamp;
            return age < 30;
        }
    }

    /// <summary>
    /// Retorna true si al menos un edge device está conectado.
    /// </summary>
    public static bool AnyConnected()
    {
        lock (_lock)
        {
            return _heartbeats.Values.Any(v =>
            {
                var age = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - v.Timestamp;
                return age < 30;
            });
        }
    }
}
