# Administra las cuentas de creadores. Obtiene la clave de Azure con tu sesión de "az login" y ejecuta scripts/usuarios.js.
# Ejemplos:
#   powershell -ExecutionPolicy Bypass -File scripts\usuarios.ps1 crear geopbyte Geopbyte admin
#   powershell -ExecutionPolicy Bypass -File scripts\usuarios.ps1 crear maya Maya
#   powershell -ExecutionPolicy Bypass -File scripts\usuarios.ps1 listar
$az = "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
if (-not (Test-Path $az)) { $az = 'az' }
$env:STORAGE_CONNECTION = & $az storage account show-connection-string -n nmssvsmedia -g NoMansSkySVS_group --query connectionString -o tsv
if (-not $env:STORAGE_CONNECTION) { Write-Host 'No se pudo obtener la conexión. Ejecuta "az login" primero.' -ForegroundColor Red; exit 1 }
Set-Location (Split-Path $PSScriptRoot -Parent)
node scripts/usuarios.js @args
$env:STORAGE_CONNECTION = $null
