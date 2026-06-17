# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Build .NET Backend
# ─────────────────────────────────────────────────────────────────────────────
# Requisitos:
#   - .NET SDK 8.0+ instalado (dotnet --version)
#   - PostgreSQL 16+ corriendo en localhost:5432
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$ApiProject = Join-Path $ProjectDir "backend\src\ArgosSlope.Api\ArgosSlope.Api.csproj"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — Build .NET Backend" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check .NET SDK
try {
    $dotnetVersion = dotnet --version
    Write-Host "[✓] .NET SDK $dotnetVersion encontrado" -ForegroundColor Green
} catch {
    Write-Host "[✗] .NET SDK no encontrado. Instálelo desde:" -ForegroundColor Red
    Write-Host "    https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Red
    exit 1
}

# 2. Restore dependencies
Write-Host ""
Write-Host "[...] Restaurando dependencias..." -ForegroundColor Yellow
dotnet restore $ApiProject
if ($LASTEXITCODE -ne 0) {
    Write-Host "[✗] Error al restaurar dependencias" -ForegroundColor Red
    exit 1
}
Write-Host "[✓] Dependencias restauradas" -ForegroundColor Green

# 3. Build
Write-Host ""
Write-Host "[...] Compilando proyecto..." -ForegroundColor Yellow
dotnet build $ApiProject -c Release --no-restore
if ($LASTEXITCODE -ne 0) {
    Write-Host "[✗] Error de compilación" -ForegroundColor Red
    exit 1
}
Write-Host "[✓] Compilación exitosa" -ForegroundColor Green

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Build completado exitosamente" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para ejecutar:" -ForegroundColor White
Write-Host "  dotnet run --project $ApiProject" -ForegroundColor Gray
Write-Host ""
Write-Host "O usando PowerShell:" -ForegroundColor White
Write-Host "  .\scripts\run-dotnet.ps1" -ForegroundColor Gray
