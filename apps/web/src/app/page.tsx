import { redirect } from "next/navigation";

import { getSessionWallet } from "@/lib/auth/session";

/**
 * Root page — redirect to dashboard if authenticated, otherwise sign-in.
 */
export default async function RootPage() {
    const session = await getSessionWallet();
    redirect(session ? "/dashboard/apps" : "/sign-in");
}
