# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Run Edge (cámara + MQTT + 3D)
# ─────────────────────────────────────────────────────────────────────────────
# Lee variables desde ArgosSlope4.0/.env (vía python-dotenv en config.py)
#
# Uso:
#   .\scripts\run-edge.ps1
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$EdgeDir = Join-Path $ProjectDir "edge"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — Edge Processing" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Directorio: $EdgeDir" -ForegroundColor Gray
Write-Host "  Config:     $ProjectDir\.env" -ForegroundColor Gray
Write-Host ""
Write-Host "  Esperá en logs:" -ForegroundColor Yellow
Write-Host "    MQTT connected (rc=0)" -ForegroundColor Gray
Write-Host "    Snapshot3D published: mesh=... texture=yes" -ForegroundColor Gray
Write-Host ""

Set-Location $EdgeDir
python -m edge.main
