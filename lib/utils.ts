import type { AccountType, TransactionRow, TransactionType } from "./types";

export const incomeCategories = ["學費", "晚餐費", "教材", "戶外教學", "英檢", "利息", "其他收入"];
export const expenseCategories = ["訂餐", "現金薪資", "備用金", "Ariel提取", "雜支", "退款", "其他支出"];
export const transferCategories = ["現金存入銀行", "銀行提款轉現金", "帳戶間移轉"];

export function currency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function typeLabel(type: TransactionType) {
  if (type === "income") return "收入";
  if (type === "expense") return "支出";
  return "轉帳";
}

export function accountLabel(account: AccountType) {
  if (account === "cash") return "現金";
  if (account === "bank") return "銀行";
  if (account === "cash_to_bank") return "現金 → 銀行";
  return "銀行 → 現金";
}

export function categoryOptions(type: TransactionType) {
  if (type === "income") return incomeCategories;
  if (type === "expense") return expenseCategories;
  return transferCategories;
}

export function accountOptions(type: TransactionType) {
  if (type === "transfer") {
    return [
      { value: "cash_to_bank" as const, label: "現金 → 銀行" },
      { value: "bank_to_cash" as const, label: "銀行 → 現金" }
    ];
  }

  return [
    { value: "cash" as const, label: "現金" },
    { value: "bank" as const, label: "銀行" }
  ];
}

export function getMetrics(transactions: TransactionRow[], openingCash: number, openingBank: number) {
  let cash = Number(openingCash || 0);
  let bank = Number(openingBank || 0);
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount || 0);

    if (tx.type === "income") {
      incomeTotal += amt;
      if (tx.account === "cash") cash += amt;
      if (tx.account === "bank") bank += amt;
    }

    if (tx.type === "expense") {
      expenseTotal += amt;
      if (tx.account === "cash") cash -= amt;
      if (tx.account === "bank") bank -= amt;
    }

    if (tx.type === "transfer") {
      if (tx.account === "cash_to_bank") {
        cash -= amt;
        bank += amt;
      }
      if (tx.account === "bank_to_cash") {
        bank -= amt;
        cash += amt;
      }
    }
  }

  return {
    cash,
    bank,
    total: cash + bank,
    incomeTotal,
    expenseTotal,
    net: incomeTotal - expenseTotal
  };
}

export function getSummaryRows(transactions: TransactionRow[]) {
  const rows = {
    cashIncome: 0,
    cashExpense: 0,
    bankIncome: 0,
    bankExpense: 0,
    cashToBank: 0,
    bankToCash: 0
  };

  for (const tx of transactions) {
    const amt = Number(tx.amount || 0);
    if (tx.type === "income" && tx.account === "cash") rows.cashIncome += amt;
    if (tx.type === "expense" && tx.account === "cash") rows.cashExpense += amt;
    if (tx.type === "income" && tx.account === "bank") rows.bankIncome += amt;
    if (tx.type === "expense" && tx.account === "bank") rows.bankExpense += amt;
    if (tx.type === "transfer" && tx.account === "cash_to_bank") rows.cashToBank += amt;
    if (tx.type === "transfer" && tx.account === "bank_to_cash") rows.bankToCash += amt;
  }

  return rows;
}

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = "\uFEFF" + rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}
