# SlideX

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

SlideX は、読み書きしやすい `.slx` 文書を中心に設計されたプレゼンテーション言語とエディターです。制約のある XML DSL、デスクトップ/ブラウザーのビジュアルエディター、共通のプレーヤー、PNG・PDF・HTML・PPTX への書き出しを提供します。画面で編集する場合も、スクリプトや AI が変更する場合も、元になる文書は同じです。

## なぜ SlideX を作ったのか

スクリプトで PPTX ファイルを生成できても、聴衆に見える結果を確認できたことにはなりません。図形や文字を座標に配置できても、改行、フォント、レイアウト、未対応の機能は実際の描画結果で検証する必要があります。生成後の PPTX を直接直すと、その変更を次のスクリプト実行へ戻すことも難しくなります。Office でのオブジェクト編集が最優先ならネイティブ PPTX ライブラリは有用です。SlideX は、読みやすいソース、反復可能な変更、視覚的な確認を同時に必要とする作業向けです。

HTML/CSS はブラウザーでの表示に適していますが、任意の DOM と CSS は、検証可能なスライドオブジェクトの交換形式として広すぎます。SlideX の XML はスライド、安定したオブジェクト ID、位置、テーマ、グループ、アニメーションの対象を記述します。タグは階層、属性は設定値、限定されたリッチテキストは文章を表します。構造を検証・整形・差分比較し、ID を指定して変更できます。任意の HTML をソースとして受け入れる仕組みではありません。

```text
.slx + ローカルメディア
       │
       └── 解析 / 検証 → 共通スライドモデル
                         ├── HTML/SVG 描画 → エディター、プレーヤー、PNG、PDF、画像ベース PPTX
                         └── ネイティブオブジェクト変換 → 編集可能 PPTX + 機能レポート
```

エディターと Viewer は同じスライド描画経路を使います。AI は XML を生成・部分修正し、検証してから必要なページを画像化し、結果を見て再調整できます。編集可能な PPTX は別の選択です。対応する内容は Office オブジェクトになり、複雑な内容は画像にフォールバックする場合があります。Office 側のフォントや改行も変わり得るため、書き出しレポートで制約を示します。

## .slx 文書の例

```xml
<deck version="1" title="四半期レビュー" width="960" height="540">
  <slide id="summary" background="#FFFFFF">
    <text id="headline" x="64" y="56" w="832" h="72" font-size="40" color="#172033">
      <p><strong>四半期レビュー</strong></p>
    </text>
    <shape id="accent" name="rect" x="64" y="152" w="200" h="8" fill="#0C7B85"/>
    <text id="takeaway" x="64" y="192" w="760" h="160" font-size="28">
      <p>根拠に支えられた明確な結論。</p>
    </text>
  </slide>
</deck>
```

プロジェクトは単一の `.slx`、またはページを include する入口ファイルと `media/` で構成できます。移動時はフォルダー全体を保持してください。マスター、表、グラフ、画像、図形、数式、コード、テーマ、グループ、アニメーションにも対応します。[言語仕様](docs/spec.md)と[複数ファイルの説明](docs/large-projects.md)を参照してください。XML を直接書かずにビジュアルエディターで編集することもできます。

## インストールと基本操作

CLI とブラウザーエディターはスコープ付き npm パッケージからインストールします。CI は Node.js 22 を使用し、パッケージの要件は Node.js 18 以上です。現在のリリース候補は `next` タグです。スコープなしの npm `slidex` は別のプロジェクトです。

```sh
npm install -g @xiahan/slidex@next
slidex version
slidex init my-deck
slidex validate my-deck/deck.slx --json
slidex serve my-deck/deck.slx
```

`serve` はローカルのエディターを起動し、通常はブラウザーを開きます。別のターミナルで `slidex present my-deck/deck.slx` を実行すると再生できます。検証や書き出しには次のコマンドを使います。

```sh
slidex format my-deck/deck.slx --check
slidex format my-deck/deck.slx --write
slidex inspect my-deck/deck.slx
slidex export my-deck/deck.slx -f png --pages 1 --manifest --json
slidex export my-deck/deck.slx -f pptx --editable --json
```

`--check` は整形が必要か調べるだけで、`--write` は指定ファイルを書き換えます。`inspect` は版と ID を表示します。版を確認する部分変更には、適用前に `slidex patch <deck.slx> <patch.json> --dry-run` を使ってください。形式は[パッチ仕様](docs/ai-patch.md)を参照してください。`slidex language <deck.slx> --offset N` は補完と定義情報を提供します。

PNG/PDF/PPTX の描画にはローカルの Chrome、Edge、Chromium のいずれかが必要です。見つからない場合は `CHROME_PATH` を設定します。CLI の出力先は文書と同じ場所の `out/` です。`--pages` と `--manifest` は PNG 専用で、PDF/PPTX は現時点で全ページを書き出します。各書き出しの `.report.json` でフォント不足やフォールバックを確認してください。

Electron デスクトップ版のエディター/Viewer は [GitHub Releases](https://github.com/vtuber-plan/slidex/releases) から Windows、macOS、Linux 向けに入手できます。npm CLI は Electron 本体をインストールしません。現行デスクトップ版はコード署名・公証がなく、OS の警告が表示される場合があります。

### 書き出し形式の選択

| 形式 | 用途 | 制約 |
| --- | --- | --- |
| PNG | ページの確認、AI に渡す画像 | 静止画。ページ範囲とマニフェストに対応 |
| PDF | 共有・印刷 | 静的な結果。フォント環境で配置が変わり得る |
| HTML | 独立したブラウザープレーヤー | ユーザー指定のリモート素材はネット接続が必要な場合がある |
| PPTX | 見た目を重視した受け渡し | 標準ではページ全体が画像で、個別編集は不可 |
| PPTX `--editable` | PowerPoint で対応オブジェクトを編集 | ネイティブ要素と画像が混在し、Office の描画差があり得る |

静的書き出しは最終的な画面を示し、Viewer のアニメーション全体を再現するものではありません。[書き出しの制約](docs/export-reliability.md)も参照してください。

## AI Skill のインストール

[SlideX Skill](skills/slidex/SKILL.md) は DSL の作成、検証、整形、ページ画像の確認、書き出しレポートの読み方をエージェントに伝えます。Skill 自体に CLI は**含まれません**。`@xiahan/slidex@next` を別途インストールし、[GitHub Releases](https://github.com/vtuber-plan/slidex/releases) から `slidex-skill-<version>.zip` をダウンロードしてください。ZIP には `slidex/SKILL.md` と参照ファイルが入っています。

一般的な Codex 設定では `$CODEX_HOME/skills`、未設定なら `~/.codex/skills` に解凍します。rc.9 の ZIP を使う例：

```sh
mkdir -p ~/.codex/skills
unzip slidex-skill-1.7.0-rc.9.zip -d ~/.codex/skills
# ~/.codex/skills/slidex/SKILL.md
```

Windows PowerShell の既定の配置先は `$env:USERPROFILE\.codex\skills` です。

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Expand-Archive .\slidex-skill-1.7.0-rc.9.zip -DestinationPath "$env:USERPROFILE\.codex\skills"
```

他のエージェントではそれぞれの Skill ディレクトリーに `slidex/` を置いてください。ソースの [`skills/slidex/`](skills/slidex/) も利用できます。起動時だけ Skill を読み込む環境では新しいセッションを開始してください。npm パッケージの導入だけでは Skill は自動登録されません。

## ソースから開発する

```sh
npm ci
npm run build
npm run app          # Electron 開発版
npm test
npm run dist:tools   # release/<version>/ に CLI tgz と Skill ZIP を作成
npm run test:tools -- --render
```

React エディターは Tailwind CSS、Radix Themes、ProseMirror と共通の描画/再生エンジンを使用します。バージョンタグでテスト、各 OS の Electron ビルド、GitHub Release と npm Trusted Publishing が実行されます。[アーキテクチャ](docs/architecture.md)、[公開手順](docs/releasing.md)、[サンプル](examples/)、[ロードマップ](docs/roadmap.md)も参照してください。

## ライセンス

MIT
