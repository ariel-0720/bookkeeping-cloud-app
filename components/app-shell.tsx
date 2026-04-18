"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import type { TransactionRow, Workspace, WorkspaceSettings } from "@/lib/types";
import { accountLabel, accountOptions, categoryOptions, currency, downloadCsv, getMetrics, getSummaryRows, typeLabel } from "@/lib/utils";
import { AuthPanel } from "@/components/auth-panel";

type SessionUser = {
  id: string;
  email?: string;
};

type FilterState = {
  keyword: string;
  type: "all" | "income" | "expense" | "transfer";
  account: "all" | "cash" | "bank" | "cash_to_bank" | "bank_to_cash";
  startDate: string;
  endDate: string;
};

type FormState = {
  date: string;
  type: "income" | "expense" | "transfer";
  account: "cash" | "bank" | "cash_to_bank" | "bank_to_cash";
  category: string;
  amount: string;
  note: string;
};

const defaultFilters: FilterState = {
  keyword: "",
  type: "all",
  account: "all",
  startDate: "",
  endDate: ""
};

const defaultForm: FormState = {
  date: new Date().toISOString().slice(0, 10),
  type: "income",
  account: "cash",
  category: "學費",
  amount: "",
  note: ""
};

export function AppShell() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState<"dashboard" | "cash" | "bank" | "report">("dashboard");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "notice">("notice");
  const [loading, setLoading] = useState(false);
  const [savingBalances, setSavingBalances] = useState(false);

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null);
      setBooting(false);
    };

    void run();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    void fetchWorkspaces();
  }, [user]);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    void fetchWorkspaceData(currentWorkspaceId);
  }, [currentWorkspaceId]);

  async function fetchWorkspaces() {
    if (!user) return;

    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace:workspaces(*)")
      .eq("user_id", user.id);

    if (error) {
      showMessage(error.message, "error");
      return;
    }

    const rows = ((data ?? []).map((row: any) => row.workspace).filter(Boolean) ?? []) as Workspace[];
    setWorkspaces(rows);

    if (!currentWorkspaceId && rows.length > 0) {
      setCurrentWorkspaceId(rows[0].id);
    }
  }

  async function fetchWorkspaceData(workspaceId: string) {
    const [settingsRes, txRes] = await Promise.all([
      supabase.from("workspace_settings").select("*").eq("workspace_id", workspaceId).single(),
      supabase.from("transactions").select("*").eq("workspace_id", workspaceId).order("date", { ascending: false }).order("created_at", { ascending: false })
    ]);

    if (settingsRes.error) {
      showMessage(settingsRes.error.message, "error");
    } else {
      setSettings(settingsRes.data as WorkspaceSettings);
    }

    if (txRes.error) {
      showMessage(txRes.error.message, "error");
    } else {
      setTransactions((txRes.data ?? []) as TransactionRow[]);
    }
  }

  function showMessage(text: string, type: "success" | "error" | "notice" = "notice") {
    setMessage(text);
    setMessageType(type);
    window.clearTimeout((window as any).__msgTimer);
    (window as any).__msgTimer = window.setTimeout(() => setMessage(null), 3000);
  }

  async function createWorkspace() {
    if (!workspaceName.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("create_workspace_with_owner", {
        workspace_name_input: workspaceName.trim()
      });

      if (error) throw error;

      showMessage("工作區已建立。", "success");
      setWorkspaceName("");
      await fetchWorkspaces();
      if (data) setCurrentWorkspaceId(data);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "建立失敗", "error");
    } finally {
      setLoading(false);
    }
  }

  async function joinWorkspace() {
    if (!joinCode.trim()) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.rpc("join_workspace_by_code", {
        invite_code_input: joinCode.trim().toUpperCase()
      });

      if (error) throw error;

      showMessage("已加入工作區。", "success");
      setJoinCode("");
      await fetchWorkspaces();
      if (data) setCurrentWorkspaceId(data);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "加入失敗", "error");
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTransactions([]);
    setSettings(null);
    setWorkspaces([]);
    setCurrentWorkspaceId("");
  }

  function openCreateModal() {
    setEditingId(null);
    setForm(defaultForm);
    setModalOpen(true);
  }

  function openEditModal(tx: TransactionRow) {
    setEditingId(tx.id);
    setForm({
      date: tx.date,
      type: tx.type,
      account: tx.account,
      category: tx.category,
      amount: String(tx.amount),
      note: tx.note ?? ""
    });
    setModalOpen(true);
  }

  function handleTypeChange(nextType: FormState["type"]) {
    const nextAccounts = accountOptions(nextType);
    const nextCategories = categoryOptions(nextType);
    setForm((prev) => ({
      ...prev,
      type: nextType,
      account: nextAccounts[0].value,
      category: nextCategories[0]
    }));
  }

  async function saveTransaction() {
    if (!currentWorkspaceId) return;
    const amount = Number(form.amount);
    if (!form.date || !form.category || !amount || amount <= 0) {
      showMessage("請填寫正確的日期、分類與金額。", "error");
      return;
    }

    setLoading(true);

    const payload = {
      workspace_id: currentWorkspaceId,
      date: form.date,
      type: form.type,
      account: form.account,
      category: form.category,
      amount,
      note: form.note || null
    };

    try {
      if (editingId) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", editingId);
        if (error) throw error;
        showMessage("交易已更新。", "success");
      } else {
        const { error } = await supabase.from("transactions").insert(payload);
        if (error) throw error;
        showMessage("交易已新增。", "success");
      }

      setModalOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      await fetchWorkspaceData(currentWorkspaceId);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "儲存失敗", "error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTransaction(id: string) {
    if (!window.confirm("確定要刪除這筆交易嗎？")) return;
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      showMessage(error.message, "error");
      return;
    }
    showMessage("交易已刪除。", "success");
    await fetchWorkspaceData(currentWorkspaceId);
  }

  async function saveOpeningBalances() {
    if (!currentWorkspaceId || !settings) return;
    setSavingBalances(true);

    const { error } = await supabase
      .from("workspace_settings")
      .update({
        opening_cash: settings.opening_cash,
        opening_bank: settings.opening_bank
      })
      .eq("workspace_id", currentWorkspaceId);

    if (error) {
      showMessage(error.message, "error");
    } else {
      showMessage("期初金額已儲存。", "success");
    }

    setSavingBalances(false);
  }

  const currentWorkspace = workspaces.find((item) => item.id === currentWorkspaceId) ?? null;

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const hay = [tx.category, tx.note ?? "", accountLabel(tx.account), typeLabel(tx.type)].join(" ").toLowerCase();

      return (
        (!filters.keyword || hay.includes(filters.keyword.toLowerCase())) &&
        (filters.type === "all" || tx.type === filters.type) &&
        (filters.account === "all" || tx.account === filters.account) &&
        (!filters.startDate || tx.date >= filters.startDate) &&
        (!filters.endDate || tx.date <= filters.endDate)
      );
    });
  }, [transactions, filters]);

  const metrics = useMemo(() => {
    return getMetrics(filteredTransactions, settings?.opening_cash ?? 0, settings?.opening_bank ?? 0);
  }, [filteredTransactions, settings]);

  const summary = useMemo(() => getSummaryRows(filteredTransactions), [filteredTransactions]);

  const cashRows = filteredTransactions.filter((tx) => ["cash", "cash_to_bank", "bank_to_cash"].includes(tx.account));
  const bankRows = filteredTransactions.filter((tx) => ["bank", "cash_to_bank", "bank_to_cash"].includes(tx.account));

  const inviteCode = currentWorkspace?.invite_code ?? "";
  const categories = categoryOptions(form.type);
  const accounts = accountOptions(form.type);

  function exportTransactionsCsv() {
    const rows = [
      ["日期", "類型", "帳別", "分類", "金額", "備註"],
      ...filteredTransactions.map((tx) => [tx.date, typeLabel(tx.type), accountLabel(tx.account), tx.category, tx.amount, tx.note ?? ""])
    ];
    downloadCsv("交易明細.csv", rows);
  }

  function exportReportCsv() {
    const rows = [
      ["項目", "金額", "說明"],
      ["現金收入", summary.cashIncome, "只計現金帳收入"],
      ["現金支出", summary.cashExpense, "只計現金帳支出"],
      ["銀行收入", summary.bankIncome, "只計銀行帳收入"],
      ["銀行支出", summary.bankExpense, "只計銀行帳支出"],
      ["現金存入銀行", summary.cashToBank, "帳戶間移轉"],
      ["銀行提款轉現金", summary.bankToCash, "帳戶間移轉"],
      ["現金結餘", metrics.cash, "目前現金"],
      ["銀行結餘", metrics.bank, "目前銀行"],
      ["總資金", metrics.total, "現金 + 銀行"]
    ];
    downloadCsv("週報表.csv", rows);
  }

  if (booting) {
    return <div className="auth-wrap"><div className="notice">載入中...</div></div>;
  }

  if (!user) {
    return <AuthPanel />;
  }

  return (
    <div className="container">
      <div className="card hero">
        <div>
          <div className="pill">手機可用 · 可分享工作區 · 雲端同步</div>
          <div className="hero-title">營運記帳 APP</div>
          <div className="hero-sub">登入後可建立共享工作區，邀請其他人一起使用同一份資料。</div>
        </div>
        <div className="actions">
          <button className="btn-outline" onClick={exportTransactionsCsv}>匯出交易明細 CSV</button>
          <button className="btn-outline" onClick={exportReportCsv}>匯出週報 CSV</button>
          <button className="btn" onClick={openCreateModal} disabled={!currentWorkspaceId}>新增記帳</button>
          <button className="btn-outline" onClick={signOut}>登出</button>
        </div>
      </div>

      {message && (
        <div className={`notice ${messageType}`} style={{ marginTop: 14 }}>
          {message}
        </div>
      )}

      <div className="grid-4">
        <div className="card stat">
          <div className="stat-title">現金結餘</div>
          <div className="stat-value">{currency(metrics.cash)}</div>
          <div className="stat-hint">含現金收支與轉帳影響</div>
        </div>
        <div className="card stat">
          <div className="stat-title">銀行結餘</div>
          <div className="stat-value">{currency(metrics.bank)}</div>
          <div className="stat-hint">含帳戶收入支出與移轉</div>
        </div>
        <div className="card stat">
          <div className="stat-title">總資金</div>
          <div className="stat-value">{currency(metrics.total)}</div>
          <div className="stat-hint">現金 + 銀行</div>
        </div>
        <div className="card stat">
          <div className="stat-title">本期淨額</div>
          <div className="stat-value">{currency(metrics.net)}</div>
          <div className="stat-hint">
            收入 {currency(metrics.incomeTotal)} / 支出 {currency(metrics.expenseTotal)}
          </div>
        </div>
      </div>

      <div className="section two-col">
        <div className="card workspace-card">
          <div className="section-title">工作區</div>
          <div className="footer-note">你可以建立一個工作區，或用邀請碼加入他人的工作區。</div>

          <div className="field" style={{ marginTop: 14 }}>
            <div className="label">切換工作區</div>
            <select
              className="select"
              value={currentWorkspaceId}
              onChange={(e) => setCurrentWorkspaceId(e.target.value)}
            >
              <option value="">請選擇</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <div className="label">建立新工作區</div>
            <input className="input" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="例如：序元營運帳" />
            <div style={{ marginTop: 10 }}>
              <button className="btn" disabled={loading || !workspaceName.trim()} onClick={createWorkspace}>
                建立工作區
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 18 }}>
            <div className="label">用邀請碼加入</div>
            <input className="input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="輸入邀請碼" />
            <div style={{ marginTop: 10 }}>
              <button className="btn-outline" disabled={loading || !joinCode.trim()} onClick={joinWorkspace}>
                加入工作區
              </button>
            </div>
          </div>

          {currentWorkspace && (
            <div style={{ marginTop: 18 }}>
              <div className="label">目前工作區</div>
              <div className="code" style={{ marginTop: 8 }}>{currentWorkspace.name}</div>
              <div className="label" style={{ marginTop: 12 }}>分享邀請碼</div>
              <div className="code" style={{ marginTop: 8 }}>{inviteCode}</div>
              <div className="footer-note">把這個邀請碼給其他人，他們註冊後就能加入同一份資料。</div>
            </div>
          )}
        </div>

        <div>
          <div className="card section">
            <div className="section-head">
              <div className="section-title">篩選與搜尋</div>
            </div>
            <div className="section-content">
              <div className="filters">
                <div className="field">
                  <div className="label">關鍵字</div>
                  <input className="input" value={filters.keyword} onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))} placeholder="搜尋分類、備註、帳別" />
                </div>
                <div className="field">
                  <div className="label">類型</div>
                  <select className="select" value={filters.type} onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value as FilterState["type"] }))}>
                    <option value="all">全部</option>
                    <option value="income">收入</option>
                    <option value="expense">支出</option>
                    <option value="transfer">轉帳</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">帳別</div>
                  <select className="select" value={filters.account} onChange={(e) => setFilters((prev) => ({ ...prev, account: e.target.value as FilterState["account"] }))}>
                    <option value="all">全部</option>
                    <option value="cash">現金</option>
                    <option value="bank">銀行</option>
                    <option value="cash_to_bank">現金 → 銀行</option>
                    <option value="bank_to_cash">銀行 → 現金</option>
                  </select>
                </div>
                <div className="field">
                  <div className="label">開始日期</div>
                  <input className="input" type="date" value={filters.startDate} onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div className="field">
                  <div className="label">結束日期</div>
                  <input className="input" type="date" value={filters.endDate} onChange={(e) => setFilters((prev) => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>

              <div className="mini-actions" style={{ marginTop: 14 }}>
                <button className="btn-outline" onClick={() => setFilters(defaultFilters)}>清除篩選</button>
              </div>
            </div>
          </div>

          <div className="tabs">
            <button className={`tab ${tab === "dashboard" ? "active" : ""}`} onClick={() => setTab("dashboard")}>首頁</button>
            <button className={`tab ${tab === "cash" ? "active" : ""}`} onClick={() => setTab("cash")}>現金帳</button>
            <button className={`tab ${tab === "bank" ? "active" : ""}`} onClick={() => setTab("bank")}>銀行帳</button>
            <button className={`tab ${tab === "report" ? "active" : ""}`} onClick={() => setTab("report")}>週報</button>
          </div>

          {tab === "dashboard" && (
            <div className="card section">
              <div className="section-head">
                <div className="section-title">交易列表</div>
              </div>
              <div className="section-content table-wrap">
                <TransactionTable rows={filteredTransactions} onEdit={openEditModal} onDelete={deleteTransaction} />
              </div>
            </div>
          )}

          {tab === "cash" && (
            <div className="section two-col">
              <div className="card">
                <div className="section-head"><div className="section-title">現金帳摘要</div></div>
                <div className="section-content">
                  <SummaryList items={[
                    ["期初現金", currency(settings?.opening_cash ?? 0)],
                    ["目前現金", currency(metrics.cash)],
                    ["轉入銀行", currency(summary.cashToBank)],
                    ["銀行轉現金", currency(summary.bankToCash)]
                  ]} />
                </div>
              </div>
              <div className="card">
                <div className="section-head"><div className="section-title">現金帳明細</div></div>
                <div className="section-content table-wrap">
                  <TransactionTable rows={cashRows} onEdit={openEditModal} onDelete={deleteTransaction} />
                </div>
              </div>
            </div>
          )}

          {tab === "bank" && (
            <div className="section two-col">
              <div className="card">
                <div className="section-head"><div className="section-title">銀行帳摘要</div></div>
                <div className="section-content">
                  <SummaryList items={[
                    ["期初銀行", currency(settings?.opening_bank ?? 0)],
                    ["目前銀行", currency(metrics.bank)],
                    ["現金存入", currency(summary.cashToBank)],
                    ["提款轉現金", currency(summary.bankToCash)]
                  ]} />
                </div>
              </div>
              <div className="card">
                <div className="section-head"><div className="section-title">銀行帳明細</div></div>
                <div className="section-content table-wrap">
                  <TransactionTable rows={bankRows} onEdit={openEditModal} onDelete={deleteTransaction} />
                </div>
              </div>
            </div>
          )}

          {tab === "report" && (
            <div className="section two-col">
              <div className="card">
                <div className="section-head"><div className="section-title">本期回報表</div></div>
                <div className="section-content table-wrap">
                  <table className="table" style={{ minWidth: 620 }}>
                    <thead>
                      <tr>
                        <th>項目</th>
                        <th>金額</th>
                        <th>說明</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td data-label="項目">現金收入</td><td data-label="金額"><strong>{currency(summary.cashIncome)}</strong></td><td data-label="說明" className="muted">只計現金帳收入</td></tr>
                      <tr><td data-label="項目">現金支出</td><td data-label="金額"><strong>{currency(summary.cashExpense)}</strong></td><td data-label="說明" className="muted">只計現金帳支出</td></tr>
                      <tr><td data-label="項目">銀行收入</td><td data-label="金額"><strong>{currency(summary.bankIncome)}</strong></td><td data-label="說明" className="muted">只計銀行帳收入</td></tr>
                      <tr><td data-label="項目">銀行支出</td><td data-label="金額"><strong>{currency(summary.bankExpense)}</strong></td><td data-label="說明" className="muted">只計銀行帳支出</td></tr>
                      <tr><td data-label="項目">現金存入銀行</td><td data-label="金額"><strong>{currency(summary.cashToBank)}</strong></td><td data-label="說明" className="muted">帳戶間移轉，不列入總收入</td></tr>
                      <tr><td data-label="項目">銀行提款轉現金</td><td data-label="金額"><strong>{currency(summary.bankToCash)}</strong></td><td data-label="說明" className="muted">帳戶間移轉，不列入總收入</td></tr>
                      <tr><td data-label="項目">現金結餘</td><td data-label="金額"><strong>{currency(metrics.cash)}</strong></td><td data-label="說明" className="muted">目前現金</td></tr>
                      <tr><td data-label="項目">銀行結餘</td><td data-label="金額"><strong>{currency(metrics.bank)}</strong></td><td data-label="說明" className="muted">目前銀行</td></tr>
                      <tr><td data-label="項目"><strong>總資金</strong></td><td data-label="金額"><strong>{currency(metrics.total)}</strong></td><td data-label="說明" className="muted">現金 + 銀行合計</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="section-head"><div className="section-title">設定</div></div>
                <div className="section-content">
                  <div className="field">
                    <div className="label">期初現金</div>
                    <input
                      className="input"
                      type="number"
                      value={settings?.opening_cash ?? 0}
                      onChange={(e) => setSettings((prev) => prev ? ({ ...prev, opening_cash: Number(e.target.value || 0) }) : prev)}
                    />
                  </div>

                  <div className="field" style={{ marginTop: 12 }}>
                    <div className="label">期初銀行</div>
                    <input
                      className="input"
                      type="number"
                      value={settings?.opening_bank ?? 0}
                      onChange={(e) => setSettings((prev) => prev ? ({ ...prev, opening_bank: Number(e.target.value || 0) }) : prev)}
                    />
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <button className="btn" onClick={saveOpeningBalances} disabled={savingBalances || !settings}>
                      {savingBalances ? "儲存中..." : "儲存期初金額"}
                    </button>
                  </div>

                  <div className="footer-note">這兩個數字會影響目前現金、銀行與總資金計算。</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,.45)",
          display: "grid",
          placeItems: "center",
          padding: 20,
          zIndex: 50
        }}>
          <div className="card" style={{ width: "min(760px,100%)", padding: 22 }}>
            <div className="section-title">{editingId ? "編輯交易" : "新增一筆交易"}</div>

            <div className="filters" style={{ gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
              <div className="field">
                <div className="label">日期</div>
                <input className="input" type="date" value={form.date} onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))} />
              </div>

              <div className="field">
                <div className="label">類型</div>
                <select className="select" value={form.type} onChange={(e) => handleTypeChange(e.target.value as FormState["type"])}>
                  <option value="income">收入</option>
                  <option value="expense">支出</option>
                  <option value="transfer">轉帳</option>
                </select>
              </div>

              <div className="field">
                <div className="label">帳別</div>
                <select className="select" value={form.account} onChange={(e) => setForm((prev) => ({ ...prev, account: e.target.value as FormState["account"] }))}>
                  {accounts.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <div className="label">分類</div>
                <select className="select" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <div className="label">金額</div>
                <input className="input" type="number" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <div className="label">備註</div>
                <textarea className="textarea" value={form.note} onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))} />
              </div>
            </div>

            <div className="mini-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}>
              <button className="btn-outline" onClick={() => setModalOpen(false)}>取消</button>
              <button className="btn" onClick={saveTransaction} disabled={loading}>
                {loading ? "儲存中..." : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryList({ items }: { items: [string, string][] }) {
  return (
    <div className="summary-list">
      {items.map(([label, value]) => (
        <div key={label} className="summary-item">
          <span className="muted">{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function TransactionTable({
  rows,
  onEdit,
  onDelete
}: {
  rows: TransactionRow[];
  onEdit: (tx: TransactionRow) => void;
  onDelete: (id: string) => void;
}) {
  if (!rows.length) {
    return <div className="empty">目前沒有符合條件的資料</div>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>日期</th>
          <th>類型</th>
          <th>帳別</th>
          <th>分類</th>
          <th>金額</th>
          <th>備註</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((tx) => (
          <tr key={tx.id}>
            <td data-label="日期">{tx.date}</td>
            <td data-label="類型"><span className="badge">{typeLabel(tx.type)}</span></td>
            <td data-label="帳別">{accountLabel(tx.account)}</td>
            <td data-label="分類">{tx.category}</td>
            <td data-label="金額"><strong>{currency(tx.amount)}</strong></td>
            <td data-label="備註" className="muted">{tx.note ?? ""}</td>
            <td data-label="操作">
              <div className="mini-actions">
                <button className="btn-outline" onClick={() => onEdit(tx)}>編輯</button>
                <button className="btn-danger" onClick={() => onDelete(tx.id)}>刪除</button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
