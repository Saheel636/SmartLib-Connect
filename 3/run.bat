@echo off
title SmartLib Connect - Flask & MySQL Server
echo ======================================================================
echo           Starting SmartLib Connect (Flask + MySQL)
echo ======================================================================
echo.

set PYTHON_CMD=python
if exist "C:\Users\HP\anaconda3\python.exe" (
    set PYTHON_CMD=C:\Users\HP\anaconda3\python.exe
    echo Using Anaconda Python runtime: C:\Users\HP\anaconda3\python.exe
) else (
    echo Using system Python
)

echo Starting Flask Server on http://localhost:5000 ...
start "" http://localhost:5000
"%PYTHON_CMD%" app.py

pause
