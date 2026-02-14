# Generate MSIX asset icons from a source icon.
# Usage: .\generate-assets.ps1 [-SourceIcon <path>]
# Default source: ..\assets\appIcons\icon.png

param(
    [string]$SourceIcon = (Join-Path $PSScriptRoot '..\desktop\assets\appIcons\icon.png')
)

$OutDir = Join-Path $PSScriptRoot '..\desktop\msix\assets'

$Assets = @(
    # Store / package logo
    @{ Name = 'icon.png'; Size = 50 }
    @{ Name = 'icon.scale-200.png'; Size = 100 }

    # App list icon (Start menu, search)
    @{ Name = 'Square44x44Logo.png'; Size = 44 }
    @{ Name = 'Square44x44Logo.scale-200.png'; Size = 88 }

    # Start tile
    @{ Name = 'Square150x150Logo.png'; Size = 150 }
    @{ Name = 'Square150x150Logo.scale-200.png'; Size = 300 }

    # Taskbar unplated (no accent color background)
    @{ Name = 'Square44x44Logo.targetsize-16_altform-unplated.png'; Size = 16 }
    @{ Name = 'Square44x44Logo.targetsize-24_altform-unplated.png'; Size = 24 }
    @{ Name = 'Square44x44Logo.targetsize-32_altform-unplated.png'; Size = 32 }
    @{ Name = 'Square44x44Logo.targetsize-48_altform-unplated.png'; Size = 48 }
    @{ Name = 'Square44x44Logo.targetsize-256_altform-unplated.png'; Size = 256 }
)

Add-Type -AssemblyName System.Drawing

$SourceIcon = Resolve-Path $SourceIcon -ErrorAction Stop
if (-not (Test-Path $SourceIcon)) {
    Write-Error "Source icon not found: $SourceIcon"
    exit 1
}

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$src = [System.Drawing.Image]::FromFile($SourceIcon)
Write-Host "Source: $SourceIcon ($($src.Width)x$($src.Height))"

foreach ($asset in $Assets) {
    $outPath = Join-Path $OutDir $asset.Name
    $bmp = New-Object System.Drawing.Bitmap($asset.Size, $asset.Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, 0, 0, $asset.Size, $asset.Size)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    $size = (Get-Item $outPath).Length
    Write-Host "  $($asset.Name) ($($asset.Size)x$($asset.Size)) - $size bytes"
}

$src.Dispose()
Write-Host "`nGenerated $($Assets.Count) assets in $OutDir"
