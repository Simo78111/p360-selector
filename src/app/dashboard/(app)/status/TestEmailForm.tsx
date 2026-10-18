"use client";

import { useActionState } from "react";
import { testEmail } from "../../actions";

export function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [result, action, pending] = useActionState(testEmail, null);
  return (
    <form action={action} className="space-y-3">
      <label htmlFor="to" className="block text-sm font-medium">
        Send a test email to
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="to"
          name="to"
          type="email"
          required
          defaultValue={defaultTo}
          className="w-full min-w-0 flex-1 rounded-xl border-2 border-black/10 px-4 py-2.5 outline-none focus:border-aqua-deep"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send test email"}
        </button>
      </div>
      {result && (
        <p
          role="status"
          className={`rounded-xl p-3 text-sm break-words ${result.ok ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}
        >
          {result.ok ? "✓ " : "✕ "}
          {result.message}
        </p>
      )}
    </form>
  );
}
