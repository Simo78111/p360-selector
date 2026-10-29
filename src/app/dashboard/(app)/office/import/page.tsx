import { EngineError, NotConnected } from "@/components/office/bits";
import { FergusImport } from "@/components/office/FergusImport";
import { loadCompanies, loadImports, type Company, type ImportRun } from "@/lib/jm";
import { officeEnabled } from "@/lib/office";

export const metadata = { title: "Import from Fergus" };

export default async function ImportPage() {
  if (!officeEnabled()) return <NotConnected />;
  let companies: Company[];
  let runs: (ImportRun & { company: string })[];
  try {
    companies = await loadCompanies();
    runs = (await Promise.all(companies.map(async (c) => (await loadImports(c.id)).map((r) => ({ ...r, company: c.name })))))
      .flat()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 20);
  } catch (e) {
    return <EngineError message={e instanceof Error ? e.message : String(e)} />;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import from Fergus</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate">
          Export each list from Fergus as a CSV and bring them in, in this order: <strong>customers</strong>, then{" "}
          <strong>sites</strong>, then <strong>contacts</strong>, then <strong>tier prices</strong>. &ldquo;Check first&rdquo;
          shows what would change without saving anything. Importing the same file again updates records instead of making
          duplicates.
        </p>
      </div>
      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <FergusImport companies={companies.map((c) => ({ id: c.id, name: c.name }))} />
      </section>
      <section className="rounded-2xl bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold">Recent imports</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Nothing imported yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-slate"><tr><th className="py-1">When</th><th>Company</th><th>What</th><th className="text-right">New</th><th className="text-right">Updated</th><th className="text-right">Skipped</th></tr></thead>
            <tbody className="divide-y divide-black/5">
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5">{new Date(r.created_at).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" })}</td>
                  <td>{r.company}</td>
                  <td>{r.kind.replace("_", " ")}{r.file_name && <span className="block text-xs text-slate">{r.file_name}</span>}</td>
                  <td className="text-right">{r.added}</td>
                  <td className="text-right">{r.updated}</td>
                  <td className="text-right">{r.skipped}{r.problem_count > 0 && <span className="block text-xs text-amber-800">{r.problem_count} notes</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
