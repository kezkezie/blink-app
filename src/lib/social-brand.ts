/**
 * Social accounts belong to one brand (Kezie, 2026-10-20: "it has to be based on the brand... you're
 * supposed to post it on that brand's account"). Post For Me only knows each connection by the
 * external id we give it; it used to be the account (client), so a sync copied every connected
 * account into whichever brand was open. Now new connections carry "<client>:<brand>". Older ones
 * (client only) stay with the brand that already has them, or with the only brand there is.
 */
export const brandTag = (clientId: string, brandId: string) => `${clientId}:${brandId}`;

export type ProviderAccount = { id: string; external_id?: string; status?: string; platform?: string; provider?: string; username?: string; name?: string };

export function accountsForBrand(all: ProviderAccount[], i: { clientId: string; brandId: string; knownIds: string[]; onlyBrand: boolean }): ProviderAccount[] {
  const known = new Set(i.knownIds);
  return all.filter((a) => {
    if (a.status === "disconnected" || a.status === "revoked" || typeof a.id !== "string") return false;
    if (a.external_id === brandTag(i.clientId, i.brandId)) return true;
    // A connection from before brand tags: kept where it already is, or on a one-brand account.
    return a.external_id === i.clientId && (known.has(a.id) || i.onlyBrand);
  });
}
