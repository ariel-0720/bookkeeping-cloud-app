# 營運記帳 APP｜雲端正式版骨架

這是一個 **Next.js + Supabase** 的手機優先記帳系統，支援：

- Email 註冊 / 登入
- 共享工作區（Workspace）
- 現金 / 銀行 / 轉帳
- 新增 / 編輯 / 刪除交易
- 週報摘要
- CSV 匯出
- 手機版介面
- PWA Manifest（可加入主畫面）

---

## 技術架構

- **前端**：Next.js App Router
- **資料庫 / Auth**：Supabase
- **部署**：Vercel
- **資料保存**：Supabase Postgres（不是 localStorage）

---

## 1. 建立 Supabase 專案

1. 到 Supabase 建立新專案
2. 打開 SQL Editor
3. 把 `supabase/schema.sql` 全部貼上並執行

---

## 2. 設定環境變數

複製 `.env.example` 為 `.env.local`

```bash
cp .env.example .env.local
```

填入：

```env
NEXT_PUBLIC_SUPABASE_URL=你的 Supabase URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase anon key
```

---

## 3. 安裝與執行

```bash
npm install
npm run dev
```

開啟：
`http://localhost:3000`

---

## 4. 部署到 Vercel

### 做法 A：GitHub + Vercel
1. 把這份專案上傳到 GitHub
2. 在 Vercel 匯入該 repo
3. 將 `.env.local` 的兩個環境變數填到 Vercel
4. Deploy

### 做法 B：本機 CLI
```bash
npm i -g vercel
vercel --prod
```

---

## 5. 第一次使用流程

1. 註冊帳號
2. 建立一個工作區
3. 系統會自動產生邀請碼
4. 其他人註冊後，可用邀請碼加入同一工作區
5. 加入後即可共用同一批交易資料

---

## 6. 共享邏輯

- 每個使用者可以加入多個工作區
- 交易資料隸屬於工作區
- 只有該工作區成員可讀寫資料
- 你可以把邀請碼給其他人加入

---

## 7. 注意事項

- 目前用 Email + Password 登入
- 這版是 **正式專案骨架**，可直接延伸成產品
- 若要更完整，可再加：
  - 實際邀請管理頁
  - 多角色權限（管理員 / 一般成員）
  - PDF / 真 Excel 匯出
  - 行事曆 / 每月報表
  - 附件上傳（收據圖片）

---

## 8. 檔案重點

- `app/page.tsx`：主頁
- `components/app-shell.tsx`：主要畫面與互動
- `components/auth-panel.tsx`：登入 / 註冊
- `lib/supabase.ts`：Supabase client
- `lib/types.ts`：資料型別
- `supabase/schema.sql`：資料表與 RLS
- `app/manifest.ts`：PWA manifest

---

## 9. 建議的下一步

若你要正式營運，下一步建議加：

- 邀請連結頁
- 管理員權限
- 月報表
- 圖表分析
- 手機底部導覽列優化
- 收據上傳
