@echo off
REM Double-click this to launch MakanDay Audience Signal.
cd /d "%~dp0"
start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:3000"
npm start
