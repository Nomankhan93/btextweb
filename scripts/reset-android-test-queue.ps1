param(
  [string]$Package = "com.bulktext.gateway.prototype"
)

$ErrorActionPreference = "Stop"

Write-Host "BulkText Android local TEST queue reset"
Write-Host "Package: $Package"
Write-Host "This deletes only cloud_queue.db. Pairing/SIM preferences and gateway.db are preserved."

$devices = adb devices
if ($LASTEXITCODE -ne 0) { throw "adb devices failed" }
if (-not (($devices | Select-String -Pattern "\tdevice$") -ne $null)) {
  throw "No authorized Android device found. Connect the test phone and authorize USB debugging."
}

adb shell am force-stop $Package | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not stop BulkText Android" }

foreach ($file in @("databases/cloud_queue.db", "databases/cloud_queue.db-wal", "databases/cloud_queue.db-shm", "databases/cloud_queue.db-journal")) {
  adb shell run-as $Package rm -f $file | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not remove $file. Ensure a debuggable BulkText APK is installed." }
}

Write-Host "PASS: cloud_queue.db reset. Pairing credentials and SIM preferences were not cleared."
Write-Host "Open BulkText Android once, confirm Paired & Valid / exact SIM Ready, then enable Background Gateway for the fresh test."
