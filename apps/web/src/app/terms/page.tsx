import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service — Canopy",
    description: "The terms governing your use of Canopy.",
};

const UPDATED = "June 2026";

/**
 * /terms — Terms of Service.
 *
 * Public page (no auth). Linked from the sign-in screen: connecting a wallet
 * constitutes acceptance. NOTE: this is a starting-point template tailored to
 * Canopy's actual architecture — have a lawyer review before launch.
 */
export default function TermsPage() {
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
                    Terms of Service
                </h1>
                <p className="mt-nd-xs font-mono text-nd-caption text-nd-text-disabled tracking-[0.04em]">
                    LAST UPDATED: {UPDATED.toUpperCase()}
                </p>

                <div className="mt-nd-2xl space-y-nd-2xl font-body text-nd-body-sm text-nd-text-secondary leading-relaxed [&_h2]:font-mono [&_h2]:text-nd-label [&_h2]:text-nd-text-primary [&_h2]:uppercase [&_h2]:tracking-[0.08em] [&_h2]:mb-nd-sm [&_strong]:text-nd-text-primary">
                    <section>
                        <p>
                            These Terms of Service (&quot;Terms&quot;) govern your access to and use
                            of Canopy (the &quot;Service&quot;), a developer-operations platform for
                            distributing pre-release Android applications to wallet-allowlisted
                            testers and for analytics tied to on-chain identity on Solana Mobile.
                            <strong> By connecting a Solana wallet and signing in, you agree to these
                            Terms and to our </strong>
                            <Link href="/privacy" className="text-nd-text-primary underline">
                                Privacy Policy
                            </Link>
                            . If you do not agree, do not use the Service.
                        </p>
                    </section>

                    <section>
                        <h2>1. The Service</h2>
                        <p>
                            Canopy lets verified Solana Mobile app publishers distribute beta builds
                            to a private, wallet-allowlisted set of testers, and provides analytics
                            keyed to hashed wallet identity. Canopy is a testing and operations tool —
                            <strong> it is not an app store and is not a substitute for the Solana
                            dApp Store review process.</strong> Beta tracks are private, capped, and
                            time-limited by design.
                        </p>
                    </section>

                    <section>
                        <h2>2. Accounts &amp; Authentication</h2>
                        <p>
                            Authentication is performed by signing a message with your Solana wallet
                            (Sign-In With Solana). We do not use passwords and do not collect an email
                            address to create an account. You are responsible for safeguarding your
                            wallet and its private keys; anyone who controls your wallet can act as
                            you. You must be of legal age to enter a contract in your jurisdiction.
                        </p>
                    </section>

                    <section>
                        <h2>3. Publisher Eligibility</h2>
                        <p>
                            Creating beta tracks requires an approved publisher account. Approval is
                            granted at Canopy&apos;s discretion and may be revoked. You represent that
                            you have all necessary rights to the applications and content you upload,
                            and that distributing them does not infringe any third party&apos;s rights
                            or violate any law or platform policy (including the Solana dApp Store
                            developer terms).
                        </p>
                    </section>

                    <section>
                        <h2>4. Acceptable Use</h2>
                        <p>You agree not to use the Service to:</p>
                        <ul className="mt-nd-sm space-y-nd-2xs list-disc pl-nd-lg">
                            <li>
                                operate a public or shadow application store, or distribute builds
                                publicly, permanently, or to anyone outside an allowlisted tester set;
                            </li>
                            <li>
                                upload malware, or any application you lack the rights to distribute;
                            </li>
                            <li>
                                circumvent the tester cap (200), the build-expiry limit (30 days), the
                                wallet-allowlist requirement, or any other technical safeguard;
                            </li>
                            <li>
                                attempt to access another party&apos;s account, data, builds, or
                                analytics, or probe, scan, or disrupt the Service.
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2>5. Beta Builds &amp; Testers</h2>
                        <p>
                            Beta builds are scanned for malware before activation and are stored
                            privately. Download links are wallet-bound, short-lived, and
                            non-transferable. Builds expire automatically (default 14 days, maximum
                            30) and their binaries are deleted from storage after expiry or
                            revocation. As a tester, you receive pre-release software &quot;as
                            is&quot; from the publisher, not from Canopy; Canopy does not endorse or
                            warrant any third-party build.
                        </p>
                    </section>

                    <section>
                        <h2>6. Immutable Audit Records</h2>
                        <p>
                            To deter abuse, Canopy writes non-reversible fingerprint records (hashes
                            and timestamps — never wallet addresses or build contents) to a permanent
                            public ledger (Arweave). These records are immutable and cannot be deleted.
                            They contain no personal data.
                        </p>
                    </section>

                    <section>
                        <h2>7. Paid Plans &amp; Payment</h2>
                        <p>
                            Paid plans are billed in USDC on Solana. A payment extends your plan for a
                            fixed period; there is no automatic renewal — you pay again to extend. On-
                            chain payments are final and irreversible; refunds, if any, are at
                            Canopy&apos;s discretion and processed as a new transaction. You are
                            responsible for your own taxes.
                        </p>
                    </section>

                    <section>
                        <h2>8. Intellectual Property</h2>
                        <p>
                            You retain all rights to the applications, content, and data you upload.
                            You grant Canopy a limited licence to host, process, scan, and deliver
                            them solely to operate the Service. Canopy and its trademarks remain the
                            property of their respective owners.
                        </p>
                    </section>

                    <section>
                        <h2>9. Disclaimers &amp; Limitation of Liability</h2>
                        <p>
                            The Service is provided &quot;as is&quot; and &quot;as available&quot;
                            without warranties of any kind. To the maximum extent permitted by law,
                            Canopy is not liable for any indirect, incidental, or consequential
                            damages, or for loss of data, builds, profits, or crypto assets arising
                            from your use of the Service. Canopy is an independent product and is
                            <strong> not affiliated with, endorsed by, or sponsored by Solana Mobile,
                            the Solana Foundation, or any wallet provider.</strong>
                        </p>
                    </section>

                    <section>
                        <h2>10. Termination</h2>
                        <p>
                            You may stop using the Service at any time. We may suspend or terminate
                            access that violates these Terms or that we reasonably believe is harmful.
                        </p>
                    </section>

                    <section>
                        <h2>11. Changes</h2>
                        <p>
                            We may update these Terms. Material changes will be reflected by the
                            &quot;Last updated&quot; date above; continued use after changes
                            constitutes acceptance.
                        </p>
                    </section>

                    <section>
                        <h2>12. Contact</h2>
                        <p>
                            Questions about these Terms? Reach the Canopy team via the contact channel
                            listed on our site.
                        </p>
                    </section>
                </div>
            </article>
        </main>
    );
}
