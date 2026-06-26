import styles from "./video-embed.module.css";

/**
 * Responsive YouTube embed for the docs.
 *
 * Pass `id` = the YouTube video id (the part after `youtu.be/` or `watch?v=` in
 * the share URL — e.g. https://youtu.be/S2YpH4v1vL0 -> "S2YpH4v1vL0"). Uses the
 * privacy-friendly youtube-nocookie host. NOTE: the CSP in next.config.ts must
 * allow youtube-nocookie.com in `frame-src` or the player will be blocked.
 */
export function VideoEmbed({
    id,
    title,
    caption,
}: {
    id: string;
    title: string;
    caption?: string;
}) {
    return (
        <figure className={styles["wrap"]}>
            {caption ? <figcaption className={styles["caption"]}>{caption}</figcaption> : null}
            <div className={styles["frame"]}>
                <iframe
                    src={`https://www.youtube-nocookie.com/embed/${id}`}
                    title={title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    loading="lazy"
                />
            </div>
        </figure>
    );
}
