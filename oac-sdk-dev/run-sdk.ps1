$ErrorActionPreference = "Stop"

# Launch Oracle Analytics Desktop in SDK mode, loading plugins directly from
# src/ (no zip, no upload). See docs/oac_design.md section 7.
if (-not $env:JAVA_HOME) {
   $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
}
if (-not (Test-Path $env:JAVA_HOME)) {
   throw "JAVA_HOME '$($env:JAVA_HOME)' does not exist. Set JAVA_HOME to a JDK 17 install."
}
$env:JAVA_OPTS = "--add-opens java.base/java.lang=ALL-UNNAMED"

Push-Location $PSScriptRoot
try {
   .\gradlew.bat run
}
finally {
   Pop-Location
}
