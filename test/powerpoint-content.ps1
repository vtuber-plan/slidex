param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference='Stop'
$qaFile=(Resolve-Path -LiteralPath $File).Path
$qaOutput=Join-Path ([IO.Path]::GetDirectoryName($qaFile)) 'content-roundtrip.pptx'
$qaApplication=New-Object -ComObject PowerPoint.Application
try {
  $qaDocument=$qaApplication.Presentations.Open($qaFile,0,0,0)
  try {
    if($qaDocument.Slides.Count -ne 5){throw 'Expected five chart slides'}
    for($qaIndex=1;$qaIndex -le 5;$qaIndex++){
      $qaSlide=$qaDocument.Slides.Item($qaIndex)
      $qaChart=$qaSlide.Shapes.Item(('chart chart'+($qaIndex-1))).Chart
      if($qaChart.SeriesCollection().Count -ne 1){throw 'Missing editable chart series'}
      $qaChart.SeriesCollection(1).Values=@(20,44,15)
      if($qaSlide.TimeLine.MainSequence.Count -ne 2){throw 'Native animation sequence lost'}
      if($qaSlide.SlideShowTransition.EntryEffect -eq 0){throw 'Native transition lost'}
    }
    $qaDocument.SaveAs($qaOutput,24)
  } finally { $qaDocument.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaDocument) }
  $qaDocument=$qaApplication.Presentations.Open($qaOutput,-1,0,0)
  try {
    for($qaIndex=1;$qaIndex -le 5;$qaIndex++){
      $qaChart=$qaDocument.Slides.Item($qaIndex).Shapes.Item(('chart chart'+($qaIndex-1))).Chart
      if(@($qaChart.SeriesCollection(1).Values)[1] -ne 44){throw 'Chart data edit did not survive'}
    }
    $qaDocument.Export((Join-Path ([IO.Path]::GetDirectoryName($qaFile)) 'content-render'),'PNG',960,540)
  } finally { $qaDocument.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaDocument) }
  Write-Output 'PASS PowerPoint opens five native charts, edits series data, preserves animations/transitions, saves and reopens'
} finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaApplication) }
