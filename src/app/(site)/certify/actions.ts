"use server";
// The certifying gasfitter signs (or marks not needed) from the link they were emailed. The token in
// the link is the only key, so each action checks it with the engine.
import { redirect } from "next/navigation";
import { gasCertNotNeeded, signGasCert, type GasCertDetails } from "@/lib/automation";

const yesNo = (v: FormDataEntryValue | null) => (v === "yes" ? true : v === "no" ? false : null);
const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();

export async function signCertificateAction(form: FormData) {
  const token = s(form, "token");
  if (!/^[a-f0-9]{32,}$/.test(token)) redirect("/");
  const details: GasCertDetails = {
    location: s(form, "location"),
    description: s(form, "description"),
    work_dates: s(form, "work_dates"),
    workers: [{ name: s(form, "worker_name") || null, reg: s(form, "worker_reg") || null, did: s(form, "worker_did") || null }],
    complies_5601: yesNo(form.get("complies_5601")),
    certified_design: yesNo(form.get("certified_design")),
    manufacturer_instructions: yesNo(form.get("manufacturer_instructions")),
    manufacturer_reference: s(form, "manufacturer_reference") || null,
    other_standards: s(form, "other_standards") || null,
    gas_type: s(form, "gas_type") || null,
    pressure: s(form, "pressure") || null,
    safe_to_connect: s(form, "safe_to_connect") || null,
    test_results: s(form, "test_results") || null,
  };
  let msg: string;
  try {
    await signGasCert(token, details, s(form, "risk"), s(form, "issuer_name"), s(form, "issuer_reg"), s(form, "auth_mark"),
                      s(form, "signed_name"), form.get("declaration") === "on");
    msg = "ok=signed";
  } catch (e) {
    msg = `err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  redirect(`/certify/${token}?${msg}`);
}

export async function notNeededAction(form: FormData) {
  const token = s(form, "token");
  if (!/^[a-f0-9]{32,}$/.test(token)) redirect("/");
  let msg: string;
  try {
    await gasCertNotNeeded(token, s(form, "reason") || "Low-risk gasfitting (reg 5A): no certificate required");
    msg = "ok=not_needed";
  } catch (e) {
    msg = `err=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`;
  }
  redirect(`/certify/${token}?${msg}`);
}
