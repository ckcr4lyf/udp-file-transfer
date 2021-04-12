echo off

echo Building application
start /wait cmd /c tsc -p .

echo Start the server
start cmd /k node .\build\app.js 3333 sendFiles server

REM pause for 1 second
timeout /t 1 /nobreak >nul

echo start the peer
start cmd /k node .\build\app.js 4444 recvFiles peer 127.0.0.1 3333

:END