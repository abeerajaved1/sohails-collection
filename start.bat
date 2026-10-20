@echo off
rem Change the word after = to your own password (no spaces).
set ADMIN_PASSWORD=ChangeThisPassword1
echo Store: http://localhost:3000
echo Admin: http://localhost:3000/admin.html
echo Do not close this window while you use the store.
node server.js
pause
