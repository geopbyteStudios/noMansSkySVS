# Genera versiones ligeras (JPEG) de las capturas de img/Players:
#   img/thumbs/<jugador>/<archivo>.jpg  -> miniatura para la cuadricula (640 px de ancho)
#   img/view/<jugador>/<archivo>.jpg    -> version para ver en grande    (1920 px de ancho)
# Solo procesa las imagenes nuevas o modificadas. Las originales no se tocan.
# Uso:  powershell -ExecutionPolicy Bypass -File make-thumbs.ps1   (server.js lo ejecuta solo al arrancar)

Add-Type -AssemblyName System.Drawing

$root    = $PSScriptRoot
$players = Join-Path $root 'img\Players'
$sizes   = @( @{ Dir = 'thumbs'; Width = 640 }, @{ Dir = 'view'; Width = 1920 } )
$exts    = '.png', '.jpg', '.jpeg', '.webp', '.gif'
$quality = 82

$jpeg   = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)

$made = 0
Get-ChildItem -LiteralPath $players -Directory | ForEach-Object {
    $player = $_.Name
    Get-ChildItem -LiteralPath $_.FullName -File | Where-Object { $exts -contains $_.Extension.ToLower() } | ForEach-Object {
        $src = $_
        $todo = @()
        foreach ($s in $sizes) {
            $outDir = Join-Path $root ("img\{0}\{1}" -f $s.Dir, $player)
            $out    = Join-Path $outDir ($src.Name + '.jpg')
            if (-not (Test-Path -LiteralPath $out) -or (Get-Item -LiteralPath $out).LastWriteTime -lt $src.LastWriteTime) {
                $todo += @{ Out = $out; Dir = $outDir; Width = $s.Width }
            }
        }
        if ($todo.Count -eq 0) { return }

        $img = [System.Drawing.Image]::FromFile($src.FullName)
        try {
            foreach ($t in $todo) {
                $w = [Math]::Min($t.Width, $img.Width)   # nunca agrandar
                $h = [int][Math]::Round($img.Height * $w / $img.Width)
                $bmp = New-Object System.Drawing.Bitmap($w, $h)
                $g = [System.Drawing.Graphics]::FromImage($bmp)
                try {
                    $g.InterpolationMode = 'HighQualityBicubic'
                    $g.SmoothingMode = 'HighQuality'
                    $g.PixelOffsetMode = 'HighQuality'
                    $g.DrawImage($img, 0, 0, $w, $h)
                    New-Item -ItemType Directory -Force -Path $t.Dir | Out-Null
                    $bmp.Save($t.Out, $jpeg, $params)
                } finally { $g.Dispose(); $bmp.Dispose() }
            }
            $made++
            Write-Host ("  {0}/{1}" -f $player, $src.Name)
        } finally { $img.Dispose() }
    }
}
Write-Host ("Miniaturas: {0} imagen(es) procesada(s)." -f $made)
