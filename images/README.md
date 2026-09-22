# images/

このディレクトリには各作品の画像ファイル（`<id>.jpg` など、`index.html` の `WORKS` 配列の
`image` フィールドが参照するパス）を配置する。現時点では空。`index.html` は画像が
存在しない場合、自動的にヒント文のプレースホルダー表示にフォールバックするので、
画像なしでもアプリ自体は動作する。

## 画像の取得方法

Wikimedia Commons への外向き通信が許可された環境（この Claude Code セッションでは
`commons.wikimedia.org` へのアクセスが組織のネットワークポリシーでブロックされていたため、
実行できなかった）で以下を実行する。

```bash
# 1. 各作品の候補ファイルを検索
node scripts/fetch-images.mjs search

# 2. scripts/image-manifest.json を開き、各作品の "file" に
#    正しい Commons ファイル名（File: を除いた部分）を書き込む
#    例: "file": "Jean-François Millet - The Angelus.jpg"

# 3. ダウンロード実行（images/<id>.jpg に保存され、CREDITS.md が生成される）
node scripts/fetch-images.mjs download
```

Node.js 18 以降が必要（組み込み `fetch` を使用、追加の依存パッケージなし）。

## ライセンスについて

各作品は「作者の没後70年以上経過」かつ「オリジナルの忠実な複写（2Dの平面美術品）」であれば
パブリックドメインとして扱える。`fetch-images.mjs` は Commons の `extmetadata` から
`LicenseShortName` / `UsageTerms` を取得して `images/CREDITS.md` に記録するので、
ダウンロード後に目視でライセンスが PD（Public Domain）や CC0 であることを確認すること。
