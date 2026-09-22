# images/

各作品の画像ファイル（`<id>.jpg`、`index.html` の `WORKS` 配列の `image` フィールドが
参照するパス）と、SNSシェア用のOGP画像（`og-image.jpg`）を格納する。`index.html` は
画像が存在しない場合、自動的にヒント文のプレースホルダー表示にフォールバックするので、
画像なしでもアプリ自体は動作する。

## 画像の取得方法

事前に依存パッケージをインストール（画像リサイズに `sharp` を使用）：

```bash
npm install
```

Wikimedia Commons への外向き通信が許可された環境で以下を実行する。

```bash
# 1. 各作品の候補ファイルを検索
node scripts/fetch-images.mjs search

# 2. scripts/image-manifest.json を開き、各作品の "file" に
#    正しい Commons ファイル名（File: を除いた部分）を書き込む
#    例: "file": "Jean-François Millet - The Angelus.jpg"

# 3. ダウンロード実行
#    images/<id>.jpg に、最大1400px・JPEG品質82にリサイズ済みの状態で保存され、
#    CREDITS.md が生成される（オリジナルの高解像度画像は保存しない）
node scripts/fetch-images.mjs download
```

## 画像サイズについて

アプリは横幅480px・アスペクト比4:3のカード内に画像を表示するだけなので、
Wikimedia Commonsのオリジナル（数千px・数MB〜20MB超）をそのまま使うと読み込みが
重くなりすぎる。そのため `fetch-images.mjs` はダウンロード時に自動で
最大1400px・JPEG品質82・プログレッシブJPEGにリサイズ／再圧縮している
（`scripts/fetch-images.mjs` 内の `MAX_DIM` / `JPEG_QUALITY` で調整可能）。

## OGP画像について

`images/og-image.jpg`（1200x630）はSNSでリンクをシェアした際に表示されるバナー画像。
収録作品からいくつかをピックアップしたコラージュ＋タイトルで構成している。
収録作品を入れ替えた場合などは作り直すこと。

## ライセンスについて

各作品は「作者の没後70年以上経過」かつ「オリジナルの忠実な複写（2Dの平面美術品）」であれば
パブリックドメインとして扱える。`fetch-images.mjs` は Commons の `extmetadata` から
`LicenseShortName` / `UsageTerms` を取得して `images/CREDITS.md` に記録するので、
ダウンロード後に目視でライセンスが PD（Public Domain）や CC0 であることを確認すること。
