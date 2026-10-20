# 錢錢都去哪裡了

為打工度假與旅居生活設計的多幣別記帳網站，支援收支管理、匯率參考、快速換算、帳號登入，以及依帳號隔離的雲端紀錄。

## 線上試用

[開啟錢錢都去哪裡了](https://wanderwise-budget.vercel.app/)

## 功能

- 新增、編輯、刪除收入與支出
- 支援 USD、TWD、EUR、JPY、CAD
- 依月或自訂日期區間查看收支圖表
- 透過 Frankfurter API 顯示參考匯率與快速換算
- Supabase Auth 帳號管理及 Postgres 收支資料
- Tailwind CSS CLI 編譯樣式與響應式版面

## 本機執行

本機修改與預覽時，請使用 HTTP 伺服器，不要直接用 `file://` 開啟：

```sh
python3 -m http.server 8000
```

然後開啟 http://localhost:8000。這個本機網址只在你的電腦上使用；分享網站請使用上方的線上試用連結。

## Supabase 設定

1. 在 Supabase SQL Editor 執行 `supabase/schema.sql`，建立收支資料表和 RLS 使用者資料隔離政策。
2. 在 `config.js` 設定 Supabase Project URL 與瀏覽器專用的 publishable/anon key。
3. 請勿將 `service_role` 或其他 secret key 放進前端檔案。

## 專案檔案

- `index.html`：登入、註冊與記帳介面
- `app.js`：登入、收支、圖表和匯率功能
- `style.css`：介面樣式與 RWD
- `tailwind.generated.css`：Tailwind CLI 產生的樣式
- `config.js`：Supabase 前端連線設定
- `supabase/schema.sql`：資料表與 RLS 政策
