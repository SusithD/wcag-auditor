export function splitSite(site: string): { host: string; path: string } {
  if (site.startsWith("/")) {
    const last = site.split("/").filter(Boolean).slice(-1)[0] ?? site;
    return { host: last, path: "" };
  }
  const slash = site.indexOf("/");
  if (slash === -1) return { host: site, path: "" };
  return { host: site.slice(0, slash), path: site.slice(slash) };
}

export function siteLabel(site: string): string {
  const { host, path } = splitSite(site);
  return `${host}${path}`;
}
