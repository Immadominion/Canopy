import { VideoEmbed } from "@/components/docs/video-embed";

const PROVIDER_SNIPPET = `import { CanopyProvider } from "@canopy/react-native";

export default function App() {
  return (
    <CanopyProvider config={{
      apiKey: "cnp_live_...",
      appId: "your-app-id",
    }}>
      {/* your app */}
    </CanopyProvider>
  );
}`;

const TRACK_SNIPPET = `import { useCanopy } from "@canopy/react-native";

function Screen() {
  const { track, identify } = useCanopy();

  // Tie events to a wallet. The address is hashed on the
  // device, so the plain address is never sent to us.
  identify(walletAddress);

  track("swap_done", { amount: 10 });
}`;

export default function AnalyticsDocs() {
    return (
        <>
            <h1>Send analytics</h1>
            <p>
                Analytics come from <strong>your own app</strong>, not from Canopy and not from the
                tester app. Your app sends events to Canopy as people use it. Installing a build does
                not create analytics by itself.
            </p>

            <VideoEmbed
                id="jSc19XFcoDE"
                title="Canopy analytics in action"
                caption="Watch: analytics in action"
            />
            <p>
                The video shows the analytics dashboard once events are flowing: active wallets, event
                counts, and trends, all tied to wallets. Addresses are hashed on the device, so we never
                see the plain address. Here is how to set it up for your own app.
            </p>
            <p>
                You need two things: an <strong>API key</strong> and your <strong>app ID</strong>.
                Then you add the Canopy SDK to your app.
            </p>

            <h2>1. Get an API key</h2>
            <p>
                In the dashboard, go to <strong>Settings, then API Keys</strong>, and create a key. It
                looks like <code>cnp_live_...</code>. Copy it right away. You only see it once.
            </p>

            <h2>2. Get your app ID</h2>
            <p>
                Open your app in the dashboard. The app ID is the long id in the address bar, the part
                after <code>/apps/</code>. Copy it.
            </p>

            <h2>3. Add the SDK</h2>
            <p>Add the package to your React Native app:</p>
            <pre>
                <code>npm install @canopy/react-native</code>
            </pre>
            <p>Wrap your app with the provider and pass your key and app ID:</p>
            <pre>
                <code>{PROVIDER_SNIPPET}</code>
            </pre>

            <h2>4. Track events</h2>
            <p>
                An <code>app_open</code> event is sent for you when the app starts. To send your own
                events, use the hook:
            </p>
            <pre>
                <code>{TRACK_SNIPPET}</code>
            </pre>

            <h2>When will I see data?</h2>
            <p>
                Ship a build with the SDK in it and use the app. Events show up in the dashboard under
                your app&apos;s Analytics within about a minute.
            </p>
            <p>
                If you still see nothing, check that the API key is correct and not revoked, and that
                the app ID matches the app you are looking at.
            </p>
        </>
    );
}
