# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Run .NET Backend (local development)
# ─────────────────────────────────────────────────────────────────────────────
# Requisitos:
#   - PostgreSQL 16+ corriendo en localhost:5432
#   - Base de datos 'mineriadb' creada
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$ApiProject = Join-Path $ProjectDir "backend\src\ArgosSlope.Api\ArgosSlope.Api.csproj"

# ── Configuración (sobreescribir con variables de entorno) ───────────
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ASPNETCORE_URLS = "http://localhost:8000"

# Database — usar DATABASE_URL si está definida, o default local
if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = "Host=localhost;Database=mineriadb;Username=postgres;Password=Jhunior"
}

# MQTT Broker — default a local mosquitto o HiveMQ Cloud
if (-not $env:MQTT_BROKER) {
    $env:MQTT_BROKER = "localhost"
    $env:MQTT_PORT = "1883"
    $env:MQTT_TLS_ENABLED = "false"
}

# Frontend CORS
if (-not $env:CORS_ORIGINS) {
    $env:CORS_ORIGINS = "http://localhost:3000"
}

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — Run .NET Backend" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  DATABASE_URL:  $($env:DATABASE_URL -replace 'Password=.*', 'Password=***')" -ForegroundColor Gray
Write-Host "  MQTT_BROKER:   $($env:MQTT_BROKER):$($env:MQTT_PORT)" -ForegroundColor Gray
Write-Host "  CORS_ORIGINS:  $($env:CORS_ORIGINS)" -ForegroundColor Gray
Write-Host "  ENVIRONMENT:   $($env:ASPNETCORE_ENVIRONMENT)" -ForegroundColor Gray
Write-Host "  PORT:          $($env:ASPNETCORE_URLS)" -ForegroundColor Gray
Write-Host ""

dotnet run --project $ApiProject
