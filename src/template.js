// template.js — 新项目脚手架模板（CLI init 与 Electron 新建共用）
export function templateDeck(name) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<deck version="1" title="${name}" width="960" height="540">
  <theme>
    <palette>
      <color name="paper" value="#FAF8F4"/>
      <color name="ink" value="#232A31"/>
      <color name="primary" value="#14606C"/>
      <color name="accent" value="#B4632C"/>
    </palette>
    <text-styles>
      <style name="title" font-size="36" bold="true" color="$ink"/>
      <style name="body" font-size="16" color="$ink" line-height="1.55"/>
    </text-styles>
  </theme>
  <slide type="cover" background="$primary">
    <text id="title" x="80" y="220" w="800" h="80" style="$title" color="#FAF8F4" align="center middle">
      <p>${name}</p>
    </text>
    <text id="sub" x="80" y="310" w="800" h="40" style="$body" color="#FAF8F4C8" align="center top">
      <p>双击文本直接编辑 · 源码视图可粘贴 AI 生成的 .slx</p>
    </text>
  </slide>
</deck>
`;
}
