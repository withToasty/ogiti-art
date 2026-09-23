# 名画タイトル当て（ogiti-art）

著作権の切れた（パブリックドメインの）名画を見せて、タイトルを当ててもらう
一人用Webアプリ。判定・採点はせず、答え合わせのあとに本当のタイトル・作者・
背景をオリジナル解説文で表示する。真面目に当てにいってもいいし、疲れて
ふざけた回答（大喜利）になってもいい、というくらいの温度感。

## 遊び方

`index.html` をブラウザで開くだけ（ビルド不要・単一HTMLファイル）。

1. トップ画面で「作品をえらぶ」
2. 作品一覧（2列グリッド）から好きな絵を好きな順番でタップ
3. 画像＋ヒント文を見てタイトルを自由入力 → 答え合わせ（本当のタイトル・作者・
   年代・解説、他の人の回答も表示）
4. 全問答えなくても「ここまでの回答を見る」で結果を確認できる。全問答えたら
   結果画面から𝕏/LINE/リンクでシェアも可能

機能の全体像は [`SPEC.md`](SPEC.md) を参照。

## 画像について

`index.html` の `WORKS` 配列が各作品の `images/<id>.jpg` を参照する。画像ファイルが
存在しない場合は自動的にヒント文のプレースホルダー表示にフォールバックするため、
画像なしでもアプリは動作する。

画像の取得手順は [`images/README.md`](images/README.md) を参照。Wikimedia Commons
からパブリックドメイン画像を検索・取得する `scripts/fetch-images.mjs` を同梱している。

## デプロイ

単一の静的HTMLなので GitHub Pages でそのまま公開できる（リポジトリ設定の Pages で
ブランチを指定するのみ）。

**Pagesを有効化したら**、`index.html` の `<head>` にある OGP / Twitter Card の
`og:url` / `og:image` / `twitter:image` を実際の公開URL
（`https://<ユーザー名>.github.io/ogiti-art/` を想定して仮設定済み）に合わせて確認・修正する。
SNSでリンクをシェアした際に `images/og-image.jpg` がプレビュー画像として表示される。

## みんなの回答機能（Firebase）

答え合わせ画面に、他の人が投稿した回答を見て「いいね」できる「みんなの回答」セクションがある。
バックエンドに [Firebase Firestore](https://firebase.google.com/) を使用。

**未設定でも動作する**：`index.html` 内の `FIREBASE_CONFIG` がプレースホルダーのままの場合、
この機能全体が自動的に無効化される（セクション自体が表示されない）だけで、他の機能に影響はない。

### 有効化する手順

1. [Firebase Console](https://console.firebase.google.com/) で新規プロジェクトを作成（無料のSparkプランでOK）
2. 左メニューの **Firestore Database** → **データベースを作成**（本番環境モードでOK、リージョンは任意）
3. **Firestore Database → ルール** タブを開き、下記のルールに置き換えて公開

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /answers/{answerId} {
         allow read: if true;

         allow create: if request.resource.data.keys().hasOnly(['workId', 'text', 'likes', 'createdAt'])
           && request.resource.data.workId is string
           && request.resource.data.workId.size() > 0
           && request.resource.data.workId.size() < 40
           && request.resource.data.text is string
           && request.resource.data.text.size() > 0
           && request.resource.data.text.size() <= 60
           && request.resource.data.likes == 0
           && request.resource.data.createdAt == request.time;

         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['likes'])
           && request.resource.data.likes == resource.data.likes + 1;

         allow delete: if false;
       }
     }
   }
   ```

4. **プロジェクトの設定**（左上の歯車アイコン）→ 下部の「アプリ」で **ウェブアプリを追加**
5. 表示される `firebaseConfig` オブジェクトの値を、`index.html` の `FIREBASE_CONFIG` にそのままコピーする
   （Firebaseのウェブ用APIキーは公開前提の値。秘匿する必要はなく、実際のアクセス制御は上記のFirestoreルールで行う）

### 既知の制限・注意点

- **モデレーション機能はない**。投稿されたテキストはそのまま公開表示される（60文字以内・空文字不可の
  制約のみ）。不適切な投稿が入った場合は、Firebase ConsoleのFirestore Database画面から該当ドキュメントを
  手動で削除する
- 「いいね」の二重押下防止はブラウザの `localStorage` ベース（ブラウザ・端末をまたぐと再度押せてしまう）
- Firestoreの無料枠（1日あたり読み取り5万・書き込み2万）を超えると課金が発生する可能性がある。個人の
  ちょっとしたアクセス数であれば通常は無料枠内に収まる

## 技術方針

- データは HTML 内に JS 配列として埋め込み
- 出題数は10問固定
- 解説文はオリジナル執筆（Wikipedia等の丸写しはしない）
- モバイルファースト・日本語UI
