$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$refs = Join-Path $framework 'WPF'
$compiler = Join-Path $framework 'csc.exe'
& $compiler /nologo /target:exe /platform:x64 /out:build/native/clearspace-native.exe "/reference:$refs\UIAutomationClient.dll" "/reference:$refs\UIAutomationTypes.dll" "/reference:$refs\WindowsBase.dll" /reference:System.Web.Extensions.dll desktop/native/windows.cs
if ($LASTEXITCODE -ne 0) { throw 'Windows helper compilation failed.' }
