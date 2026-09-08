Add-Type -AssemblyName System.Drawing

$publicDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'public'

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-PhonicsIcon {
  param(
    [int]$Size,
    [string]$FileName,
    [switch]$Maskable
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f6f8fb'))
  $navy = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#172033'))
  $orange = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#ff5b35'))
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $graphics.FillRectangle($background, 0, 0, $Size, $Size)

  $inset = if ($Maskable) { [float]($Size * 0.125) } else { 0.0 }
  $cardSize = $Size - ($inset * 2)
  $radius = if ($Maskable) { $Size * 0.175 } else { $Size * 0.24 }
  $card = New-RoundedRectanglePath -X $inset -Y $inset -Width $cardSize -Height $cardSize -Radius $radius
  $graphics.FillPath($navy, $card)
  $graphics.SetClip($card)
  $graphics.FillRectangle($orange, $Size / 2, $inset, $Size / 2, $cardSize)
  $graphics.ResetClip()

  $fontSize = if ($Maskable) { $Size * 0.27 } else { $Size * 0.36 }
  $font = [System.Drawing.Font]::new([System.Drawing.FontFamily]::GenericSansSerif, $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = [System.Drawing.StringFormat]::new()
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $letterY = if ($Maskable) { $Size * 0.19 } else { $Size * 0.12 }
  $letterHeight = if ($Maskable) { $Size * 0.62 } else { $Size * 0.76 }
  $graphics.DrawString('P', $font, $white, [System.Drawing.RectangleF]::new(0, $letterY, $Size / 2, $letterHeight), $format)
  $graphics.DrawString('B', $font, $white, [System.Drawing.RectangleF]::new($Size / 2, $letterY, $Size / 2, $letterHeight), $format)

  $target = Join-Path $publicDir $FileName
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)

  $format.Dispose()
  $font.Dispose()
  $card.Dispose()
  $white.Dispose()
  $orange.Dispose()
  $navy.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-PhonicsIcon -Size 192 -FileName 'icon-192.png'
New-PhonicsIcon -Size 512 -FileName 'icon-512.png'
New-PhonicsIcon -Size 512 -FileName 'icon-maskable.png' -Maskable
