# PowerShell Local Setup and Run Script for NBE RCSA Platform
# Requirements: Windows 10/11, PowerShell 5.1+, Node.js 18+

Write-Host "=======================================================================" -ForegroundColor DarkGreen
Write-Host "  National Bank of Egypt (NBE) - Operational Risk RCSA Platform" -ForegroundColor Green
Write-Host "  PowerShell Setup & Local Execution Script" -ForegroundColor Green
Write-Host "=======================================================================" -ForegroundColor DarkGreen
Write-Host ""

# 1. Verify Node.js
try {
    $nodeVersion = node -v
    Write-Host "[OK] Node.js is installed: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Error "[FAIL] Node.js is not installed or not in PATH. Please install Node.js 18+."
    exit 1
}

# 2. Install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Installing npm packages from package.json..." -ForegroundColor Cyan
    npm install
} else {
    Write-Host "[OK] Dependencies already installed." -ForegroundColor Green
}

# 3. Ensure data directory exists
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
    Write-Host "[OK] Created persistent data directory." -ForegroundColor Green
}

# 4. Run tests & verification
Write-Host "[*] Running verification tests and lint check..." -ForegroundColor Cyan
npm run lint
npm test

# 5. Launch the platform
Write-Host ""
Write-Host "=======================================================================" -ForegroundColor DarkGreen
Write-Host "  Starting Server on http://localhost:3000" -ForegroundColor Yellow
Write-Host "  Demo accounts:" -ForegroundColor Yellow
Write-Host "    - Maker:        EMP-1001 / NBE@2026!" -ForegroundColor White
Write-Host "    - Checker:      EMP-2002 / NBE@2026!" -ForegroundColor White
Write-Host "    - Risk Admin:   EMP-9009 / NBE@2026!" -ForegroundColor White
Write-Host "    - Auditor:      EMP-8008 / NBE@2026!" -ForegroundColor White
Write-Host "=======================================================================" -ForegroundColor DarkGreen
Write-Host ""

npm run dev
