# チェックアプリ

Vanilla JavaScript の分割構成で動作するWebアプリです。

## 構成

- `index.html` — 画面
- `app.mjs` — アプリ処理
- `core.mjs` — 共通処理
- `store.mjs` — 保存・リセット処理
- `update.html` — 更新処理
- `sw.js` — Service Worker
- `manifest.json` — Web App Manifest

`index.html` から `app.mjs` を直接読み込む構成なので、ReactやViteは必要ありません。
