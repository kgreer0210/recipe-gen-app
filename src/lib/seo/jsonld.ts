export type JsonLd = Record<string, unknown>;

export type FaqItem = {
  question: string;
  answer: string;
};

export function organizationJsonLd(params: {
  siteUrl: string;
  name?: string;
  logoPath?: string;
}): JsonLd {
  const name = params.name ?? "Mise AI";
  const logoPath = params.logoPath ?? "/favicon.ico";

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: params.siteUrl,
    logo: `${params.siteUrl}${logoPath}`,
  };
}

export function websiteJsonLd(params: { siteUrl: string; name?: string }): JsonLd {
  const name = params.name ?? "Mise AI";

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: params.siteUrl,
    // Optional: some crawlers/AI systems use this to understand intent, even without a site search UI.
    potentialAction: {
      "@type": "SearchAction",
      target: `${params.siteUrl}/?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function faqPageJsonLd(params: { pageUrl: string; faqs: FaqItem[] }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: params.faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.answer,
      },
    })),
    url: params.pageUrl,
  };
}

