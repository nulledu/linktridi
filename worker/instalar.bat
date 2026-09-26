@echo off
REM ============================================================================
REM  TridiMarket - INSTALADOR do worker de leitura de nota (Windows)
REM  Rode ESTE arquivo UMA vez. Ele instala o que falta, pergunta o endereco e
REM  o token, deixa tudo pronto e ja inicia. Depois disso e so o start.bat.
REM
REM  Usa Python 3.12 de proposito: o motor de OCR ainda NAO tem versao pro
REM  Python 3.13/3.14. Se o PC so tiver um Python novo, este instalador baixa o
REM  3.12 do lado (sem tirar o outro) e refaz o ambiente na versao certa.
REM ============================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
title TridiMarket - Instalar worker
color 0f

echo.
echo   ============================================================
echo     TridiMarket - Instalacao do worker de leitura de nota
echo   ============================================================
echo.

REM --- 1) Python COMPATIVEL (3.12 ou 3.11) -----------------------------------
set "PYEXE="
py -3.12 --version >nul 2>nul && set "PYEXE=py -3.12"
if not defined PYEXE ( py -3.11 --version >nul 2>nul && set "PYEXE=py -3.11" )
if defined PYEXE goto tem_python

echo   Nao achei Python 3.12/3.11. Vou instalar o 3.12 ^(o OCR nao roda no 3.13+^)...
where winget >nul 2>nul
if errorlevel 1 goto sem_winget
winget install -e --id Python.Python.3.12 --scope user --accept-source-agreements --accept-package-agreements
py -3.12 --version >nul 2>nul && set "PYEXE=py -3.12"
if defined PYEXE goto tem_python
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if defined PYEXE goto tem_python
echo.
echo   O Python 3.12 foi instalado, mas esta janela precisa reiniciar pra enxergar.
echo   FECHE esta janela e rode o instalar.bat DE NOVO. So isso.
echo.
pause
exit /b 0

:sem_winget
echo.
echo   [!] Nao achei o winget pra instalar sozinho.
echo   Instale o Python 3.12 manualmente em:
echo       https://www.python.org/downloads/release/python-3129/
echo   ^(marque "Add python.exe to PATH"^). Depois rode o instalar.bat de novo.
echo.
pause
exit /b 1

:tem_python
echo   Python compativel:
%PYEXE% --version
echo.

REM --- 2) Ambiente virtual (recria se estiver numa versao errada) ------------
if not exist ".venv\Scripts\python.exe" goto criar_venv
set "VVER="
for /f "tokens=2" %%v in ('".venv\Scripts\python.exe" --version 2^>^&1') do set "VVER=%%v"
echo(!VVER!| findstr /b "3.11. 3.12." >nul
if not errorlevel 1 goto venv_ok
echo   O ambiente estava no Python !VVER! ^(incompativel^). Refazendo...
rmdir /s /q ".venv"
:criar_venv
echo   Criando o ambiente...
%PYEXE% -m venv .venv
:venv_ok

REM --- 3) Dependencias -------------------------------------------------------
echo   Instalando dependencias ^(demora alguns minutos na primeira vez^)...
".venv\Scripts\python.exe" -m pip install --upgrade pip >nul 2>nul
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo   [!] Falha ao instalar as dependencias. Verifique a internet e rode de novo.
  echo.
  pause
  exit /b 1
)
echo ok> ".venv\.instalado"
echo.

REM --- 4) Configuracao (.env) ------------------------------------------------
if exist ".env" goto tem_env
echo   Agora a conexao com o sistema.
echo.
set "WURL="
set "WTOK="
set /p "WURL=  Endereco do sistema (ex: https://tridigaius.vercel.app): "
set /p "WTOK=  Token do worker (o MESMO configurado no servidor): "
>  ".env" echo WORKER_URL=!WURL!
>> ".env" echo WORKER_TOKEN=!WTOK!
>> ".env" echo POLL_SECONDS=5
echo   .env criado.
echo.
:tem_env

REM --- 5) Iniciar sozinho com o Windows (24h) --------------------------------
set "AUTO="
set /p "AUTO=  Iniciar sozinho quando o PC ligar? (S/N): "
if /i "!AUTO!"=="S" (
  powershell -NoProfile -Command "$w=New-Object -ComObject WScript.Shell; $l=$w.CreateShortcut([Environment]::GetFolderPath('Startup')+'\TridiMarket Worker.lnk'); $l.TargetPath='%~dp0start.bat'; $l.WorkingDirectory='%~dp0'; $l.Save()" >nul 2>nul
  echo   Pronto: vai subir sozinho no login do Windows.
)

echo.
echo   ============================================================
echo     Tudo pronto. Iniciando o worker...
echo   ============================================================
timeout /t 2 /nobreak >nul
call start.bat
