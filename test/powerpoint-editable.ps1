param([Parameter(Mandatory=$true)][string]$File)
$ErrorActionPreference='Stop'
$qaFile=(Resolve-Path -LiteralPath $File).Path
$qaOutput=Join-Path ([IO.Path]::GetDirectoryName($qaFile)) 'editable-roundtrip.pptx'
$qaApplication=New-Object -ComObject PowerPoint.Application
try {
  $qaDocument=$qaApplication.Presentations.Open($qaFile,0,0,0)
  try {
    if($qaDocument.Slides.Count -ne 2){throw 'Expected two slides'}
    $qaSlide=$qaDocument.Slides.Item(1)
    $qaGroup=$qaSlide.Shapes.Item('group outer')
    if($qaGroup.GroupItems.Count -lt 2){throw 'Editable group children lost'}
    $qaTable=$qaSlide.Shapes.Item('group merged').GroupItems.Item(1).Table
    if($qaTable.Rows.Count -ne 3 -or $qaTable.Columns.Count -ne 3){throw 'Invalid table dimensions'}
    $qaTable.Cell(3,1).Shape.TextFrame.TextRange.Text='PowerPoint edit verified'
    $qaSlide.Shapes.Item('text missing-font').TextFrame.TextRange.Text='Editable text verified'
    $qaDocument.SaveAs($qaOutput,24)
  } finally { $qaDocument.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaDocument) }
  $qaDocument=$qaApplication.Presentations.Open($qaOutput,-1,0,0)
  try {
    if($qaDocument.Slides.Item(1).Shapes.Item('group merged').GroupItems.Item(1).Table.Cell(3,1).Shape.TextFrame.TextRange.Text -ne 'PowerPoint edit verified'){throw 'Table edit did not survive'}
    if($qaDocument.Slides.Item(1).Shapes.Item('text missing-font').TextFrame.TextRange.Text -ne 'Editable text verified'){throw 'Text edit did not survive'}
  } finally { $qaDocument.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaDocument) }
  $qaDocument=$qaApplication.Presentations.Open($qaFile,-1,0,0)
  try { $qaDocument.Export((Join-Path ([IO.Path]::GetDirectoryName($qaFile)) 'editable-render'),'PNG',960,540) }
  finally { $qaDocument.Close();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaDocument) }
  Write-Output 'PASS PowerPoint opens, edits table/text, retains editable group children and reopens saved output'
} finally {
  # Release only this automation reference; never quit a user's PowerPoint session.
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaApplication)
}
