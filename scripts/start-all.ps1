# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Start All Services (Docker-based)
# ─────────────────────────────────────────────────────────────────────────────
# Requisitos:
#   - Docker Desktop instalado y en ejecución
#   - .NET SDK 8.0+ (si se ejecuta sin Docker)
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — Start All Services" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificar Docker ─────────────────────────────────────────────────
try {
    $dockerVersion = docker --version
    Write-Host "[✓] Docker: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "[✗] Docker no encontrado" -ForegroundColor Red
    Write-Host "    Instale Docker Desktop desde: https://www.docker.com/products/docker-desktop/" -ForegroundColor Red
    exit 1
}

# ── Iniciar servicios core (PostgreSQL + Mosquitto + .NET Backend) ──
Write-Host ""
Write-Host "[...] Iniciando servicios core..." -ForegroundColor Yellow
Set-Location -LiteralPath $ProjectDir
docker compose up -d postgres mosquitto backend-dotnet 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[✗] Error al iniciar servicios Docker" -ForegroundColor Red
    exit 1
}
Write-Host "[✓] Servicios core iniciados" -ForegroundColor Green

# ── Esperar a que PostgreSQL esté listo ──────────────────────────────
Write-Host ""
Write-Host "[...] Esperando que PostgreSQL esté listo..." -ForegroundColor Yellow
$maxRetries = 30
$retryCount = 0
do {
    Start-Sleep -Seconds 2
    $ready = docker compose exec postgres pg_isready -U postgres 2>$null
    $retryCount++
} while ($LASTEXITCODE -ne 0 -and $retryCount -lt $maxRetries)

if ($retryCount -ge $maxRetries) {
    Write-Host "[✗] PostgreSQL no respondió después de $maxRetries intentos" -ForegroundColor Red
    exit 1
}
Write-Host "[✓] PostgreSQL listo" -ForegroundColor Green

# ── Verificar backend .NET ───────────────────────────────────────────
Write-Host ""
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/api/health" -UseBasicParsing -TimeoutSec 5
    Write-Host "[✓] Backend .NET responde en http://localhost:8000" -ForegroundColor Green
    Write-Host "    Status: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "[!] Backend .NET aún iniciando... Verifique con:" -ForegroundColor Yellow
    Write-Host "    docker compose logs -f backend-dotnet" -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Servicios disponibles:" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  PostgreSQL:  localhost:5432 (mineriadb)" -ForegroundColor White
Write-Host "  Mosquitto:   localhost:1883" -ForegroundColor White
Write-Host "  Backend API: http://localhost:8000" -ForegroundColor White
Write-Host "  Swagger UI:  http://localhost:8000/swagger" -ForegroundColor White
Write-Host "  Frontend:    http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Para ver logs:" -ForegroundColor Yellow
Write-Host "  docker compose logs -f" -ForegroundColor Gray
Write-Host ""
Write-Host "Para detener:" -ForegroundColor Yellow
Write-Host "  docker compose down" -ForegroundColor Gray
