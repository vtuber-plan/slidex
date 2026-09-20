param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$slxPowerPoint=New-Object -ComObject PowerPoint.Application
try {
  foreach($slxMode in @('image','editable')) {
    $slxPresentation=$null
    try {
      $slxFile=Join-Path $Directory ($slxMode+'.pptx')
      $slxPresentation=$slxPowerPoint.Presentations.Open($slxFile,-1,0,0)
      if($slxPresentation.Slides.Count -ne 2){throw 'Expected two slides'}
      $slxNotes=$slxPresentation.Slides.Item(1).NotesPage.Shapes
      $slxFoundNote=$false
      foreach($slxShape in $slxNotes){if($slxShape.HasTextFrame -and $slxShape.TextFrame.HasText){if($slxShape.TextFrame.TextRange.Text.Contains('Note')){$slxFoundNote=$true}}}
      if(-not $slxFoundNote){throw 'Speaker notes did not survive'}
      $slxPresentation.Export((Join-Path $Directory ($slxMode+'-render')),'PNG',640,360)
      Write-Output "PASS PowerPoint opens and renders $slxMode with notes"
    } finally {if($null -ne $slxPresentation){$slxPresentation.Close();[void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($slxPresentation)}}
  }
} finally {
  # Do not Quit: PowerPoint may already contain the user's open documents.
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($slxPowerPoint)
}
