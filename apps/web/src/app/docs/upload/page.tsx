export default function UploadDocs() {
    return (
        <>
            <h1>Upload a build</h1>
            <p>
                A build is one APK. Each build gets its own page where you add testers and share an
                install link.
            </p>

            <h2>From the dashboard</h2>
            <ol>
                <li>
                    Open your app and click <strong>Upload build</strong>.
                </li>
                <li>Pick your APK file. Canopy reads the version straight from it.</li>
                <li>Submit. Canopy scans the build for malware before it goes live.</li>
            </ol>
            <p>When the scan passes, the build becomes active and you can add testers.</p>

            <h2>From CI</h2>
            <p>
                You can also upload from a pipeline with the Canopy CLI or the GitHub Action. Both use
                an API key, which you make under <strong>Settings, then API Keys</strong>. This is handy
                if you want every new build to go out to testers automatically.
            </p>

            <h2>Expiry</h2>
            <p>
                A build expires after the number of days you set, up to 30. After it expires the APK is
                removed and testers can no longer install it. Upload a new build to keep testing.
            </p>
        </>
    );
}
