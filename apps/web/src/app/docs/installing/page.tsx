export default function InstallingDocs() {
    return (
        <>
            <h1>How testers install</h1>
            <p>
                Your testers install through the Canopy tester app on their Android phone or Solana
                Seeker. This is the part that keeps installs safe: Canopy checks the build against its
                fingerprint before installing, so a fake or changed app never gets through.
            </p>

            <h2>What a tester does</h2>
            <ol>
                <li>Open the install link you sent them.</li>
                <li>Sign in with the wallet you added to the build.</li>
                <li>
                    If they do not have the Canopy app yet, it sends them to get it, then back to your
                    build.
                </li>
                <li>Tap install. The app installs.</li>
            </ol>
            <p>
                The first install asks Android to allow Canopy to install apps. That is a one time
                prompt. After that, installs are one tap.
            </p>

            <h2>Updates and feedback</h2>
            <p>
                When you upload a new build and add the same testers, or add them from a group, they see
                an Update button for it. They can also send you feedback, with a screenshot, from inside
                the tester app. You read it in the dashboard under your app&apos;s Feedback.
            </p>
        </>
    );
}
