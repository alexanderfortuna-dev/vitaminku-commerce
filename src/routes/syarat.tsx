import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/LegalPage";
import { LEGAL_DOCS } from "@/lib/legal-content";

const doc = LEGAL_DOCS.syarat;

export const Route = createFileRoute("/syarat")({
  head: () => ({
    meta: [
      { title: `${doc.title} — VitaminKu` },
      { name: "description", content: doc.description },
      { property: "og:title", content: `${doc.title} — VitaminKu` },
      { property: "og:description", content: doc.description },
      { property: "og:url", content: "/syarat" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/syarat" }],
  }),
  component: () => <LegalPage doc={doc} />,
});
