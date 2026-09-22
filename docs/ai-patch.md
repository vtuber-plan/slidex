# AI 增量修改协议（v1）

用 `slidex inspect deck.slx` 获取项目 `version`、页面 ID 和顶层对象 ID；嵌套对象 ID 可从 `.slx` 或 `GET /api/deck` 的 XML 读取。每次提交必须携带 `expectedVersion`。接口只作用于当前打开的项目，不接受请求指定磁盘路径。

```json
{
  "version": 1,
  "expectedVersion": "inspect 输出的版本哈希",
  "operations": [
    { "op": "set-object", "pageId": "slide1", "objectId": "title", "properties": { "content": "新的标题", "x": 80 } },
    { "op": "add-object", "pageId": "slide1", "parentId": "group1", "afterId": "title", "element": { "type": "shape", "id": "accent", "x": 8, "y": 90, "w": 80, "h": 40, "fill": "#008866" } }
  ]
}
```

CLI：`slidex patch deck.slx patch.json --dry-run` 预演；去掉 `--dry-run` 原子提交。HTTP：`POST /api/patch`，请求体为相同 JSON，可额外设置 `"dryRun": true`。预演返回 `xml`、`changes`、`warnings` 和原项目 `version`，不写磁盘；提交返回新 `version`、`changes`、`warnings`。补丁至多 100 个操作，按数组顺序在一份内存副本中执行，任何一步失败均不保存。版本不一致返回 HTTP 409；字段、引用或 DSL 校验失败返回 HTTP 400。

支持的操作：

| 操作 | 定位和内容 |
| --- | --- |
| `set-object` | 按页与对象 ID 修改该类型的 DSL 属性、文本内容或结构化填充/表格/图表数据；值为 `null` 时移除可选属性。不允许修改 ID、类型、子对象数组或解析器内部字段。 |
| `add-object` | 插入页面顶层，或 `parentId` 指定的组合内；`afterId` 指定同一层级的前置对象，否则追加。新对象需要唯一 ID 和有效 DSL 属性。 |
| `remove-object` | 删除对象及其子树；若动画仍引用其中任一 ID，必须先在同一批补丁里更新动画。 |
| `set-slide` | 修改 `notes`、`transition`、`master`、`type` 或 `background`；不改页面 ID。 |
| `set-animations` | 替换本页动画数组；所有目标必须在提交后的页面内存在。 |

普通项目原子替换入口文件；多文件项目采用现有不可变页面快照与入口 manifest 原子替换，旧片段保留。提交后持有旧版本的编辑器保存会冲突，应重新加载，不要绕过版本检查。补丁协议不直接操作媒体文件、跨组移动、页面增删或外部模型；先把媒体放入项目内，再引用相对路径。`dry-run` 成功不预留版本，正式提交仍可能遇到外部修改并返回冲突。
