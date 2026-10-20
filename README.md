# 錢錢都去哪裡了

為打工度假與旅居生活設計的多幣別記帳網站，支援收支管理、匯率參考、快速換算、帳號登入，以及依帳號隔離的雲端紀錄。

## 線上試用

[開啟錢錢都去哪裡了](https://wanderwise-budget.vercel.app/)

## 主要功能

- 新增、編輯及刪除收入與支出紀錄
- 支援 USD、TWD、EUR、JPY、CAD
- 依月份或自訂日期區間查看收支圖表
- 顯示每日參考匯率並提供快速換算
- 使用 Supabase 帳號登入，並以資料庫權限隔離每位使用者的紀錄

## 使用技術

HTML、CSS、JavaScript、Tailwind CSS、Supabase、Frankfurter API。

## 專案檔案

- `index.html`：登入、註冊與記帳介面
- `app.js`：帳號、收支、圖表與匯率功能
- `style.css`：介面樣式與 RWD
- `tailwind.generated.css`：編譯後的 Tailwind 樣式
- `config.js`：Supabase 前端連線設定
- `supabase/schema.sql`：資料表與使用者資料隔離政策
