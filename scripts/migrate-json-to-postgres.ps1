# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Migrate crack_history.json → PostgreSQL
# ─────────────────────────────────────────────────────────────────────────────
# Lee el archivo crack_history.json del backend FastAPI y lo inserta en
# PostgreSQL usando el backend .NET API.
#
# Requisitos:
#   - Backend .NET corriendo en http://localhost:8000
#   - PostgreSQL con tablas creadas (database/init.sql)
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$JsonFile = Join-Path $ProjectDir "backend\crack_history.json"
$ApiBase = "http://localhost:8000"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — JSON → PostgreSQL" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificar que el archivo JSON existe ─────────────────────────────
if (-not (Test-Path -LiteralPath $JsonFile)) {
    Write-Host "[!] No se encontró crack_history.json en:" -ForegroundColor Yellow
    Write-Host "    $JsonFile" -ForegroundColor Yellow
    Write-Host "    No hay datos que migrar. Continuando..." -ForegroundColor Yellow
    exit 0
}

Write-Host "[...] Leyendo $JsonFile ..." -ForegroundColor Yellow
$jsonContent = Get-Content -LiteralPath $JsonFile -Raw -Encoding UTF8
if (-not $jsonContent -or $jsonContent.Trim() -eq "") {
    Write-Host "[!] crack_history.json está vacío. No hay datos que migrar." -ForegroundColor Yellow
    exit 0
}

$crackHistory = try {
    $jsonContent | ConvertFrom-Json
} catch {
    Write-Host "[!] Error al parsear JSON. Puede estar corrupto o vacío." -ForegroundColor Yellow
    Write-Host "    Error: $_" -ForegroundColor Gray
    exit 0
}

# Si es un array, procesar cada entrada
$entries = if ($crackHistory -is [array]) { $crackHistory } else { @($crackHistory) }
$total = $entries.Count
$migrated = 0
$errors = 0

Write-Host "[...] Migrando $total entradas..." -ForegroundColor Yellow
Write-Host ""

foreach ($entry in $entries) {
    $roiId = $entry.track_id -or $entry.roi_id -or $entry.id
    if (-not $roiId) { $roiId = "migrated-$([System.Guid]::NewGuid().ToString().Substring(0,8))" }

    $largoMm = [double]($entry.largo_mm -or $entry.length_mm -or 0)
    $anchoMm = [double]($entry.ancho_mm -or $entry.width_mm -or 0)
    $areaMm2 = [double]($entry.area_mm2 -or 0)
    $tipo = $entry.clasificacion -or $entry.classification -or "fina"
    $orientacion = $entry.orientacion -or $entry.orientation -or "0°"
    $coords = $entry.coordenadas -or ""

    $payload = @{
        roi_id = $roiId
        largo_mm = $largoMm
        ancho_mm = $anchoMm
        area_mm2 = $areaMm2
        tipo = $tipo
        orientacion = $orientacion
        coordenadas = $coords
    } | ConvertTo-Json -Compress

    try {
        $response = Invoke-RestMethod -Uri "$ApiBase/api/fisuras" `
            -Method Post `
            -Body $payload `
            -ContentType "application/json" `
            -TimeoutSec 10

        # Si tiene mediciones hijas, crearlas
        $mediciones = $entry.mediciones -or $entry.mediciones_diarias
        if ($mediciones -and $response -and $response.id) {
            foreach ($med in @($mediciones)) {
                $medPayload = @{
                    largo_mm = [double]($med.largo_mm -or 0)
                    ancho_mm = [double]($med.ancho_mm -or 0)
                    area_mm2 = [double]($med.area_mm2 -or 0)
                } | ConvertTo-Json -Compress

                Invoke-RestMethod -Uri "$ApiBase/api/fisuras/$($response.id)/mediciones" `
                    -Method Post `
                    -Body $medPayload `
                    -ContentType "application/json" `
                    -TimeoutSec 5 -ErrorAction SilentlyContinue
            }
        }

        $migrated++
        Write-Host "  [✓] $roiId → OK (ID=$($response.id))" -ForegroundColor Green
    } catch {
        $errors++
        $statusCode = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "N/A" }
        if ($statusCode -eq 409) {
            Write-Host "  [!] $roiId → ya existe (saltando)" -ForegroundColor Yellow
            $migrated++
        } else {
            Write-Host "  [✗] $roiId → Error HTTP $statusCode" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Migración completada" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Total entradas:   $total" -ForegroundColor White
Write-Host "  Migradas:         $migrated" -ForegroundColor Green
Write-Host "  Errores:          $errors" -ForegroundColor $(if ($errors -gt 0) { "Red" } else { "Green" })
Write-Host ""

if ($errors -gt 0) {
    Write-Host "Revise los errores arriba. Puede reintentar ejecutando de nuevo." -ForegroundColor Yellow
}
