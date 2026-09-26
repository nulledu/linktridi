@echo off
REM ============================================================================
REM  TridiMarket - Worker de leitura de nota (Windows)
REM  Este arquivo so RODA o worker. Na primeira vez, rode o instalar.bat.
REM  Ele se reinicia sozinho se cair. Feche a janela para encerrar.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
title TridiMarket - Worker

if not exist ".venv\Scripts\python.exe" goto falta_instalar
if not exist ".env" goto falta_instalar

REM --- Carrega o .env ---------------------------------------------------------
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "linha=%%a"
  if not "!linha:~0,1!"=="#" if not "%%a"=="" set "%%a=%%b"
)

REM --- Roda (reinicia sozinho se cair) ---------------------------------------
:loop
echo Iniciando o worker...
".venv\Scripts\python.exe" worker.py
echo.
echo Worker parou. Reiniciando em 10s...  (feche a janela para encerrar)
timeout /t 10 /nobreak >nul
goto loop

:falta_instalar
echo.
echo   Ainda nao configurado. Rode o  instalar.bat  primeiro (uma vez so).
echo.
pause
exit /b 1
