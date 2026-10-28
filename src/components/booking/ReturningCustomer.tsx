"use client";
// "Booked with us before?" — mobile → 6-digit code by text → signed in. No passwords.
import { useState } from "react";
import type { CustomerProfile } from "@/lib/customer";

type Props = {
  me: CustomerProfile | null;
  onSignedIn: (p: CustomerProfile) => void;
  onSignedOut: () => void;
};

export function ReturningCustomer({ me, onSignedIn, onSignedOut }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);

  async function call(body: Record<string, string>) {
    const res = await fetch("/api/customer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
    return data;
  }

  async function sendCode() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await call({ action: "start", phone });
      if (r.status === "bad_phone") setMsg({ kind: "error", text: "Enter your NZ mobile number, e.g. 021 123 4567." });
      else if (r.status === "wait")
        setMsg({ kind: "error", text: r.retry_after_s > 60 ? "Too many codes for that number. Please try again in 15 minutes." : `Please wait ${r.retry_after_s} seconds before asking for another code.` });
      else {
        setStage("code");
        setTestCode(r.test_code ?? null);
        setMsg({ kind: "info", text: "If you've booked with us using that number, we've just texted you a 6-digit code." });
      }
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  }

  async function checkCode() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await call({ action: "verify", phone, code });
      if (r.ok) {
        onSignedIn(r.profile);
        setOpen(false);
        setStage("phone");
        setCode("");
        setTestCode(null);
      } else if (r.reason === "expired") {
        setMsg({ kind: "error", text: "That code has expired. Ask for a new one." });
        setStage("phone");
      } else if (r.reason === "too_many") {
        setMsg({ kind: "error", text: "Too many tries. Ask for a new code." });
        setStage("phone");
      } else {
        setMsg({ kind: "error", text: `That code isn't right.${r.tries_left ? ` ${r.tries_left} ${r.tries_left === 1 ? "try" : "tries"} left.` : ""}` });
      }
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
    setBusy(false);
  }

  async function signOut() {
    await call({ action: "signout" }).catch(() => {});
    onSignedOut();
  }

  if (me) {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4" role="status">
        <p>
          <strong>Welcome back, {me.first_name}.</strong>{" "}
          <span className="text-slate">Your details and saved addresses are filled in.</span>
        </p>
        <button type="button" onClick={signOut} className="text-sm font-medium text-aqua-deep hover:underline">
          Not you? Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-2xl bg-white px-5 py-4">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            <strong>Booked with us before?</strong>{" "}
            <span className="text-slate">Sign in with your mobile and skip retyping your details.</span>
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-full border-2 border-ink px-5 py-2 text-sm font-semibold hover:bg-ink hover:text-white"
          >
            I&apos;ve booked before
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy) void (stage === "phone" ? sendCode() : checkCode());
          }}
          className="space-y-3"
        >
          <p className="font-semibold">{stage === "phone" ? "Sign in with your mobile" : "Enter the code we texted you"}</p>
          {stage === "phone" ? (
            <div className="flex flex-wrap gap-2">
              <label htmlFor="signin-phone" className="sr-only">Mobile number</label>
              <input
                id="signin-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="021 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="min-w-0 flex-1 rounded-xl border-2 border-black/10 px-4 py-2.5 outline-none focus:border-aqua-deep"
              />
              <button type="submit" disabled={busy || phone.replace(/\D/g, "").length < 8} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Sending…" : "Text me a code"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <label htmlFor="signin-code" className="sr-only">6-digit code</label>
              <input
                id="signin-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-40 rounded-xl border-2 border-black/10 px-4 py-2.5 text-lg tracking-[0.3em] outline-none focus:border-aqua-deep"
              />
              <button type="submit" disabled={busy || code.length !== 6} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button type="button" onClick={() => { setStage("phone"); setMsg(null); }} className="text-sm font-medium text-slate hover:text-ink">
                Use a different number
              </button>
            </div>
          )}
          {testCode && (
            <p className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
              <strong>Test mode:</strong> texts aren&apos;t being sent yet, so here&apos;s the code: <strong>{testCode}</strong>
            </p>
          )}
          {msg && (
            <p className={`text-sm ${msg.kind === "error" ? "font-medium text-red-700" : "text-slate"}`} role={msg.kind === "error" ? "alert" : "status"}>
              {msg.text}
            </p>
          )}
          <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="text-sm text-slate hover:text-ink">
            Cancel — I&apos;ll fill it in
          </button>
        </form>
      )}
    </div>
  );
}
