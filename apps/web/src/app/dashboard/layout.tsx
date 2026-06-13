import { redirect } from "next/navigation";

import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { ScrollReset } from "@/components/dashboard/scroll-reset";
import { getSessionWallet } from "@/lib/auth/session";

/**
 * Dashboard layout — server component.
 *
 * Guards all /dashboard/* routes: unauthenticated requests redirect to /sign-in.
 * Left sidebar (collapsed icon rail, expands on hover / on wide screens); the
 * content is offset by the rail width (64px, 248px at xl).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await getSessionWallet();
    if (!session) {
        redirect("/sign-in");
    }

    const addr = session.walletAddress;
    const walletDisplay = `${addr.slice(0, 4)}…${addr.slice(-4)}`;

    return (
        <div className="h-dvh overflow-hidden bg-nd-shell">
            <DashboardSidebar walletDisplay={walletDisplay} />
            {/* Content offset by the rail; the inner padding is the frame gap that
                lets the dark-teal shell show around the floating panel. The panel
                itself is the scroll viewport — the frame + padding stay fixed so
                the rounded container is always fully visible. */}
            <div className="h-full pl-16 xl:pl-[248px]">
                <div className="h-full p-2 sm:p-3 pl-0 sm:pl-1">
                    <div
                        data-scroll-root
                        className="nd-scroll h-full overflow-y-auto rounded-[28px] bg-nd-black border border-nd-border"
                    >
                        <ScrollReset />
                        <main className="mx-auto w-full max-w-5xl px-nd-lg lg:px-nd-2xl py-nd-2xl">
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}
