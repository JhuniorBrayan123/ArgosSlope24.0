# ─────────────────────────────────────────────────────────────────────────────
# ARGOS SLOPE 4.0 — Run Camera Calibration
# ─────────────────────────────────────────────────────────────────────────────
# Ejecuta la calibración completa de la cámara:
#   1. Calibración intrínseca con tablero de ajedrez
#   2. Detección de escala ArUco para px/mm
#   3. Guarda resultados en calibration.json
#
# Requisitos:
#   - Python 3.10+ con OpenCV
#   - Imágenes de calibración en edge/calibration/calib_images/
#   - (Opcional) Imagen con marcador ArUco
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$CalibrationDir = Join-Path $ProjectDir "edge\edge\calibration"
$CalibrationScript = Join-Path $ProjectDir "edge\edge\calibration\run_calibration.py"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — Camera Calibration" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificar que existe el script de calibración ─────────────────────
if (-not (Test-Path -LiteralPath $CalibrationScript)) {
    Write-Host "[✗] Script de calibración no encontrado:" -ForegroundColor Red
    Write-Host "    $CalibrationScript" -ForegroundColor Red
    Write-Host "    Asegúrese de que el script run_calibration.py existe." -ForegroundColor Red
    exit 1
}

# ── Verificar imágenes de calibración ─────────────────────────────────
$CalibImages = Join-Path $CalibrationDir "calib_images"
if (-not (Test-Path -LiteralPath $CalibImages)) {
    Write-Host "[!] No se encontró el directorio calib_images/" -ForegroundColor Yellow
    Write-Host "    Creando directorio... Por favor, agregue imágenes de tablero de ajedrez." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $CalibImages -Force | Out-Null
}

$imageCount = @(Get-ChildItem -LiteralPath $CalibImages -Include "*.jpg","*.jpeg","*.png","*.bmp" -Recurse -ErrorAction SilentlyContinue).Count
Write-Host "  Imágenes de calibración: $imageCount (en $CalibImages)" -ForegroundColor Gray
Write-Host ""

# ── Preguntar modo de calibración ─────────────────────────────────────
Write-Host "Seleccione modo de calibración:" -ForegroundColor White
Write-Host "  1. Completa (intrínsecos + escala ArUco)" -ForegroundColor Gray
Write-Host "  2. Solo escala ArUco (si ya tiene intrínsecos)" -ForegroundColor Gray
Write-Host "  3. Ver estado actual de calibración" -ForegroundColor Gray
$mode = Read-Host "Modo [1-3] (default: 1)"
if (-not $mode) { $mode = "1" }

Write-Host ""

switch ($mode) {
    "1" {
        $arucoImage = Read-Host "Ruta de imagen ArUco (Enter para omitir)"
        $arucoArg = if ($arucoImage) { "-aruco $arucoImage" } else { "" }

        Write-Host "[...] Ejecutando calibración completa..." -ForegroundColor Yellow
        python $CalibrationScript -dir $CalibImages $arucoArg
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[✓] Calibración completada exitosamente" -ForegroundColor Green
        } else {
            Write-Host "[✗] Error en calibración (código: $LASTEXITCODE)" -ForegroundColor Red
        }
    }
    "2" {
        $arucoImage = Read-Host "Ruta de imagen ArUco (requerido)"
        if (-not $arucoImage) {
            Write-Host "[✗] Se requiere una imagen ArUco" -ForegroundColor Red
            exit 1
        }
        Write-Host "[...] Detectando solo escala ArUco..." -ForegroundColor Yellow
        python $CalibrationScript -aruco $arucoImage --scale-only
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[✓] Escala detectada exitosamente" -ForegroundColor Green
        } else {
            Write-Host "[✗] Error en detección de escala" -ForegroundColor Red
        }
    }
    "3" {
        Write-Host "[...] Verificando estado de calibración..." -ForegroundColor Yellow
        python $CalibrationScript --status
    }
}

Write-Host ""
Write-Host "Archivo de calibración: $CalibrationDir\calibration.json" -ForegroundColor Gray
Write-Host ""
Write-Host "Después de calibrar, reinicie el Edge para que cargue los nuevos parámetros." -ForegroundColor Yellow
