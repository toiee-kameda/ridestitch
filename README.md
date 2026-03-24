# RideStitch

サイクリング活動ログ（FIT / GPX）をブラウザ上でマージするツールです。
Garmin デバイスで途中停止・再開したログを 1 ファイルに結合し、そのままダウンロードできます。

**サーバーレス — ファイルはすべてブラウザ内で処理され、外部に送信されません。**

---

## 機能

- FIT ファイル同士のマージ（`@garmin/fitsdk` 使用）
- GPX ファイル同士のマージ（ブラウザ組み込みの DOMParser / XMLSerializer 使用）
- ドラッグ & ドロップでファイルを追加・並び替え
- タイムスタンプによる自動ソート
- 日本語 / 英語の切り替え（デフォルト: ブラウザ言語に合わせて自動選択）
- Cloudflare Pages への静的デプロイ対応

---

## 使い方

1. FIT または GPX タブを選択
2. 結合したいファイルをドロップゾーンにドラッグ＆ドロップ（2 ファイル以上）
3. 「結合してダウンロード」ボタンをクリック
4. `merged_activity.fit` または `merged_activity.gpx` がダウンロードされる
5. Garmin Connect / Strava に元のログが残っている場合は、アップロード前に削除する

---

## 開発

### 必要な環境

- Node.js 18+
- npm

### セットアップ

```bash
npm install
```

### コマンド

```bash
npm run dev      # 開発サーバー起動 (Vite)
npm run build    # 型チェック + ビルド (tsc --noEmit + vite build)
npm test         # テスト実行 (Vitest)
npm run preview  # dist/ の内容を確認
```

---

## アーキテクチャ

```
src/
  main.ts        # エントリーポイント — 初期化・イベントバインド
  state.ts       # アプリ状態 (format, files, phase, lang, mergeResult)
  ui.ts          # 状態から DOM を再描画 (状態変更のたびに呼ばれる)
  fit-merger.ts  # FIT ファイルのマージ・ソートロジック (@garmin/fitsdk)
  gpx-merger.ts  # GPX ファイルのマージロジック
  i18n.ts        # 言語切り替え (ja/en)
  locales/       # en.json, ja.json
  types/         # garmin.d.ts — fitsdk の補完型定義
  style.css
```

アプリのフェーズ: `idle → ready → merging → done | error`

---

## 技術スタック

| 項目 | 選択 |
|---|---|
| 言語 | TypeScript |
| バンドラー | Vite |
| FIT 読み書き | `@garmin/fitsdk` |
| GPX 読み書き | ブラウザ組み込み DOMParser / XMLSerializer |
| フレームワーク | なし（Vanilla TS） |
| テスト | Vitest + happy-dom |
| ホスティング | Cloudflare Pages |

---

## ライセンス

Private
