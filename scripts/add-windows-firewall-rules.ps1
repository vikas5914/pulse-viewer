#Requires -RunAsAdministrator

$bun = (Get-Command bun.exe).Source

Remove-NetFirewallRule -DisplayName "Pulse Viewer - Bun TCP Private" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Pulse Viewer - Bun mDNS Private" -ErrorAction SilentlyContinue

New-NetFirewallRule `
  -DisplayName "Pulse Viewer - Bun TCP Private" `
  -Direction Inbound `
  -Action Allow `
  -Profile Private `
  -Program $bun `
  -Protocol TCP `
  -LocalPort 50512 `
  -RemoteAddress LocalSubnet

New-NetFirewallRule `
  -DisplayName "Pulse Viewer - Bun mDNS Private" `
  -Direction Inbound `
  -Action Allow `
  -Profile Private `
  -Program $bun `
  -Protocol UDP `
  -LocalPort 5353 `
  -RemoteAddress LocalSubnet

Write-Host "Added Pulse Viewer firewall rules for $bun"
