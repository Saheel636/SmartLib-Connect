# Start SmartLib Connect Flask Server with Python & MySQL
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "       Starting SmartLib Connect (Flask + MySQL)       " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

$pythonPath = "C:\Users\HP\anaconda3\python.exe"
if (-not (Test-Path $pythonPath)) {
    $pythonPath = "python"
}

Write-Host "Using Python: $pythonPath" -ForegroundColor Green
Write-Host "Launching Browser at http://localhost:5000 ..." -ForegroundColor Yellow
Start-Process "http://localhost:5000"

& $pythonPath app.py
