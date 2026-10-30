"use client";

import { useActionState } from "react";
import { login, staffLogin } from "../actions";

const field = "w-full rounded-xl border-2 border-black/10 px-4 py-3 outline-none focus:border-aqua-deep";
const button = "w-full rounded-full bg-ink px-6 py-3 font-semibold text-white hover:bg-slate disabled:opacity-60";

/** Staff: the same email and password as the plumber app. */
export function StaffLoginForm() {
  const [error, action, pending] = useActionState(staffLogin, null);
  return (
    <form action={action} className="mt-6 space-y-4" data-testid="staff-login">
      <div>
        <label htmlFor="email" className="mb-2 block font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required autoFocus className={field} />
      </div>
      <div>
        <label htmlFor="staff-password" className="mb-2 block font-medium">Password</label>
        <input id="staff-password" name="password" type="password" autoComplete="current-password" required className={field} />
      </div>
      {error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

/** The owner's backup password (DASHBOARD_PASSWORD). */
export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-4 space-y-4" data-testid="owner-login">
      <div>
        <label htmlFor="password" className="mb-2 block font-medium">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
      </div>
      {error && (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
