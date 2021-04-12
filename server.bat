@echo off

echo Building application
start /wait cmd /c tsc -p .

echo Start the server
start cmd /k node .\build\app.js 3333 sendFiles server