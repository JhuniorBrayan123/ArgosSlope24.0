<#
.SYNOPSIS
    ARGOS SLOPE 4.0 — Inicio rápido (Windows / PowerShell)

.DESCRIPTION
    Inicia el backend (FastAPI) y el frontend (Next.js) simultáneamente.
    Requiere PowerShell 5.1+.

    Requisitos:
      - Python 3.10+ con dependencias instaladas (pip install -r backend/requirements.txt)
      - Node.js 18+ con dependencias instaladas (npm install)
      - PostgreSQL 14+ corriendo en localhost:5432

.EXAMPLE
    .\scripts\start.ps1
#>

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ARGOS SLOPE 4.0 — Iniciando servicios..." -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# ── 1. Backend (FastAPI en puerto 8000) ────────────────────────────
Write-Host "`n[1/2] Iniciando backend (FastAPI) en http://localhost:8000 ..." -ForegroundColor Yellow

$BackendJob = Start-Job -ScriptBlock {
    param($Dir, $RootDir)
    # Cargar .env si existe
    $envFile = Join-Path $RootDir ".env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match "^\s*([^#=]+)=(.+)\s*$") {
                [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim())
            }
        }
    }
    Set-Location $Dir
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
} -ArgumentList (Join-Path $ROOT_DIR "backend"), $ROOT_DIR

Write-Host "  → Backend iniciado en segundo plano (Job ID: $($BackendJob.Id))" -ForegroundColor Gray

# ── 2. Frontend (Next.js en puerto 3000) ───────────────────────────
Write-Host "`n[2/2] Iniciando frontend (Next.js) en http://localhost:3000 ..." -ForegroundColor Yellow

$FrontendJob = Start-Job -ScriptBlock {
    param($Dir)
    Set-Location $Dir
    npm run dev
} -ArgumentList $ROOT_DIR

Write-Host "  → Frontend iniciado en segundo plano (Job ID: $($FrontendJob.Id))" -ForegroundColor Gray

Write-Host "`n═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Servicios iniciados:" -ForegroundColor Cyan
Write-Host "    • Backend:  http://localhost:8000" -ForegroundColor White
Write-Host "    • Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "    • API Docs: http://localhost:8000/docs" -ForegroundColor White
Write-Host "`n  Para detener:" -ForegroundColor Cyan
Write-Host "    Stop-Job $($BackendJob.Id); Stop-Job $($FrontendJob.Id); Remove-Job $($BackendJob.Id), $($FrontendJob.Id)" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Mantener el script en ejecución y mostrar output de los jobs
Write-Host "`nMostrando output de los servicios (Ctrl+C para detener)..." -ForegroundColor Gray

while ($BackendJob.State -eq "Running" -or $FrontendJob.State -eq "Running") {
    Receive-Job $BackendJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[Backend] $_" -ForegroundColor Green }
    Receive-Job $FrontendJob -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[Frontend] $_" -ForegroundColor Blue }
    Start-Sleep -Milliseconds 500
}
