@echo off
echo MinePass AMO Submission Helper
echo ===============================
echo.
echo This script helps you submit MinePass to Mozilla Add-ons (AMO)
echo.
echo Prerequisites:
echo 1. Mozilla developer account: https://addons.mozilla.org/en-US/developers/
echo 2. API credentials from your developer dashboard
echo 3. Node.js and web-ext installed
echo.
echo Steps:
echo 1. Set your AMO API credentials as environment variables:
echo    set AMO_JWT_ISSUER=your_issuer_here
echo    set AMO_JWT_SECRET=your_secret_here
echo.
echo 2. Run: npm run sign
echo.
echo 3. Check status at: https://addons.mozilla.org/en-US/developers/
echo.
pause