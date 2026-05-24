/**
 * Apps list loading state.
 * Nothing Design: no skeleton — plain label while data resolves.
 */
export default function AppsLoading() {
    return (
        <div className="flex items-center justify-center min-h-[20vh]">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.1em]">
                LOADING APPS
            </p>
        </div>
    );
}
