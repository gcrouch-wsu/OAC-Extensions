$ErrorActionPreference = "Stop"

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:JAVA_OPTS = "--add-opens java.base/java.lang=ALL-UNNAMED"

Push-Location $PSScriptRoot
try {
   .\gradlew.bat clean build --stacktrace
}
finally {
   Pop-Location
}
