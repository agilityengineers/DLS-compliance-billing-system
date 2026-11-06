// The public website's pages, as the Super Admin chooses them when placing a
// news block. One list, read by the API (which refuses any other page) and by
// the console (which offers these as checkboxes). A new page on the website is
// added here as well as to `pages` in artifacts/dls-cms/marketing-site.ts.

export const WEBSITE_PAGES = [
  { page: "index.html", label: "Home" },
  { page: "about.html", label: "Mission & Approach" },
  { page: "services.html", label: "Services" },
  { page: "contact.html", label: "Contact" },
  { page: "news.html", label: "News & Insights" },
  { page: "privacy.html", label: "Privacy" },
  { page: "accessibility.html", label: "Accessibility" },
] as const;

export type WebsitePage = (typeof WEBSITE_PAGES)[number]["page"];

export function isWebsitePage(value: string): value is WebsitePage {
  return WEBSITE_PAGES.some((p) => p.page === value);
}
