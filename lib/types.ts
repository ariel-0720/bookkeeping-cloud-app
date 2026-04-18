export type TransactionType = "income" | "expense" | "transfer";
export type AccountType = "cash" | "bank" | "cash_to_bank" | "bank_to_cash";

export type Workspace = {
  id: string;
  name: string;
  invite_code: string;
  owner_user_id: string;
  created_at: string;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "member";
  created_at: string;
};

export type Profile = {
  id: string;
  display_name: string | null;
  created_at: string;
};

export type WorkspaceSettings = {
  workspace_id: string;
  opening_cash: number;
  opening_bank: number;
  updated_at: string;
};

export type TransactionRow = {
  id: string;
  workspace_id: string;
  date: string;
  type: TransactionType;
  account: AccountType;
  category: string;
  amount: number;
  note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
