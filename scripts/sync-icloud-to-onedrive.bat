@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM CValRSketch — iCloud Drive  to  OneDrive  scheduled mirror (Windows)
REM ----------------------------------------------------------------------------
REM What it does
REM   Creates a Windows Scheduled Task that every N minutes copies a folder
REM   from your local iCloud Drive into your OneDrive folder. iCloud Drive
REM   syncs from your iPhone, and OneDrive then uploads from your PC, so an
REM   iPhone Save lands in OneDrive a few minutes later with no thought.
REM
REM Defaults (edit at the top of this file before running)
REM   Source:   %%USERPROFILE%%\iCloudDrive\Sketches
REM   Dest:     %%USERPROFILE%%\OneDrive\Sketches
REM   Interval: every 5 minutes
REM   Mode:     additive (new + changed files only; never deletes from dest)
REM
REM Usage
REM   Install:   double-click this .bat   (right-click and Run as administrator
REM              is safer because Task Scheduler sometimes needs elevation)
REM   Uninstall: run from a command prompt with the /uninstall switch:
REM              sync-icloud-to-onedrive.bat /uninstall
REM   Run now:   schtasks /Run /TN "CValRSketch-Sync-iCloud-to-OneDrive"
REM   See log:   type "%%LOCALAPPDATA%%\CValRSketch\sync.log"
REM
REM Switch to a true two-way mirror (deletes from dest if removed from source)
REM   Change   set ROBOFLAGS=/E /XO /R:1 /W:1
REM   to       set ROBOFLAGS=/MIR /R:1 /W:1
REM ============================================================================

REM ------------------------ EDIT THESE IF YOU LIKE ------------------------
set TASKNAME=CValRSketch-Sync-iCloud-to-OneDrive
set SRC=%USERPROFILE%\iCloudDrive\Sketches
set DST=%USERPROFILE%\OneDrive\Sketches
set INTERVAL=5
set ROBOFLAGS=/E /XO /R:1 /W:1
REM -----------------------------------------------------------------------

set LOGDIR=%LOCALAPPDATA%\CValRSketch
set LOG=%LOGDIR%\sync.log

if /I "%~1"=="/uninstall" goto uninstall
if /I "%~1"=="/u"         goto uninstall

echo.
echo ============================================================
echo  CValRSketch  ^|  iCloud  to  OneDrive  scheduled sync
echo ============================================================
echo.
echo   Source:   %SRC%
echo   Dest:     %DST%
echo   Interval: every %INTERVAL% minute(s^)
echo   Mode:     %ROBOFLAGS%
echo   Log:      %LOG%
echo.

REM Make sure the folders exist so robocopy doesn't fail silently
if not exist "%SRC%" (
  echo Creating source folder: %SRC%
  mkdir "%SRC%" 2>nul
  if errorlevel 1 (
    echo   ^!^! Could not create %SRC% — is iCloud for Windows installed and signed in?
    echo      Install iCloud for Windows from the Microsoft Store, sign in, wait for
    echo      iCloudDrive to appear in your user folder, then re-run this script.
    pause
    exit /b 1
  )
)
if not exist "%DST%" (
  echo Creating dest folder:   %DST%
  mkdir "%DST%" 2>nul
)
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

REM Build the command the scheduled task will run on each tick
set CMD=robocopy "%SRC%" "%DST%" %ROBOFLAGS% /LOG+:"%LOG%" /NP /NDL

REM Remove any pre-existing task with this name (idempotent reinstall)
schtasks /Query /TN "%TASKNAME%" >nul 2>&1
if not errorlevel 1 (
  echo Removing existing task with the same name...
  schtasks /Delete /TN "%TASKNAME%" /F >nul
)

REM Create the scheduled task — every N minutes, indefinitely
schtasks /Create /TN "%TASKNAME%" /SC MINUTE /MO %INTERVAL% ^
  /TR "cmd /c %CMD%" /RL LIMITED /F >nul
if errorlevel 1 (
  echo.
  echo Task creation failed. Try right-click on this .bat and "Run as administrator".
  pause
  exit /b 1
)

REM Kick off an immediate first run so the user can see it work
echo Running first sync now...
schtasks /Run /TN "%TASKNAME%" >nul 2>&1

echo.
echo ============================================================
echo  Installed.
echo ============================================================
echo.
echo   It will run every %INTERVAL% minute(s^) from now on.
echo.
echo   Manually run now:   schtasks /Run /TN "%TASKNAME%"
echo   Watch the log:      powershell -Command "Get-Content '%LOG%' -Wait -Tail 10"
echo   Disable:            schtasks /Change /TN "%TASKNAME%" /DISABLE
echo   Re-enable:          schtasks /Change /TN "%TASKNAME%" /ENABLE
echo   Remove completely:  "%~f0" /uninstall
echo.
pause
exit /b 0

:uninstall
echo.
echo Removing scheduled task: %TASKNAME%
schtasks /Query /TN "%TASKNAME%" >nul 2>&1
if errorlevel 1 (
  echo   Task not found — nothing to remove.
) else (
  schtasks /Delete /TN "%TASKNAME%" /F
  echo   Removed.
)
echo.
echo Log file (kept, delete manually if you want):
echo   %LOG%
echo.
pause
exit /b 0
