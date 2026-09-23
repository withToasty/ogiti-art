# 仕様書（ogiti-art / 名画タイトル当て）

このドキュメントは、あとから「今どんな機能があるか」を一覧できるようにするための
リファレンス。実装の詳細は `index.html` 本体、セットアップ手順は `README.md` /
`images/README.md` を参照。

最終更新時点のコミット: 機能一覧は随時追記していく想定（変更したら都度この
ファイルも更新する）。

---

## 1. コンセプト

著作権の切れた（パブリックドメインの）名画を見せて、タイトルを当ててもらう
一人用Webアプリ。判定・採点はしない。答え合わせのあとに本当のタイトル・作者・
年代・オリジナル解説文を表示する。「真面目に当てにいってもいいし、疲れて
ふざけた回答（大喜利）になってもいい」という温度感で作っている。

## 2. 画面構成とフロー

状態はすべてページ内のJS変数のみで管理（リロードで消える。DBに保存されるのは
「みんなの回答」に投稿した分だけ）。

```
renderStart()          … トップ画面（作品コラージュ＋「作品をえらぶ」）
  └→ renderPicker()     … 作品一覧（2列グリッド、好きな作品を自由に選べる）
       ├→ 未回答の作品をタップ → renderQuestion(work)
       │     └→ 答え合わせ → renderAnswerView(work)
       │           ├→ 「作品一覧へ戻る」 → renderPicker()
       │           └→ 全問回答済みなら「結果を見る」 → renderResult()
       ├→ 回答済みの作品をタップ → renderAnswerView(work)  ※再回答はできない
       └→ 1問以上回答済みなら「ここまでの回答を見る」 → renderResult()
             ├→ 「作品一覧に戻る」 → renderPicker()
             └→ 「最初からやり直す」 → 状態リセット → renderStart()

共有ディープリンク（?w=<作品ID>）でアクセスした場合:
  init() が直接 renderQuestion(work, {fromShare:true}) を呼ぶ
    └→ 答え合わせ → renderAnswerView(work, {fromShare:true})
          └→ 「作品一覧を見る」→ URLのクエリパラメータを除去 → renderPicker()
             （以降は通常の自由選択フローに合流。回答は他の作品と同じく進捗にカウントされる）
```

## 3. データ構造

### 3.1 作品データ（`index.html` 内 `WORKS` 配列、静的定義）

```js
{
  id: "angelus",              // 内部ID。images/<id>.jpg、Firestoreのworkidにも使う
  image: "images/angelus.jpg",// ローカル画像パス。存在しない/読み込み失敗時はヒント文プレースホルダーにフォールバック
  title: "晩鐘（The Angelus）", // 正解タイトル
  artist: "...", year: "...",  // 作者・年代
  hint: "...",                 // 出題時に見せるヒント文
  desc: "..."                  // 答え合わせ時の解説文（オリジナル執筆）
}
```

収録10作品: 晩鐘（ミレー）／叫び（ムンク）／真珠の耳飾りの少女（フェルメール）／
神奈川沖浪裏（北斎）／我が子を食らうサトゥルヌス（ゴヤ）／イカロスの墜落のある
風景（ブリューゲル）／オフィーリア（ミレイ）／メキシコ湾流（ウィンズロー・
ホーマー）／夢魔（フューズリ）／民衆を導く自由の女神（ドラクロワ）

### 3.2 実行時の回答状態（JS変数、非永続）

```js
answers = { [workId]: string }  // 回答済みの作品だけキーが存在する
shareOptIn = boolean            // 「みんなの回答に公開する」チェックの状態（localStorageに保存）
```

### 3.3 Firestore（`answers` コレクション、みんなの回答用）

```
answers/{autoId}
  workId:    string   // WORKSのid
  text:      string   // 回答テキスト（最大60文字）
  likes:     number   // いいね数（0スタート、+1ずつしか更新不可）
  createdAt: Timestamp
```

セキュリティルールは `README.md` に記載。文字数制限とドキュメント形式のみ強制、
内容のモデレーションは無し（不適切投稿はFirebase Consoleから手動削除）。

## 4. 機能一覧

### 4.1 コア機能
- **自由選択クイズ**: 作品一覧から好きな絵を好きな順番で回答できる（線形強制なし）
- **回答済み表示**: 一覧のカードに✓バッジ＋自分の回答テキストを表示、再タップで見直せる
- **途中結果**: 全問回答しなくても「ここまでの回答を見る」で結果画面を確認できる
- **画像フォールバック**: 画像が読み込めない場合、自動的にヒント文のプレースホルダー表示になる

### 4.2 みんなの回答（Firebase Firestore、任意機能）
- 答え合わせ画面に、同じ作品への他ユーザーの回答を最大5件（いいね数順）表示
- 回答送信は「この回答を『みんなの回答』に公開する」チェックでオプトイン制御
  （デフォルトON、選択状態はlocalStorageに記憶）
- いいねボタン：楽観的UI更新＋Firestoreへの実書き込み、`localStorage`で二重押下防止
- 作品一覧の各カードに「N件の回答」バッジ（Firestoreの集計クエリ`count()`を使用、
  全件ダウンロードしない軽量実装）
- `FIREBASE_CONFIG` が未設定（プレースホルダーのまま）の場合、この機能一式が
  自動的に非表示になるだけで他機能に影響しない

### 4.3 シェア機能
- **結果画面のシェア行**: 𝕏（Twitter intent）／LINE（`line.me/R/msg/text/`）／
  リンクをコピー、の3導線
- **画像でシェアする**（答え合わせ画面）: Canvas APIで「絵＋自分の回答」を
  美術館の解説プレート風の1枚画像（1080×1350、常にライト配色で書き出し）に合成。
  回答が長い場合はフォントサイズを自動縮小、それでも収まらなければ省略記号で切り詰め。
  プレビューモーダルから「シェアする」（Web Share API対応時のみ表示）／
  「保存する」（ダウンロード）／「お題のリンクをコピー」を選べる
- **共有ディープリンク（`?w=<作品ID>`）**: 上記シェアのリンク・画像内共有URLは
  対象作品のIDを含む直リンク。開いた人はその1問だけの「友達からのお題」画面から
  始まり、回答すると通常の作品一覧の進捗（他作品への自由回答）に合流する

### 4.4 SEO / SNS
- Open Graph / Twitter Card メタタグ完備、`images/og-image.jpg`（1200×630、
  5作品コラージュ＋タイトル）をシェア時のプレビュー画像として使用
- `images/hero-banner.jpg`: 同じコラージュ構図の文字なし版で、トップ画面の
  ヒービジュアルとして使用（og-imageとは別画像、テキスト二重表示を避けるため）

### 4.5 デザイン
- カラートークン（`--bg` `--card` `--ink` `--sub` `--accent` `--line` `--shadow`
  `--frame-ring`）をCSS変数化し、ライト/ダーク（`prefers-color-scheme`もしくは
  `data-theme`属性）両対応
- 見出し・正解タイトルに明朝体（Google Fonts: Shippori Mincho）、本文にNoto Sans JP
- カード表示時のフェードインアニメーション（`prefers-reduced-motion`で無効化）、
  進捗バー、ボタンのプレス時の沈み込み演出

## 5. 技術仕様

- **構成**: `index.html` 1ファイルで完結（ビルド不要）。GitHub Pagesでそのまま公開
- **依存**: 実行時はCDN経由でFirebase compat SDK（`firebase-app-compat.js` /
  `firebase-firestore-compat.js`, v10.7.1）とGoogle Fontsを読み込むのみ。
  外部JSライブラリのバンドルなし
- **開発時のみの依存**（`package.json` の `devDependencies`）: `sharp`
  （`scripts/fetch-images.mjs` の画像リサイズ処理専用。サイト自体の動作には不要）
- **画像パイプライン**: `scripts/fetch-images.mjs` がWikimedia Commonsから
  パブリックドメイン画像を検索・取得し、最大1400px・JPEG品質82に自動リサイズして
  `images/<id>.jpg` に保存。ライセンス情報は `images/CREDITS.md` に自動記録
- **セキュリティ**: XSS対策として、他ユーザー由来の文字列（みんなの回答のテキスト、
  作品一覧の自分の回答表示）は `escapeHtml()` を通してから描画

## 6. ファイル構成

```
index.html              … アプリ本体（HTML/CSS/JS全部入り）
images/
  <id>.jpg               … 各作品の画像（10枚）
  hero-banner.jpg         … トップ画面用コラージュ（文字なし）
  og-image.jpg            … SNSシェア用コラージュ（文字あり）
  CREDITS.md              … 画像のライセンス・出典（自動生成）
  README.md               … 画像取得手順
scripts/
  fetch-images.mjs         … Wikimedia Commons画像の検索・取得・最適化ツール
  image-manifest.json      … 各作品のCommons検索クエリ・確定ファイル名
README.md                … セットアップ・遊び方・Firebase設定手順
SPEC.md                  … このファイル
package.json / package-lock.json … devDependencies（sharp）用
```

## 7. 既知の制限

- 進捗（`answers`）はページを閉じる/リロードすると消える。再開機能はない
- みんなの回答にモデレーション機能はない（文字数制限のみ）
- 「いいね」の二重押下防止はブラウザ単位（`localStorage`）。別ブラウザ・別端末
  からは再度いいねできてしまう
- Firestoreの無料枠を超えると課金が発生し得る（個人利用の規模なら通常は収まる）
- OGPの `og:url` / `og:image` は `https://withtoasty.github.io/ogiti-art/` に
  固定URLで書かれている。ドメインを変える場合は `index.html` の該当箇所を修正
