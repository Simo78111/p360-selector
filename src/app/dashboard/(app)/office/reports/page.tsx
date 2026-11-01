// Phase 3e: /dashboard/office/reports opens the Sales summary.
import { redirect } from "next/navigation";

export default function ReportsIndex() {
  redirect("/dashboard/office/reports/sales");
}
