echo off

echo Building application
start /wait cmd /c tsc -p .

echo Start the server
start cmd /k node ./build/serverTest.js 127.0.0.1 3333

REM pause for 1 second
timeout /t 1 /nobreak >nul

echo start the peer
start cmd /k node ./build/peerTest.js %1 127.0.0.1 3333

:END