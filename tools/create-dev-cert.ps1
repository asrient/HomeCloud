# Create a self-signed certificate for MSIX signing
# Subject must match the Publisher in AppxManifest.xml exactly
# Set APPX_PUBLISHER env var to override the default subject

$subject = if ($env:APPX_PUBLISHER) { $env:APPX_PUBLISHER } else { "CN=HomeCloud Dev" }
$password = "HomeCloud2026!"
$pfxPath = "$HOME\HomeCloud.pfx"
$cerPath = "$HOME\HomeCloud.cer"

# Check if cert already exists
$existing = Get-ChildItem -Path "Cert:\CurrentUser\My" | Where-Object { $_.Subject -eq $subject }
if ($existing) {
    Write-Host "Certificate with subject '$subject' already exists. Using existing cert."
    $cert = $existing | Sort-Object NotAfter -Descending | Select-Object -First 1
} else {
    Write-Host "Creating new self-signed certificate..."
    $cert = New-SelfSignedCertificate `
        -Type Custom `
        -Subject $subject `
        -KeyUsage DigitalSignature `
        -FriendlyName "HomeCloud Dev Cert" `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
    Write-Host "Certificate created: $($cert.Thumbprint)"
}

# Export .pfx (private key)
$securePwd = ConvertTo-SecureString -String $password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $securePwd | Out-Null
Write-Host "Exported PFX to: $pfxPath"

# Export .cer (public key, for installing on target machines)
Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
Write-Host "Exported CER to: $cerPath"

Write-Host ""
Write-Host "=== Use these env vars for MSIX signing ==="
Write-Host "MSIX_CERT_FILE=$pfxPath"
Write-Host "MSIX_CERT_PASSWORD=$password"
