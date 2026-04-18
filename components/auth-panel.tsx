"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Mode = "signin" | "signup";

export function AuthPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"error" | "success" | "notice">("notice");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setMessage(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName || null
            }
          }
        });

        if (error) throw error;

        setMessageType("success");
        setMessage("註冊成功。若你的 Supabase 啟用了 Email 驗證，請先去信箱確認後再登入。");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        setMessageType("success");
        setMessage("登入成功。");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "發生錯誤";
      setMessageType("error");
      setMessage(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="pill">雲端同步 · 手機可用 · 可分享給他人</div>
        <div className="auth-title">營運記帳 APP</div>
        <div className="hero-sub">先登入帳號，再建立或加入共享工作區。</div>

        <div className="section" style={{ marginTop: 18 }}>
          <div className="mini-actions">
            <button className={`btn ${mode === "signin" ? "" : "btn-outline"}`} onClick={() => setMode("signin")}>
              登入
            </button>
            <button className={`btn ${mode === "signup" ? "" : "btn-outline"}`} onClick={() => setMode("signup")}>
              註冊
            </button>
          </div>
        </div>

        <div className="section">
          <div className="field">
            <div className="label">Email</div>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          {mode === "signup" && (
            <div className="field" style={{ marginTop: 12 }}>
              <div className="label">顯示名稱</div>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
          )}
          <div className="field" style={{ marginTop: 12 }}>
            <div className="label">密碼</div>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
          </div>

          {message && (
            <div className={`notice ${messageType}`} style={{ marginTop: 14 }}>
              {message}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={loading || !email || !password} onClick={handleSubmit}>
              {loading ? "處理中..." : mode === "signup" ? "建立帳號" : "登入"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
