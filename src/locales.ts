/** Shared locale metadata and incremental dictionaries for desktop and web. */
export const LOCALES = [
  {id:'zh',label:'简体中文',lang:'zh-CN'},
  {id:'en',label:'English',lang:'en'},
  {id:'ja',label:'日本語（プレビュー）',lang:'ja'},
  {id:'es',label:'Español (vista previa)',lang:'es'},
] as const;
export type Locale=typeof LOCALES[number]['id'];
export const isLocale=(value:unknown):value is Locale=>LOCALES.some(l=>l.id===value);
const rows=`
文件|ファイル|Archivo
新建…|新規作成…|Nuevo…
打开…|開く…|Abrir…
打开本地文件|ローカルファイルを開く|Abrir archivo local
保存|保存|Guardar
另存为…|名前を付けて保存…|Guardar como…
另存为|名前を付けて保存|Guardar como
导出…|エクスポート…|Exportar…
偏好设置…|環境設定…|Preferencias…
偏好设置|環境設定|Preferencias
语言|言語|Idioma
外观|外観|Apariencia
浅色界面|ライト|Claro
深色界面|ダーク|Oscuro
自动保存|自動保存|Guardado automático
取消|キャンセル|Cancelar
关闭|閉じる|Cerrar
完成|完了|Listo
打开|開く|Abrir
新建|新規作成|Crear
文件路径|ファイルパス|Ruta del archivo
新建 SlideX 演示|SlideX プレゼンテーションを作成|Crear presentación SlideX
打开 SlideX 演示|SlideX プレゼンテーションを開く|Abrir presentación SlideX
请选择新的 .slx 文件路径；已有文件不会被覆盖。|新しい .slx ファイルのパスを指定してください。既存のファイルは上書きされません。|Elige una ruta nueva para el archivo .slx. No se sobrescribirán archivos existentes.
新增语言为预览版；未翻译的文案回退为英文。|追加言語はプレビュー版です。未翻訳の項目は英語で表示されます。|Los idiomas nuevos están en vista previa. Los textos sin traducir se muestran en inglés.
编辑|編集|Editar
撤销|元に戻す|Deshacer
重做|やり直す|Rehacer
剪切|切り取り|Cortar
复制|コピー|Copiar
粘贴|貼り付け|Pegar
全选|すべて選択|Seleccionar todo
删除|削除|Eliminar
工具|ツール|Herramientas
视图|表示|Ver
重新加载|再読み込み|Recargar
开发者工具|開発者ツール|Herramientas de desarrollo
放大|拡大|Acercar
缩小|縮小|Alejar
重置缩放|ズームをリセット|Restablecer zoom
全屏|全画面表示|Pantalla completa
退出|終了|Salir
帮助|ヘルプ|Ayuda
关于|バージョン情報|Acerca de
关于 SlideX|SlideX について|Acerca de SlideX
语言规范|言語仕様|Especificación del lenguaje
放映|スライドショー|Presentación
进入放映|スライドショーを開始|Iniciar presentación
演讲者视图|発表者ビュー|Vista del moderador
上一页|前のスライド|Diapositiva anterior
下一页|次のスライド|Diapositiva siguiente
返回编辑器|エディターに戻る|Volver al editor
页面|スライド|Diapositiva
页面概览|スライド一覧|Vista general
备注|ノート|Notas
设计|デザイン|Diseño
图层|レイヤー|Capas
动画|アニメーション|Animación
文本|テキスト|Texto
图片|画像|Imagen
形状|図形|Forma
表格|表|Tabla
图表|グラフ|Gráfico
公式|数式|Fórmula
组合|グループ化|Agrupar
取消组合|グループ解除|Desagrupar
锁定|ロック|Bloquear
解锁|ロック解除|Desbloquear
位置|位置|Posición
尺寸|サイズ|Tamaño
宽度|幅|Ancho
高度|高さ|Alto
旋转|回転|Rotación
透明度|不透明度|Opacidad
填充|塗りつぶし|Relleno
边框|枠線|Borde
颜色|色|Color
字体|フォント|Fuente
字号|フォントサイズ|Tamaño de fuente
加粗|太字|Negrita
斜体|斜体|Cursiva
下划线|下線|Subrayado
左对齐|左揃え|Alinear a la izquierda
居中|中央揃え|Centrar
右对齐|右揃え|Alinear a la derecha
下载 XML 文档|XML 文書をダウンロード|Descargar documento XML
DSL 源码与检查…|DSL ソースと診断…|Código DSL y diagnósticos…
语法检查|構文チェック|Comprobar sintaxis
格式化 DSL…|DSL を整形…|Formatear DSL…
导出图片给 LLM…|LLM 用の画像をエクスポート…|Exportar imágenes para LLM…
文档源码|文書ソース|Código del documento
补全|補完|Completar
跳转定义|定義へ移動|Ir a la definición
定位|移動|Localizar
文档诊断|文書の診断|Diagnósticos del documento
格式|形式|Formato
全部页面|すべてのスライド|Todas las diapositivas
当前页面|現在のスライド|Diapositiva actual
页码范围|スライドの範囲|Rango de diapositivas
开始导出|エクスポート開始|Iniciar exportación
导出中…|エクスポート中…|Exportando…
已保存|保存済み|Guardado
保存失败|保存に失敗しました|Error al guardar
本地版本历史|ローカル履歴|Historial local
恢复此版本|このバージョンを復元|Restaurar esta versión
未保存的恢复草稿|未保存の復元用下書き|Borrador de recuperación sin guardar
正在读取版本历史…|履歴を読み込み中…|Cargando historial…
适应画布|キャンバスに合わせる|Ajustar al lienzo
实际大小|実際のサイズ|Tamaño real
`;
const dictionaries:Record<string,Record<string,string>>={ja:{},es:{}};
for(const row of rows.trim().split('\n')){const [key,ja,es]=row.split('|');dictionaries.ja[key]=ja;dictionaries.es[key]=es;}
export const extraTranslation=(text:string,locale:Locale)=>dictionaries[locale]?.[text];
