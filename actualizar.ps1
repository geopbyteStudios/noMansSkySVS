# Prepara el sitio para publicarlo: genera las versiones ligeras de las capturas nuevas (img/thumbs e img/view)
# y el archivo svs.json que lee la pagina. Despues solo falta hacer commit y push.
#
# Uso:  powershell -ExecutionPolicy Bypass -File actualizar.ps1
Set-Location $PSScriptRoot
node server.js --build
if ($LASTEXITCODE -ne 0) { Write-Host 'Algo fallo, revisa el mensaje de arriba.' -ForegroundColor Red; exit 1 }
Write-Host ''
Write-Host 'Listo. Ahora sube los cambios (commit + push) para que Azure publique la nueva version.' -ForegroundColor Green
Write-Host 'Recuerda: las capturas originales (img/Players) NO se suben; solo las versiones ligeras.'
