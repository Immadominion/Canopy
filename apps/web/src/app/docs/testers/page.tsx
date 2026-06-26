export default function TestersDocs() {
    return (
        <>
            <h1>Add testers and share</h1>
            <p>
                Only wallets you allow can install your build. So you add your testers by wallet
                address, then send them the install link. The link is the same for everyone, but only
                allowed wallets can install. That keeps your beta private.
            </p>

            <h2>Add testers</h2>
            <ol>
                <li>Open the build&apos;s page.</li>
                <li>Paste your testers&apos; wallet addresses, separated by commas or new lines.</li>
                <li>They are added to the allowlist for that build.</li>
            </ol>

            <h2>Reuse a list across builds</h2>
            <p>
                If you test often, make a <strong>tester group</strong>, a saved list of wallets, under
                Tester Groups in the dashboard. Then on any build, click <strong>Add from group</strong>{" "}
                to add them all at once. No need to paste the same wallets every time. Groups work across
                all your apps.
            </p>

            <h2>Share the install link</h2>
            <p>
                On the build&apos;s page there is a <strong>Share with testers</strong> box with a Copy
                button. Send that link to your testers. They open it, sign in with their wallet, and
                install.
            </p>
            <p>Each build holds up to 200 testers.</p>
        </>
    );
}
