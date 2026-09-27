param(
  [Parameter(Mandatory=$true)][string]$InputFile,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][int]$Width,
  [Parameter(Mandatory=$true)][int]$Height
)
$ErrorActionPreference='Stop'
$slxPowerPoint=New-Object -ComObject PowerPoint.Application
$slxPresentation=$null
try {
  $slxPresentation=$slxPowerPoint.Presentations.Open($InputFile,-1,0,0)
  $slxPresentation.Export($OutputDirectory,'PNG',$Width,$Height)
  Write-Output "Rendered $($slxPresentation.Slides.Count) slides: $OutputDirectory"
} finally {
  if($null -ne $slxPresentation){$slxPresentation.Close();[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($slxPresentation)}
  # The user may have other presentations open in this PowerPoint instance.
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($slxPowerPoint)
}
