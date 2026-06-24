@echo off
:: ============================================================================
::  ARGOS SLOPE 4.0 — Deploy RPi Streamer
:: ============================================================================
::  Sube los archivos del streamer a la Raspberry Pi y configura todo.
::
::  Uso:
::    deploy-rpi.bat                     Te pide la contraseña
::    deploy-rpi.bat Jhunior123          Usa esa contraseña
::    deploy-rpi.bat --wifi              También configura WiFi dual
::    deploy-rpi.bat --wifi Jhunior123   WiFi + contraseña explícita
:: ============================================================================

setlocal enabledelayedexpansion
title ARGOS SLOPE 4.0 — Deploy RPi

:: ── Configuración ──────────────────────────────────────────────────────────
set "RPI_USER=jhunior"
set "RPI_HOST=192.168.1.7"
set "LOCAL_DIR=%~dp0edge\rpi-streamer"
set "REMOTE_DIR=/home/%RPI_USER%/rpi-streamer"
set "RPI=%RPI_USER%@%RPI_HOST%"

:: ── Parsear argumentos ─────────────────────────────────────────────────────
set "SETUP_WIFI="
set "PASSWORD="

:parse_args
if "%1"=="" goto :args_done
if /I "%1"=="--wifi" (
    set "SETUP_WIFI=1"
    shift
    goto :parse_args
)
if "%PASSWORD%"=="" (
    set "PASSWORD=%1"
    shift
    goto :parse_args
)
shift
goto :parse_args
:args_done

:: ── Pedir contraseña si no se pasó ─────────────────────────────────────────
if "%PASSWORD%"=="" (
    echo.
    echo  ==========================================
    echo    ARGOS SLOPE — Despliegue a RPi
    echo  ==========================================
    echo.
    set /p "PASSWORD=Contrasena del RPi (%RPI%): "
)
if "%PASSWORD%"=="" (
    echo [ERROR] No se ingreso contrasena.
    exit /b 1
)

:: ── Bienvenida ─────────────────────────────────────────────────────────────
echo.
echo  ==========================================
echo    ARGOS SLOPE 4.0 — Deploy RPi Streamer
echo  ==========================================
echo.
echo  RPi:       %RPI%
echo  Archivos:  %LOCAL_DIR%
echo  WiFi:      %SETUP_WIFI:1=Si%
echo.

:: ── Paso 1: Verificar conectividad ─────────────────────────────────────────
echo  [1/4] Verificando conectividad con %RPI_HOST%...
ping -n 1 -w 3000 %RPI_HOST% >nul 2>&1
if errorlevel 1 (
    echo  [!] No se puede alcanzar %RPI_HOST%.
    echo      Asegurate de que el RPi esta encendido y en la misma red.
    exit /b 1
)
echo  [OK] %RPI_HOST% responde

:: ── Paso 2: Buscar sshpass o instalarlo ────────────────────────────────────
echo.
echo  [2/4] Preparando autenticacion...

where sshpass >nul 2>&1
if %errorlevel%==0 (
    set "USE_SSHPASS=1"
    echo  [OK] sshpass encontrado
    goto :upload_files
)

:: Intentar descargar sshpass automaticamente
echo  [!] sshpass no instalado. Intentando descargar...
set "SSHPASS_URL=https://github.com/xhcoding/sshpass-win64/releases/download/v1.0/sshpass.exe"
set "SSHPASS_PATH=%~dp0sshpass.exe"

powershell -Command "& {Try {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%SSHPASS_URL%' -OutFile '%SSHPASS_PATH%' -ErrorAction Stop; Write-Host 'Descargado'} Catch {Write-Host 'Falló'}}" 2>nul | findstr "Descargado" >nul

if %errorlevel%==0 (
    echo  [OK] sshpass descargado a %~dp0sshpass.exe
    set "USE_SSHPASS=1"
) else (
    echo  [!] No se pudo descargar sshpass automaticamente.
    echo.
    echo  Para subir archivos, ejecuta MANUALMENTE en otra terminal:
    echo.
    echo    ssh %RPI% "mkdir -p %REMOTE_DIR%"
    echo    scp -r "%LOCAL_DIR%\*" %RPI%:%REMOTE_DIR%/
    echo.
    echo  (Te va a pedir la contrasena: %PASSWORD%)
    echo.
    echo  Despues, conectate al RPi y ejecuta:
    echo.
    echo    cd ~/rpi-streamer ^&^& chmod +x install.sh ^&^& sudo ./install.sh
    echo.
    echo  Presiona cualquier tecla para continuar con las instrucciones...
    pause >nul
    goto :skip_upload
)

:: ── Paso 3: Subir archivos ─────────────────────────────────────────────────
:upload_files
echo.
echo  [3/4] Subiendo archivos a %RPI_HOST%...

sshpass -p "%PASSWORD%" ssh -o StrictHostKeyChecking=no %RPI% "mkdir -p %REMOTE_DIR%"
if errorlevel 1 (
    echo  [ERROR] No se pudo crear directorio remoto. Revisa la contrasena.
    exit /b 1
)
echo  [OK] Directorio remoto creado

for %%f in ("%LOCAL_DIR%\*") do (
    echo    Subiendo %%~nxf...
    sshpass -p "%PASSWORD%" scp -o StrictHostKeyChecking=no "%%f" %RPI%:%REMOTE_DIR%/ >nul 2>&1
    if errorlevel 1 (
        echo    [ERROR] Fallo %%~nxf
    ) else (
        echo    [OK] %%~nxf
    )
)

echo  [OK] Archivos subidos

:: ── Paso 4: Instalar servicio ──────────────────────────────────────────────
echo.
echo  [4/4] Instalando servicio systemd en el RPi...

sshpass -p "%PASSWORD%" ssh -o StrictHostKeyChecking=no %RPI% ^
    "chmod +x %REMOTE_DIR%/install.sh && sudo %REMOTE_DIR%/install.sh --usb" 2>&1 | findstr /V "password"

if errorlevel 1 (
    echo  [!] La instalacion automatica fallo (tal vez la camara no esta conectada).
    echo      No te preocupes — podes correrla despues manualmente:
    echo        ssh %RPI%
    echo        cd ~/rpi-streamer ^&^& sudo ./install.sh
) else (
    echo  [OK] Servicio instalado
)

:skip_upload

:: ── WiFi dual (opcional) ───────────────────────────────────────────────────
if "%SETUP_WIFI%"=="1" (
    echo.
    echo  ==========================================
    echo    Configuracion WiFi Dual
    echo  ==========================================
    echo.
    echo  El RPi se conectara automaticamente a cualquiera
    echo  de las dos redes, segun cual este disponible.
    echo.

    :: Si no tenemos sshpass, no podemos continuar con WiFi
    if not "%USE_SSHPASS%"=="1" (
        echo  [!] Se necesita sshpass para configurar WiFi automaticamente.
        echo      Cuando te conectes al RPi, ejecuta:
        echo.
        echo    sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
        echo.
        echo  Y agrega ambas redes como se explica en WIFI-PLAN.md
        goto :finish
    )

    set /p "WIFI_SSID1=SSID de la Red 1 (casa): "
    if "%WIFI_SSID1%"=="" (
        echo  [!] SSID obligatorio. Saltando configuracion WiFi.
        goto :finish
    )
    set /p "WIFI_PASS1=Password de la Red 1: "
    set /p "WIFI_SSID2=SSID de la Red 2 (instituto / hotspot): "
    if "%WIFI_SSID2%"=="" (
        echo  [!] SSID obligatorio. Saltando configuracion WiFi.
        goto :finish
    )
    set /p "WIFI_PASS2=Password de la Red 2: "

    echo.
    echo  Configurando WiFi dual en el RPi...
    echo  (Usando setup-wifi.sh del proyecto)

    :: Subir y ejecutar el script setup-wifi.sh (ya existe en el proyecto)
    :: NOTA: setup-wifi.sh es interactivo — te va a pedir SSID/pass en el RPi
    sshpass -p "%PASSWORD%" scp -o StrictHostKeyChecking=no "%~dp0edge\rpi-streamer\setup-wifi.sh" %RPI%:%REMOTE_DIR%/setup-wifi.sh >nul
    sshpass -p "%PASSWORD%" ssh -o StrictHostKeyChecking=no -tt %RPI% "chmod +x %REMOTE_DIR%/setup-wifi.sh && sudo %REMOTE_DIR%/setup-wifi.sh"

    if errorlevel 1 (
        echo  [!] Error configurando WiFi. Revisa los datos ingresados.
    ) else (
        echo  [OK] WiFi dual configurado.
    )
)

:: ── Resumen final ──────────────────────────────────────────────────────────
:finish
echo.
echo  ==========================================
echo    LISTO — Resumen
echo  ==========================================
echo.
echo  Archivos subidos: %REMOTE_DIR%/
echo    - stream.py              Servidor MJPEG
echo    - requirements-rpi.txt   Dependencias Python
echo    - rpi-streamer.service   Servicio systemd (auto-start)
echo    - install.sh             Script de instalacion (correr en RPi)
echo    - setup-wifi.sh          Script WiFi dual (correr en RPi)
echo    - WIFI-PLAN.md           Plan de contingencia WiFi
echo.
echo  Para CONECTARSE al RPi:
echo    ssh %RPI%
echo    (Contrasena: %PASSWORD%)
echo.
echo  Para INICIAR el streamer manualmente:
echo    ssh %RPI% "cd rpi-streamer ^&^& python3 stream.py"
echo    (agregar --usb si es camara USB)
echo.
echo  Para VER logs del servicio:
echo    ssh %RPI% "journalctl -u rpi-streamer -f"
echo.
echo  Stream URL (una vez corriendo):
echo    http://%RPI_HOST%:5000/stream
echo.
echo  ==========================================
echo.
pause
