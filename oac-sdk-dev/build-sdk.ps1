$ErrorActionPreference = "Stop"

# Use the caller's JDK 17 if JAVA_HOME is already set; otherwise fall back to a
# common install path. Override by setting JAVA_HOME before running this script.
if (-not $env:JAVA_HOME) {
   $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
}
if (-not (Test-Path $env:JAVA_HOME)) {
   throw "JAVA_HOME '$($env:JAVA_HOME)' does not exist. Set JAVA_HOME to a JDK 17 install."
}
$env:JAVA_OPTS = "--add-opens java.base/java.lang=ALL-UNNAMED"

Push-Location $PSScriptRoot
try {
   .\gradlew.bat clean build --stacktrace
}
finally {
   Pop-Location
}
