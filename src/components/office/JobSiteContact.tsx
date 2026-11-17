"use client";
// Job page (17 Nov 2026): change, edit or add the site contact without leaving the job, and add a new site
// (Google address search) straight from Job settings. Everything saves as you go.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { jobNewSiteAction, jobSiteContactAction } from "@/app/dashboard/autosave-actions";
import { AutoSaveForm } from "./AutoSaveForm";
import { SiteFields } from "./AddressSearch";

const fieldCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const labelCls = "block text-xs font-semibold text-slate";
const darkBtn = "rounded-xl bg-[#0F172A] px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50";

type Current = { id: string; name: string; position: string | null; phone: string | null; mobile: string | null; email: string | null } | null;

export function SiteContactEditor({ jobId, customerId, siteId, current, contacts }: {
  jobId: string; customerId: string; siteId: string; current: Current;
  contacts: { id: string; name: string; position: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function send(fields: Record<string, string>, after?: () => void) {
    const f = new FormData();
    f.set("jobId", jobId);
    f.set("customerId", customerId);
    f.set("siteId", siteId);
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    start(async () => {
      const r = await jobSiteContactAction(f);
      if (!r.ok) setErr(r.error);
      else {
        setErr(null);
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tracking-normal text-sky-300 normal-case ring-1 ring-sky-300/50 hover:bg-sky-300/10" data-testid="edit-site-contact">
        {current ? "Edit" : "+ Add"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 text-left tracking-normal text-ink normal-case sm:pt-24" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Site contact" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} data-testid="site-contact-dialog">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Site contact for this job</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate hover:text-ink" aria-label="Close">✕ Close</button>
            </div>

            <div>
              <label className={labelCls} htmlFor="sc-pick">Who&apos;s the contact on site?</label>
              <select
                id="sc-pick"
                disabled={pending}
                value={adding ? "new" : current?.id ?? ""}
                onChange={(e) => {
                  if (e.target.value === "new") setAdding(true);
                  else {
                    setAdding(false);
                    send({ mode: "pick", site_contact_id: e.target.value });
                  }
                }}
                className={fieldCls}
              >
                <option value="">None</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? ` (${c.position})` : ""}</option>)}
                <option value="new">+ Add a new contact…</option>
              </select>
            </div>

            {adding ? (
              <form
                className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"
                data-testid="new-site-contact"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
                  send({ ...d, mode: "new" }, () => setAdding(false));
                }}
              >
                <Box name="full_name" text="Name" required autoFocus />
                <Box name="position" text="Position (e.g. site manager)" />
                <Box name="mobile" text="Mobile" type="tel" />
                <Box name="email" text="Email" type="email" />
                <div className="flex gap-2 sm:col-span-2">
                  <button disabled={pending} className={darkBtn}>{pending ? "Adding…" : "Add and use on this job"}</button>
                  <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate underline">Cancel</button>
                </div>
              </form>
            ) : current ? (
              <AutoSaveForm key={current.id} action={jobSiteContactAction} className="grid gap-3 sm:grid-cols-2" statusClassName="text-xs sm:col-span-2" testId="edit-site-contact-form">
                <input type="hidden" name="mode" value="edit" />
                <input type="hidden" name="jobId" value={jobId} />
                <input type="hidden" name="customerId" value={customerId} />
                <input type="hidden" name="contactId" value={current.id} />
                <Box name="full_name" text="Name" v={current.name} required />
                <Box name="position" text="Position" v={current.position} />
                <Box name="mobile" text="Mobile" v={current.mobile} type="tel" />
                <Box name="phone" text="Phone" v={current.phone} type="tel" />
                <div className="sm:col-span-2"><Box name="email" text="Email" v={current.email} type="email" /></div>
              </AutoSaveForm>
            ) : (
              <p className="text-sm text-slate">No site contact on this job. Pick one above or add a new one.</p>
            )}
            {err && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p>}
            {pending && <p className="text-xs text-slate">Saving…</p>}
            <p className="text-xs text-slate">Changes to a contact also change it on the customer&apos;s record (and any other jobs it&apos;s on).</p>
          </div>
        </div>
      )}
    </>
  );
}

function Box({ name, text, v, type = "text", required, autoFocus }: {
  name: string; text: string; v?: string | null; type?: string; required?: boolean; autoFocus?: boolean;
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={`sc-${name}`}>{text}</label>
      <input id={`sc-${name}`} name={name} type={type} defaultValue={v ?? ""} required={required} autoFocus={autoFocus} className={fieldCls} />
    </div>
  );
}

/** Job settings → "+ New site for this job": Google address search, then the job moves to that site. */
export function JobNewSite({ jobId, customerId }: { jobId: string; customerId: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 text-sm font-semibold text-aqua-deep" data-testid="job-new-site">
        + New site for this job
      </button>
    );
  }
  return (
    <form
      className="mt-3 space-y-3 rounded-2xl border-2 border-dashed border-aqua/60 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        f.set("jobId", jobId);
        f.set("customerId", customerId);
        start(async () => {
          const r = await jobNewSiteAction(f);
          setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <h3 className="font-semibold">New site for this job</h3>
      <SiteFields idPrefix="jns-" required autoFocus />
      <div className="flex gap-2">
        <button disabled={pending} className={darkBtn}>{pending ? "Adding…" : "Add site and use it"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate underline">Cancel</button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>{msg.text}</p>}
    </form>
  );
}
