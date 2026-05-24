/**
 * Dashboard loading state — shown while async RSC data is resolving.
 *
 * Nothing Design: no skeleton screens. Show a minimal label in Space Mono.
 * The dashboard shell (layout.tsx nav) remains visible during suspense.
 */
export default function DashboardLoading() {
    return (
        <div className="flex items-center justify-center min-h-[40vh]">
            <p className="font-mono text-nd-label text-nd-text-disabled uppercase tracking-[0.1em]">
                LOADING
            </p>
        </div>
    );
}
