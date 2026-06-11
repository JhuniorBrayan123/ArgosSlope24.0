using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// ── Configuración ───────────────────────────────────────────────────
// Las variables de entorno .env se cargan manualmente o via dotnet run
// con dotnet-user-secrets en desarrollo.

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Database=mineriadb;Username=postgres;Password=postgres";

var mqttBroker = Environment.GetEnvironmentVariable("MQTT_BROKER") ?? "localhost";
var corsOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

// ── Services ────────────────────────────────────────────────────────

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddScoped<IFisuraRepository, FisuraRepository>();

// MQTT background subscriber
builder.Services.AddHostedService<MqttSubscriberHostedService>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        // Snake_case para compatibilidad con el frontend existente
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new()
    {
        Title = "ARGOS SLOPE 4.0 — .NET Backend API",
        Version = "v1",
        Description = "Backend API for mining slope deformation monitoring. " +
                      "Receives crack telemetry from edge devices via MQTT.",
    });
});

// CORS — compatible con el frontend Next.js
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(corsOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// ── Middleware ──────────────────────────────────────────────────────

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.MapControllers();

// ── Auto-migrate (development convenience) ─────────────────────────
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        await db.Database.EnsureCreatedAsync();
        app.Logger.LogInformation("Database schema ensured.");
    }
    catch (Exception ex)
    {
        app.Logger.LogWarning("Database unavailable: {Ex}", ex.Message);
    }
}

app.Logger.LogInformation("ARGOS SLOPE 4.0 .NET Backend starting...");
app.Logger.LogInformation("  MQTT broker: {Broker}", mqttBroker);
app.Logger.LogInformation("  Database: {Db}", connectionString.Replace("Password=", "Password=***"));
app.Logger.LogInformation("  CORS origins: {Origins}", string.Join(", ", corsOrigins));

await app.RunAsync();
