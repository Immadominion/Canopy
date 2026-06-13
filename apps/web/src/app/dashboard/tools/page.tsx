import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Tools & Testers",
};

/**
 * /dashboard/tools — the ecosystem hub.
 *
 * Canopy is the private beta + analytics layer; it deliberately points *outward*
 * to best-in-class complementary tools rather than rebuilding them. Two parts:
 *   1. Find testers — recruit/pay testers via gib.work (Canopy keeps the beta
 *      private; the bounty fills the allowlist). This is the answer to "how do
 *      people discover my app to test" WITHOUT a public/open testing track.
 *   2. Recommended tools — curated complementary dev tools.
 *
 * Curated, static list — edit the arrays below to add/remove entries.
 */

interface Tool {
    name: string;
    url: string;
    tag: string;
    description: string;
    icon: string;
}

const FIND_TESTERS: Tool = {
    name: "gib.work",
    url: "https://gib.work",
    icon: "/tools/gib-work.png",
    tag: "BOUNTIES",
    description:
        "Post a bounty to recruit testers and collect paid, high-signal feedback — escrowed on Solana, no escrow code for you to write. Canopy keeps your beta private and wallet-allowlisted; gib.work helps you find the wallets to fill it.",
};

const RECOMMENDED_TOOLS: Tool[] = [
    {
        name: "Herald",
        url: "https://notify.useherald.xyz/register",
        icon: "/tools/herald.png",
        tag: "NOTIFICATIONS",
        description:
            "Privacy-preserving notifications by wallet. Canopy can alert you when a build finishes scanning — with no email stored by Canopy or Herald. Connect the same wallet you use here to opt in.",
    },
    {
        name: "Helius",
        url: "https://helius.dev",
        icon: "/tools/helius.png",
        tag: "RPC & DATA",
        description:
            "Solana RPC plus the DAS API for NFTs and on-chain state — the same data layer Canopy uses under the hood to resolve wallet cohorts (Genesis, SKR tiers).",
    },
    {
        name: "Dialect",
        url: "https://dialect.to",
        icon: "/tools/dialect.png",
        tag: "MESSAGING",
        description:
            "On-chain messaging, notifications, and Blinks for reaching wallets directly — a complement to in-app analytics for closing the loop with users.",
    },
];

function ToolCard({ tool }: { tool: Tool }) {
    return (
        <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block border border-nd-border hover:border-nd-text-disabled transition-colors p-nd-lg rounded-lg"
        >
            <div className="flex items-center justify-between gap-nd-md mb-nd-sm">
                <span className="flex items-center gap-nd-sm min-w-0">
                    <Image
                        src={tool.icon}
                        alt=""
                        width={20}
                        height={20}
                        className="shrink-0 rounded-sm"
                        unoptimized
                    />
                    <span className="font-body text-nd-body text-nd-text-primary group-hover:text-nd-text-display transition-colors truncate">
                        {tool.name}
                    </span>
                </span>
                <span className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] shrink-0">
                    {tool.tag}
                </span>
            </div>
            <p className="font-body text-nd-body-sm text-nd-text-secondary leading-snug">
                {tool.description}
            </p>
            <span className="mt-nd-md inline-block font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] group-hover:text-nd-text-secondary transition-colors">
                {tool.url.replace(/^https?:\/\//, "")} →
            </span>
        </a>
    );
}

export default function ToolsPage() {
    return (
        <div className="max-w-3xl mx-auto">
            {/* ── Layer 1: header ── */}
            <div className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-xs">
                    TOOLS &amp; TESTERS
                </p>
                <p className="font-body text-nd-body text-nd-text-secondary max-w-xl">
                    Canopy handles private beta distribution and wallet-keyed analytics. For the
                    rest of your stack, here are tools we recommend — and where to find testers.
                </p>
            </div>

            {/* ── Find testers ── */}
            <section className="mb-nd-2xl">
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg border-b border-nd-border pb-nd-sm">
                    FIND TESTERS
                </p>
                <p className="font-body text-nd-body-sm text-nd-text-secondary mb-nd-lg max-w-xl">
                    Canopy tracks are private and wallet-allowlisted by design — there is no public
                    “open testing.” To recruit testers or pay for structured feedback, post a bounty
                    and add the wallets that claim it to your track&apos;s allowlist.
                </p>
                <ToolCard tool={FIND_TESTERS} />
            </section>

            {/* ── Recommended tools ── */}
            <section>
                <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] mb-nd-lg border-b border-nd-border pb-nd-sm">
                    RECOMMENDED TOOLS
                </p>
                <div className="grid gap-nd-md">
                    {RECOMMENDED_TOOLS.map((tool) => (
                        <ToolCard key={tool.url} tool={tool} />
                    ))}
                </div>
                <p className="mt-nd-xl font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                    Curated suggestions — not affiliated with or endorsed by Canopy.
                </p>
            </section>
        </div>
    );
}
