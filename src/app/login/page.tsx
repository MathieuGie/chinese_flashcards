"use client";
import { useState } from "react";
import { api } from "@/lib/client";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/login", { method: "POST", json: { password } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form onSubmit={submit} className="panel max-w-sm mx-auto mt-24 p-6 flex flex-col gap-3">
      <div className="font-hanzi text-3xl font-bold text-seal text-center">字卡</div>
      <input type="password" className="input" placeholder="Password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <div className="text-seal text-sm">{error}</div>}
      <button className="btn-primary">Enter</button>
    </form>
  );
}
