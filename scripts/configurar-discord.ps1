# Guarda el webhook de Discord en Azure (sin mostrarlo) y envia un mensaje de prueba.
# Pasos:
#   1) En Discord: clic derecho en el canal > Editar canal > Integraciones > Webhooks > Nuevo webhook > Copiar URL.
#   2) Guarda esa URL, sola en una linea, en el archivo scripts\webhook.txt  (git lo ignora).
#   3) Ejecuta:  powershell -ExecutionPolicy Bypass -File scripts\configurar-discord.ps1
$az = "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
if (-not (Test-Path $az)) { $az = 'az' }
$file = Join-Path $PSScriptRoot 'webhook.txt'
if (-not (Test-Path $file)) { Write-Host "No existe $file. Crea el archivo con la URL del webhook." -ForegroundColor Red; exit 1 }
$url = (Get-Content $file -Raw).Trim()
if ($url -notmatch '^https://(discord|discordapp)\.com/api/webhooks/\d+/[\w-]+$') { Write-Host 'La URL no parece un webhook de Discord (debe empezar con https://discord.com/api/webhooks/...).' -ForegroundColor Red; exit 1 }
& $az staticwebapp appsettings set -n NoMansSkySVS -g NoMansSkySVS_group --setting-names "DISCORD_WEBHOOK_URL=$url" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'No se pudo guardar en Azure (hiciste az login?).' -ForegroundColor Red; exit 1 }
Write-Host 'Webhook guardado en Azure.' -ForegroundColor Green
try {
  $body = @{ username = 'SVS - Aprobaciones'; content = 'Prueba: los avisos de capturas pendientes llegaran a este canal.' } | ConvertTo-Json
  Invoke-RestMethod -Uri $url -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null
  Write-Host 'Mensaje de prueba enviado: revisa tu canal de Discord.' -ForegroundColor Green
} catch { Write-Host "El webhook se guardo, pero el mensaje de prueba fallo: $($_.Exception.Message)" -ForegroundColor Yellow }
