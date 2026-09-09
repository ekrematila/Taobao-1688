@echo off
rem Keeps the Taobao Product Studio dev server (api :8787 + web :5173) running.
rem Double-click this file, or run it from a terminal, and leave the window open.
rem It relaunches the server automatically if it ever crashes or exits.
rem Close the window (or press Ctrl+C twice) to stop.

title taobao-product-studio dev server
cd /d "%~dp0"

:loop
echo.
echo ============================================================
echo  starting dev server  -  %date% %time%
echo ============================================================
call npm run dev
echo.
echo ------------------------------------------------------------
echo  dev server exited (code %errorlevel%) - restarting in 3s
echo  press Ctrl+C now to stop for good
echo ------------------------------------------------------------
timeout /t 3 /nobreak >nul
goto loop
