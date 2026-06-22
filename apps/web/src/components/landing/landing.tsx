import Link from "next/link";

import {
    ArrowRight,
    ChartLine,
    DeviceMobile,
    Fingerprint,
    Package,
    ShieldCheck,
    UploadSimple,
    Users,
    Wallet,
} from "@/components/ui/icon";

import { HeroScrub } from "./hero-scrub";
import { PageLoader } from "./page-loader";
import { RevealController } from "./reveal-controller";
import { RiveAnim } from "./rive-anim";
import { ScrubVideo } from "./scrub-video";
import styles from "./landing.module.css";

/**
 * Canopy marketing landing page. Eddie's compositional system (oversized type,
 * pill nav, scroll-scrubbed hero video, alternating solution rows, giant footer
 * wordmark) rendered in Canopy's dark-teal theme. Voice borrows TestFlight's
 * plainness: say what it does, in as few words as possible.
 */
export function Landing({ authed }: { authed: boolean }): React.JSX.Element {
    const accountHref = authed ? "/dashboard/apps" : "/sign-in";
    const accountLabel = authed ? "Dashboard" : "Sign in";

    return (
        <div className={`${styles["page"]} landing-light`}>
            <PageLoader />

            {/* announcement */}
            <div className={styles["announce"]}>
                Canopy is in private beta for Solana Mobile.{" "}
                <Link href="/sign-in">get access →</Link>
            </div>

            {/* floating pill nav */}
            <nav className={styles["nav"]}>
                <Link className={styles["brand"]} href="/">
                    <img
                        src="/canopy-mark.png"
                        alt="Canopy"
                        width={34}
                        height={34}
                        className={styles["brandMark"]}
                    />
                    <span className={styles["brandWord"]}>Canopy</span>
                </Link>
                <div className={styles["navRight"]}>
                    <a className={`${styles["navLink"]} ${styles["hideSm"]}`} href="#how">
                        How it works
                    </a>
                    <a className={`${styles["navLink"]} ${styles["hideSm"]}`} href="#solutions">
                        Product
                    </a>
                    <Link className={styles["navCta"]} href={accountHref}>
                        {accountLabel}
                    </Link>
                </div>
            </nav>

            <main>
                {/* hero */}
                <section className={`${styles["hero"]} ${styles["wrap"]}`}>
                    <h1 className={styles["h1"]}>
                        <span className={styles["row"]} data-reveal>
                            Ship your beta faster.
                        </span>
                    </h1>
                    <p
                        className={styles["sub"]}
                        data-reveal
                        style={{ "--reveal-delay": "140ms" } as React.CSSProperties}
                    >
                        Distribute private builds to wallet-allowlisted testers, verify every install
                        on-device, and see exactly who is testing.
                    </p>

                    <div
                        className={styles["pills"]}
                        data-reveal
                        style={{ "--reveal-delay": "210ms" } as React.CSSProperties}
                    >
                        <div className={styles["pill"]}>
                            <span className={styles["pillIc"]}>
                                <Wallet size={18} weight="fill" />
                            </span>
                            Wallet-allowlisted
                        </div>
                        <div className={`${styles["pill"]} ${styles["cyan"]}`}>
                            <span className={styles["pillIc"]}>
                                <Fingerprint size={18} weight="fill" />
                            </span>
                            Hash-verified installs
                        </div>
                        <div className={`${styles["pill"]} ${styles["amber"]}`}>
                            <span className={styles["pillIc"]}>
                                <ChartLine size={18} weight="fill" />
                            </span>
                            Wallet-keyed analytics
                        </div>
                    </div>
                </section>

                {/* pinned scroll-scrubbed hero video */}
                <HeroScrub src="/canopy-hero.mp4" poster="/canopy-hero-poster.jpg" />

                {/* feature band */}
                <section className={styles["bandSec"]}>
                    <div className={styles["band"]} data-reveal>
                        <div className={styles["bandLeft"]}>
                            <div className={styles["bandTop"]}>
                                <span className={styles["bandTic"]}>
                                    <ShieldCheck size={28} weight="fill" />
                                </span>
                                <h2>Beta testing for Solana Mobile, done right.</h2>
                            </div>
                            <div className={styles["bandBody"]}>
                                <h3>No sideloading links. No shadow app store.</h3>
                                <p>
                                    Canopy gets signed builds onto real devices through a verified,
                                    wallet-gated channel — so you always know who installed what, and
                                    testers know every build is exactly what you shipped.
                                </p>
                            </div>
                        </div>
                        <div className={styles["bandArt"]} aria-hidden="true">
                            <div className={styles["installCard"]}>
                                <span className={styles["installAvatar"]}>
                                    <Package size={22} weight="fill" />
                                </span>
                                <div className={styles["installMeta"]}>
                                    <div className={styles["installName"]}>Your app</div>
                                    <div className={styles["installVer"]}>1.0.1 · build 3</div>
                                </div>
                                <span className={styles["installChip"]}>INSTALL</span>
                            </div>
                            <span className={styles["verifiedTag"]}>
                                <Fingerprint size={14} weight="fill" />
                                Verified
                            </span>
                        </div>
                    </div>
                </section>

                {/* how it works */}
                <section className={styles["wrap"]} id="how">
                    <div className={styles["steps"]}>
                        <div className={styles["step"]} data-reveal>
                            <span className={styles["stepNum"]}>01</span>
                            <span className={styles["stepIc"]}>
                                <UploadSimple size={24} weight="bold" />
                            </span>
                            <h3>Upload your build</h3>
                            <p>
                                Push a signed APK to a track. Canopy fingerprints it and scans it for
                                malware before it can go live.
                            </p>
                        </div>
                        <div className={styles["step"]} data-reveal style={{ "--reveal-delay": "90ms" } as React.CSSProperties}>
                            <span className={styles["stepNum"]}>02</span>
                            <span className={styles["stepIc"]}>
                                <Users size={24} weight="bold" />
                            </span>
                            <h3>Allowlist tester wallets</h3>
                            <p>
                                Add the wallets you want testing — up to 200 per track. Access is
                                non-transferable and expires on its own.
                            </p>
                        </div>
                        <div className={styles["step"]} data-reveal style={{ "--reveal-delay": "180ms" } as React.CSSProperties}>
                            <span className={styles["stepNum"]}>03</span>
                            <span className={styles["stepIc"]}>
                                <ShieldCheck size={24} weight="bold" />
                            </span>
                            <h3>They install, verified</h3>
                            <p>
                                Testers install through the Canopy app. Every build is hash-checked on
                                the device before it opens.
                            </p>
                        </div>
                    </div>
                </section>

                {/* our solutions */}
                <section className={styles["wrap"]} id="solutions">
                    <h2 className={styles["solHead"]} data-reveal>
                        Everything to run a beta
                    </h2>

                    <article className={styles["solution"]} data-reveal>
                        <ScrubVideo
                            src="/canopy-solutions.mp4"
                            poster="/canopy-solutions-poster.jpg"
                            className={styles["solVisual"]}
                        />
                        <div>
                            <span className={`${styles["tag"]} ${styles["teal"]}`}>Distribution</span>
                            <h3>Private beta distribution</h3>
                            <p>
                                Ship a signed build to a wallet-allowlisted track. Testers install
                                through Canopy, and every APK is verified against its fingerprint
                                before it touches a device.
                            </p>
                            <a className={styles["btnDark"]} href="#how">
                                How it works <ArrowRight size={18} weight="bold" />
                            </a>
                        </div>
                    </article>

                    <article className={`${styles["solution"]} ${styles["rev"]}`} data-reveal>
                        <RiveAnim
                            src="/rive/analytics.riv"
                            className={`${styles["solVisual"]} ${styles["solVisualBare"]}`}
                        />
                        <div>
                            <span className={`${styles["tag"]} ${styles["cyan"]}`}>Analytics</span>
                            <h3>Wallet-keyed analytics</h3>
                            <p>
                                See installs, retention, and events tied to real wallets — not
                                anonymous device IDs. Know who is testing and where they drop off.
                            </p>
                            <Link className={styles["btnDark"]} href={accountHref}>
                                {accountLabel} <ArrowRight size={18} weight="bold" />
                            </Link>
                        </div>
                    </article>

                    <article className={styles["solution"]} data-reveal>
                        <RiveAnim src="/rive/secure.riv" reactOnView className={styles["solVisual"]} />
                        <div>
                            <span className={`${styles["tag"]} ${styles["amber"]}`}>Guardrails</span>
                            <h3>Safe by design</h3>
                            <p>
                                Verified-publisher gate, 200-tester cap, 30-day expiry, non-transferable
                                installs. A beta tool that cannot become a shadow app store.
                            </p>
                            <a className={styles["btnDark"]} href="#how">
                                See the guardrails <ArrowRight size={18} weight="bold" />
                            </a>
                        </div>
                    </article>
                </section>

                {/* two CTA panels */}
                <section className={styles["wrap"]} id="get">
                    <div className={styles["panels"]}>
                        <div className={`${styles["panel"]} ${styles["panelSurface"]}`} data-reveal>
                            <span className={styles["panelLabel"]}>Tester app</span>
                            <h3>Get the Canopy app</h3>
                            <p>
                                Install Canopy from the Solana dApp Store to receive and install the
                                betas you have been invited to test.
                            </p>
                            <a className={styles["btnDark"]} href="#get">
                                <DeviceMobile size={18} weight="fill" /> On the dApp Store
                            </a>
                        </div>
                        <div className={`${styles["panel"]} ${styles["panelAccent"]}`} data-reveal style={{ "--reveal-delay": "90ms" } as React.CSSProperties}>
                            <span className={styles["panelLabel"]}>For developers</span>
                            <h3>Request publisher access</h3>
                            <p>
                                Building on Solana Mobile? Connect your wallet to get access and
                                start distributing your betas through Canopy.
                            </p>
                            <Link className={styles["btnDark"]} href="/sign-in">
                                get access <ArrowRight size={18} weight="bold" />
                            </Link>
                        </div>
                    </div>
                </section>
            </main>

            {/* footer */}
            <footer className={styles["footer"]}>
                <div className={styles["wrap"]}>
                    <h2 className={styles["future"]} data-reveal>
                        Ship your beta{" "}
                        <img src="/canopy-mark.png" alt="" className={styles["futureMark"]} />{" "}
                        with confidence.
                    </h2>

                    <div className={styles["fcols"]}>
                        <div className={styles["fcol"]}>
                            <div className={styles["fbrand"]}>
                                <img
                                    src="/canopy-mark.png"
                                    alt="Canopy"
                                    width={30}
                                    height={30}
                                    className={styles["brandMark"]}
                                />
                                <span className={styles["brandWord"]}>Canopy</span>
                            </div>
                            <p className={styles["fabout"]}>
                                Developer infrastructure for Solana Mobile, built for private/public beta distribution
                                and wallet-keyed analytics for the Seeker era.
                            </p>
                        </div>
                        <div className={styles["fcol"]}>
                            <h3>Product</h3>
                            <ul>
                                <li>
                                    <a href="#how">How it works</a>
                                </li>
                                <li>
                                    <a href="#solutions">Product</a>
                                </li>
                                <li>
                                    <a href="#get">Tester app</a>
                                </li>
                            </ul>
                        </div>
                        <div className={styles["fcol"]}>
                            <h3>Resources</h3>
                            <ul>
                                <li>
                                    <Link href="/status">Status</Link>
                                </li>
                                <li>
                                    <Link href={accountHref}>{accountLabel}</Link>
                                </li>
                            </ul>
                        </div>
                        <div className={styles["fcol"]}>
                            <h3>Company</h3>
                            <ul>
                                <li>
                                    <Link href="/privacy">Privacy</Link>
                                </li>
                                <li>
                                    <Link href="/terms">Terms</Link>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className={styles["fbottom"]}>
                        <span className={styles["copyr"]}>© 2026 Canopy. All rights reserved.</span>
                        <span className={styles["builtOn"]}>Built for Solana Mobile</span>
                    </div>
                </div>
                <div className={styles["bigword"]} aria-hidden="true">
                    canopy
                </div>
            </footer>

            <RevealController />
        </div>
    );
}
