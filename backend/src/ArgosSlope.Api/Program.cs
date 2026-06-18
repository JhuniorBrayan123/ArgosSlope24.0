using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Host=localhost;Database=mineriadb;Username=postgres;Password=postgres";

var mqttBroker = Environment.GetEnvironmentVariable("MQTT_BROKER") ?? "localhost";
var corsOrigins = (Environment.GetEnvironmentVariable("CORS_ORIGINS") ?? "http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

// ── Database ───────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// ── Repositories ───────────────────────────────────────────────────
builder.Services.AddScoped<IFisuraRepository, FisuraRepository>();
builder.Services.AddScoped<ISnapshotRepository, SnapshotRepository>();

// ── Risk Engine ────────────────────────────────────────────────────
builder.Services.AddScoped<IRiskEngine, RiskEngine>();

// ── File & Consolidation Services ──────────────────────────────────
builder.Services.AddSingleton<IFileStorageService, LocalFileStorageService>();
builder.Services.AddScoped<ICrackConsolidationService, CrackConsolidationService>();

// Geomechanics Services
builder.Services.AddScoped<RmrCatalogService>();
builder.Services.AddScoped<RqdCalculationService>();
builder.Services.AddScoped<RmrCalculationService>();
builder.Services.AddScoped<GeomechanicalEvaluationService>();

// ── Geotechnical Services (migrated from archived/) ────────────────
builder.Services.AddScoped<IGeotechnicalServices, GeotechnicalServices>();

// ── Auth Services ──────────────────────────────────────────────────
builder.Services.AddScoped<IAuthService, AuthService>();

// ── Auth & JWT ─────────────────────────────────────────────────────
var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "super-secret-key-for-development-only-argos-slope";
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "argos-slope",
        ValidAudience = builder.Configuration["Jwt:Audience"] ?? "argos-frontend",
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ClockSkew = TimeSpan.Zero
    };
});
builder.Services.AddAuthorization();

// ── Background Services & MQTT ───────────────────────────────────────
builder.Services.AddSingleton<MQTTnet.Client.IMqttClient>(sp =>
{
    var factory = new MQTTnet.MqttFactory();
    return factory.CreateMqttClient();
});
builder.Services.AddHostedService<MqttSubscriberHostedService>();

// ── Controllers ────────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    });

// ── Swagger ────────────────────────────────────────────────────────
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

// ── CORS ───────────────────────────────────────────────────────────
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

app.Urls.Add("http://localhost:5001");

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseStaticFiles(); // Agregado para servir archivos estáticos desde wwwroot (o webroot si está configurado)
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// ── Database Initialization ─────────────────────────────────────────
// Apply pending migrations OR create schema if no migrations exist.
// This runs on every startup — safe for development.
try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    // Try migrations first; fall back to EnsureCreated if no migrations exist
    var pendingMigrations = await db.Database.GetPendingMigrationsAsync();
    if (pendingMigrations.Any())
    {
        await db.Database.MigrateAsync();
        app.Logger.LogInformation("Applied {Count} pending database migrations.", pendingMigrations.Count());
    }
    else
    {
        await db.Database.EnsureCreatedAsync();
        app.Logger.LogInformation("Database schema ensured (no pending migrations).");
    }

    // Seed initial config if table is empty
    if (!await db.Configuraciones.AnyAsync())
    {
        db.Configuraciones.AddRange(
            new() { Clave = "umbral_ancho", Valor = "0.3", Descripcion = "Ancho mínimo para alerta (mm)" },
            new() { Clave = "umbral_crecimiento_pct", Valor = "5.0", Descripcion = "Crecimiento porcentual para alerta" },
            new() { Clave = "umbral_velocidad_mm_dia", Valor = "0.5", Descripcion = "Velocidad mínima para alerta (mm/día)" },
            new() { Clave = "demo_mode", Valor = "true", Descripcion = "Modo demo con datos simulados" },
            new() { Clave = "calibrada", Valor = "false", Descripcion = "Indica si la cámara está calibrada" }
        );
        await db.SaveChangesAsync();
        app.Logger.LogInformation("Database seeded with default configuration.");
    }
}
catch (Exception ex)
{
    app.Logger.LogWarning("Database initialization skipped: {Ex}", ex.Message);
    app.Logger.LogWarning("The API will start but database-dependent endpoints may fail.");
}

app.Logger.LogInformation("┌─────────────────────────────────────────────────┐");
app.Logger.LogInformation("│ ARGOS SLOPE 4.0 — .NET Backend                │");
app.Logger.LogInformation("├─────────────────────────────────────────────────┤");
app.Logger.LogInformation("│ MQTT broker: {Broker}", mqttBroker);
app.Logger.LogInformation("│ Database:    {Db}", connectionString.Replace("Password=", "Password=***"));
app.Logger.LogInformation("│ CORS:        {Origins}", string.Join(", ", corsOrigins));
app.Logger.LogInformation("│ Swagger:     /swagger                         │");
app.Logger.LogInformation("│ API root:    /                                │");
app.Logger.LogInformation("└─────────────────────────────────────────────────┘");

await app.RunAsync();
