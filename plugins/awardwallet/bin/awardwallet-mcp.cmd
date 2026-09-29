@echo off
rem Starts the AwardWallet MCP server with the Node.js runtime that ships with ChatGPT and Codex,
rem so users don't have to install Node. Falls back to a Node.js on PATH.
setlocal

if "%~1"=="" (
  echo AwardWallet could not start: missing server path. 1>&2
  exit /b 64
)

if defined CODEX_MCP_NODE_PATH if exist "%CODEX_MCP_NODE_PATH%" (
  "%CODEX_MCP_NODE_PATH%" %*
  exit /b
)
if defined USERPROFILE if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" %*
  exit /b
)
if defined LOCALAPPDATA for /d %%D in ("%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node\*") do if exist "%%~fD\bin\node.exe" (
  "%%~fD\bin\node.exe" %*
  exit /b
)

where node >nul 2>&1
if not errorlevel 1 (
  node %*
  exit /b
)

echo AwardWallet could not find Node.js. Update the ChatGPT desktop app, or install Node.js 20.10 or later from https://nodejs.org. 1>&2
exit /b 127
