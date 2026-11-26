# Windows proof (the release-gates skill): the signed installer is checked, installed silently on a clean machine, the
# app must start and stay up, and the uninstaller must remove it. Writes proof-windows.json.
#   pwsh app-release/proof/windows-proof.ps1 -Folder <folder with the Setup .exe> -Out <proof-windows.json>
# Env: APP_VERSION; with a self-signed certificate PFX (base64) and PFX_PASSWORD to check it is exactly ours.
# A skipped or failed check is a failed proof: there is no way to mark it passed.
param([Parameter(Mandatory)] [string] $Folder, [Parameter(Mandatory)] [string] $Out, [int] $AliveSeconds = 20)
$ErrorActionPreference = 'Stop'
$checks = New-Object System.Collections.ArrayList
function Check($name, $ok, $detail) { [void]$checks.Add([ordered]@{ name = $name; ok = [bool]$ok; detail = "$detail" }); Write-Host "$(if ($ok) {'PASS'} else {'FAIL'}) ${name}: $detail" }
$files = [ordered]@{}
try {
  $setup = Get-ChildItem -Path $Folder -Filter '*.exe' | Select-Object -First 1
  if (-not $setup) { throw "no installer (.exe) in $Folder" }
  $files[$setup.Name] = (Get-FileHash -Algorithm SHA256 -Path $setup.FullName).Hash.ToLower()

  $sig = Get-AuthenticodeSignature -FilePath $setup.FullName
  if ($env:PFX) {
    $pfx = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([Convert]::FromBase64String($env:PFX), $env:PFX_PASSWORD)
    # A self-signed certificate is not "Valid" to Windows (its root is unknown): it must be exactly ours.
    Check 'signature' (($sig.Status -in @('Valid', 'UnknownError')) -and $sig.SignerCertificate.Thumbprint -eq $pfx.Thumbprint) "$($sig.Status) $($sig.SignerCertificate.Subject)"
  } else {
    Check 'signature' ($sig.Status -eq 'Valid') "$($sig.Status) $($sig.SignerCertificate.Subject)"
  }

  # NSIS installers (electron-builder's default) install per user with /S.
  $p = Start-Process -FilePath $setup.FullName -ArgumentList '/S' -Wait -PassThru
  Check 'install' ($p.ExitCode -eq 0) "exit $($p.ExitCode)"
  $uninstaller = Get-ChildItem "$env:LOCALAPPDATA\Programs" -Recurse -Filter 'Uninstall *.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $exe = if ($uninstaller) { Get-ChildItem $uninstaller.DirectoryName -Filter '*.exe' | Where-Object { $_.Name -notlike 'Uninstall*' } | Select-Object -First 1 }
  if (-not $exe) { Check 'starts' $false 'the installed app was not found under %LOCALAPPDATA%\Programs' }
  else {
    $env:APPDATA = Join-Path ([System.IO.Path]::GetTempPath()) "proof-$([guid]::NewGuid())"
    $app = Start-Process -FilePath $exe.FullName -PassThru
    Start-Sleep -Seconds $AliveSeconds
    Check 'starts' (-not $app.HasExited) "$(if ($app.HasExited) {"exited with $($app.ExitCode)"} else {"still running after ${AliveSeconds}s"})"
    Get-Process -Id $app.Id -ErrorAction SilentlyContinue | Stop-Process -Force
    $u = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
    Start-Sleep -Seconds 5
    Check 'uninstall' (($u.ExitCode -eq 0) -and -not (Test-Path $exe.FullName)) "exit $($u.ExitCode)"
  }
} catch {
  Check 'proof' $false $_.Exception.Message
}
if (-not $env:APP_VERSION) { Check 'version' $false 'APP_VERSION is not set' }
if ($files.Count -eq 0) { Check 'files' $false 'no file was hashed' }
$ok = ($checks.Count -gt 0) -and -not ($checks | Where-Object { -not $_.ok })
$proof = [ordered]@{ target = 'windows'; version = "$env:APP_VERSION"; files = $files; checks = $checks; ok = $ok }
$proof | ConvertTo-Json -Depth 5 | Set-Content -Path $Out -Encoding utf8
Write-Host "Proof windows: $(if ($ok) {'OK'} else {'NOT OK'})"
if (-not $ok) { exit 1 }
