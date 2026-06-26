import Link from "next/link";

import { VideoEmbed } from "@/components/docs/video-embed";

export default function DocsOverview() {
    return (
        <>
            <h1>Canopy docs</h1>
            <p>
                Canopy is beta testing for Solana Mobile apps. You upload a build, pick who can install
                it by wallet, and they install it safely through the Canopy tester app. You also get
                analytics tied to wallets.
            </p>

            <VideoEmbed id="S2YpH4v1vL0" title="Get started with Canopy" caption="Watch: get started" />
            <p>
                In this short walkthrough, a tester opens the Canopy app, connects their Solana wallet,
                and asks to join a beta. Once the developer grants them access, they can install the
                build. That is the whole way in: connect, then ask to be let in.
            </p>

            <p>Pick a topic on the left, or start here:</p>
            <ul>
                <li>
                    <Link href="/docs/analytics">Send analytics</Link> from your app.
                </li>
                <li>
                    <Link href="/docs/upload">Upload a build</Link>.
                </li>
                <li>
                    <Link href="/docs/testers">Add testers and share the install link</Link>.
                </li>
                <li>
                    <Link href="/docs/installing">How testers install</Link> your app.
                </li>
            </ul>

            <h2>The short version</h2>
            <ol>
                <li>Create an app in the dashboard.</li>
                <li>Upload a build (an APK).</li>
                <li>Add your testers by wallet address, then send them the install link.</li>
                <li>To see analytics, add the Canopy SDK to your app with an API key.</li>
            </ol>

            <p>
                Pricing is on the <Link href="/pricing">pricing page</Link>. The beta side is free.
            </p>
        </>
    );
}
