// template.ts — 新项目脚手架模板（CLI init 与 Electron 新建共用）
export function templateDeck(name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<deck version="1" title="${name}" width="960" height="540">
  <theme>
    <palette>
      <color name="paper" value="#FFFFFF"/>
      <color name="ink" value="#1F2937"/>
      <color name="muted" value="#64748B"/>
      <color name="primary" value="#2563EB"/>
      <color name="accent" value="#F59E0B"/>
    </palette>
    <text-styles>
      <style name="title" font-size="40" bold="true" color="$ink"/>
      <style name="subtitle" font-size="20" color="$muted"/>
    </text-styles>
  </theme>
  <slide type="cover" background="$paper">
    <text id="title" x="80" y="175" w="800" h="90" style="$title" align="center middle">
      <p>主标题</p>
    </text>
    <text id="sub" x="120" y="295" w="720" h="45" style="$subtitle" align="center middle">
      <p>副标题</p>
    </text>
  </slide>
</deck>
`;
}
