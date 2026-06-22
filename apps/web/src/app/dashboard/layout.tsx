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
            {/* Skip link — first focusable element, lets keyboard/SR users bypass
                the sidebar nav and jump straight to the page content. */}
            <a
                href="#main"
                className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-nd-black focus:px-4 focus:py-2 focus:font-mono focus:text-nd-label focus:uppercase focus:tracking-[0.08em] focus:text-nd-text-primary focus:outline focus:outline-2 focus:outline-nd-accent"
            >
                Skip to content
            </a>
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
                        <main
                            id="main"
                            tabIndex={-1}
                            className="mx-auto w-full max-w-5xl px-nd-lg lg:px-nd-2xl py-nd-2xl focus:outline-none"
                        >
                            {children}
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}
