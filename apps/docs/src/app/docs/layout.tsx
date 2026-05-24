import type { ReactNode } from "react";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { source } from "@/lib/source";

const baseOptions: BaseLayoutProps = {
    nav: {
        title: "Canopy Docs",
        url: "/",
    },
    links: [
        {
            type: "main",
            text: "Documentation",
            url: "/docs",
            active: "nested-url",
        },
        {
            type: "main",
            text: "API Reference",
            url: "/docs/api-reference",
            active: "nested-url",
        },
    ],
    githubUrl: "https://github.com/canopy-devops/canopy",
};

export default function DocsRootLayout({ children }: { children: ReactNode }) {
    return (
        <DocsLayout tree={source.getPageTree()} {...baseOptions}>
            {children}
        </DocsLayout>
    );
}
