import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy — Canopy",
    description: "How Canopy handles your data.",
};

const UPDATED = "June 2026";

/**
 * /privacy — Privacy Policy.
 *
 * Public page. Tailored to Canopy's actual data model: wallet-only auth, hashed
 * wallet identity, no email collected except optional team invites, on-chain
 * audit of hashes only. Template — have a lawyer review before launch.
 */
export default function PrivacyPage() {
    return (
        <main className="min-h-screen bg-nd-black px-nd-xl py-nd-2xl">
            <article className="max-w-2xl mx-auto">
                <Link
                    href="/sign-in"
                    className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.08em] hover:text-nd-text-secondary transition-colors"
                >
                    ← CANOPY
                </Link>

                <h1 className="mt-nd-xl font-mono text-nd-display-sm text-nd-text-display tracking-tight">
                    Privacy Policy
                </h1>
                <p className="mt-nd-xs font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                    LAST UPDATED: {UPDATED.toUpperCase()}
                </p>

                <div className="mt-nd-2xl space-y-nd-2xl font-body text-nd-body-sm text-nd-text-secondary leading-relaxed [&_h2]:font-mono [&_h2]:text-nd-label [&_h2]:text-nd-text-primary [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:mb-nd-sm [&_strong]:text-nd-text-primary">
                    <section>
                        <p>
                            Canopy is built to know as little about you as possible. You sign in with
                            a Solana wallet — <strong>we do not ask for your name, email, or password
                            to create an account</strong>, and we never sell data or send marketing.
                            This policy explains what we do and don&apos;t collect.
                        </p>
                    </section>

                    <section>
                        <h2>1. What we collect</h2>
                        <ul className="space-y-nd-sm list-disc pl-nd-lg">
                            <li>
                                <strong>Wallet identity (hashed).</strong> When you sign in or are
                                added as a tester, we store a one-way SHA-256 hash of your wallet
                                address — not the address in plaintext — to identify you across the
                                Service. Your public address is, by nature, visible on-chain.
                            </li>
                            <li>
                                <strong>Analytics events.</strong> If a developer integrates the
                                Canopy SDK, their app sends usage events keyed to the hashed wallet,
                                plus on-chain signals the developer chooses to capture (e.g. Seeker
                                device flag, token-tier bucket). These belong to the developer for
                                their app&apos;s analytics.
                            </li>
                            <li>
                                <strong>Beta builds.</strong> Publishers upload APK binaries, which we
                                store privately and scan for malware. Binaries are deleted after the
                                build expires or is revoked.
                            </li>
                            <li>
                                <strong>Team-invite email (optional).</strong> The <em>only</em> time
                                we handle an email address is when an organization owner invites a
                                teammate by email. It is used solely to deliver that invitation.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2>2. What we do not collect</h2>
                        <p>
                            No account email or password. No plaintext wallet addresses in our
                            database. No advertising identifiers. No marketing or behavioural-ad
                            profiles. We do not track you across other sites.
                        </p>
                    </section>

                    <section>
                        <h2>3. Optional notifications (no contact data stored)</h2>
                        <p>
                            You may optionally enable notifications (e.g. when a build finishes
                            scanning). These are delivered through a privacy-preserving provider that
                            resolves your wallet to your own encrypted contact details —
                            <strong> neither Canopy nor the provider stores your email or phone
                            number</strong>, and you can revoke this at any time. Notifications are
                            off unless you turn them on.
                        </p>
                    </section>

                    <section>
                        <h2>4. On-chain audit records</h2>
                        <p>
                            To deter abuse, we write fingerprint records (hashes and timestamps) to a
                            permanent public ledger (Arweave). These records contain
                            <strong> no personal data</strong> — no wallet addresses, no emails, no
                            build contents — only one-way hashes. Because the ledger is immutable,
                            these records cannot be deleted.
                        </p>
                    </section>

                    <section>
                        <h2>5. Service providers</h2>
                        <p>
                            We rely on infrastructure providers to operate the Service, including a
                            managed database and authentication host, object storage for APK binaries,
                            a Solana RPC/data provider, a malware-scanning service, a permanent-storage
                            network for audit records, and (if you enable it) a notifications provider.
                            Each receives only the data needed for its function.
                        </p>
                    </section>

                    <section>
                        <h2>6. Data retention</h2>
                        <p>
                            Analytics data is retained according to your plan (30 to 365 days). APK
                            binaries are deleted after build expiry or revocation. Hashed identifiers
                            and records needed for security and audit are retained as long as
                            necessary. Immutable on-chain audit hashes are permanent by design.
                        </p>
                    </section>

                    <section>
                        <h2>7. Your choices</h2>
                        <p>
                            You can disconnect your wallet at any time, decline to integrate the SDK,
                            and leave notifications off. To request deletion of data we hold about you
                            where we are able to do so (on-chain hashes excepted), contact us via the
                            channel on our site.
                        </p>
                    </section>

                    <section>
                        <h2>8. Security</h2>
                        <p>
                            Wallet download links are signed, wallet-bound, and short-lived; build
                            storage is private; and access is gated by wallet signatures. No system is
                            perfectly secure, but we design to minimise the data at risk.
                        </p>
                    </section>

                    <section>
                        <h2>9. Children</h2>
                        <p>The Service is intended for developers and is not directed at children.</p>
                    </section>

                    <section>
                        <h2>10. Changes &amp; contact</h2>
                        <p>
                            We may update this policy; the &quot;Last updated&quot; date reflects the
                            latest version. Questions? Reach the Canopy team via the contact channel on
                            our site. Canopy is an independent product and is not affiliated with
                            Solana Mobile or any wallet provider.
                        </p>
                    </section>
                </div>
            </article>
        </main>
    );
}
