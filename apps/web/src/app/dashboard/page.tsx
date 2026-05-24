import { redirect } from "next/navigation";

/**
 * /dashboard — redirect to the default section (apps).
 */
export default function DashboardPage() {
    redirect("/dashboard/apps");
}
