<#
.SYNOPSIS
    ARGOS SLOPE 4.0 — Launch both backend (FastAPI) and frontend (Next.js).

.DESCRIPTION
    Starts uvicorn for the FastAPI backend and npm run dev for the Next.js
    frontend in background processes. PIDs are displayed. Press Ctrl+C to
    stop both.
#>

$rootDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   ARGOS SLOPE 4.0 — Iniciando servicios  ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── 1. Backend (FastAPI) ──────────────────────────────────────────────
Write-Host "[1/2] Iniciando backend FastAPI..." -ForegroundColor Yellow
$backendJob = Start-Job -Name "backend" -ScriptBlock {
    param($dir)
    Set-Location -LiteralPath $dir
    # Activate venv if present, otherwise rely on system Python
    $venv = Join-Path -Path $dir -ChildPath ".venv\Scripts\Activate.ps1"
    if (Test-Path -LiteralPath $venv) {
        & $venv
    }
    uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
} -ArgumentList $rootDir

$backendPid = $backendJob.Id
Write-Host "  → Backend iniciado (Job ID: $backendPid)" -ForegroundColor Green
Write-Host "  → http://localhost:8000" -ForegroundColor Green
Write-Host "  → http://localhost:8000/docs (Swagger)" -ForegroundColor Green
Write-Host ""

# ── 2. Frontend (Next.js) ────────────────────────────────────────────
Write-Host "[2/2] Iniciando frontend Next.js..." -ForegroundColor Yellow
$frontendJob = Start-Job -Name "frontend" -ScriptBlock {
    param($dir)
    $frontendDir = Join-Path -Path $dir -ChildPath "frontend"
    Set-Location -LiteralPath $frontendDir
    npm run dev
} -ArgumentList $rootDir

$frontendPid = $frontendJob.Id
Write-Host "  → Frontend iniciado (Job ID: $frontendPid)" -ForegroundColor Green
Write-Host "  → http://localhost:3000" -ForegroundColor Green
Write-Host ""

# ── PID info ──────────────────────────────────────────────────────────
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Backend Job ID  : $backendPid" -ForegroundColor Gray
Write-Host "  Frontend Job ID : $frontendPid" -ForegroundColor Gray
Write-Host "══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Presiona Ctrl+C para detener ambos servicios." -ForegroundColor DarkGray

# ── Wait for Ctrl+C ────────────────────────────────────────────────────
try {
    while ($true) {
        Start-Sleep -Seconds 1
        # Check if jobs are still running
        $bj = Get-Job -Name "backend" -ErrorAction SilentlyContinue
        $fj = Get-Job -Name "frontend" -ErrorAction SilentlyContinue
        if (-not $bj -and -not $fj) { break }
        if (-not $bj) { Write-Host "⚠ Backend terminó inesperadamente" -ForegroundColor Red }
        if (-not $fj) { Write-Host "⚠ Frontend terminó inesperadamente" -ForegroundColor Red }
    }
}
finally {
    Write-Host ""
    Write-Host "Deteniendo servicios..." -ForegroundColor Yellow
    Get-Job -Name "backend" -ErrorAction SilentlyContinue | Stop-Job
    Get-Job -Name "frontend" -ErrorAction SilentlyContinue | Stop-Job
    Get-Job -Name "backend" -ErrorAction SilentlyContinue | Remove-Job
    Get-Job -Name "frontend" -ErrorAction SilentlyContinue | Remove-Job
    Write-Host "✓ Servicios detenidos" -ForegroundColor Green
}
