# Search and answer discovery

Public home and explorer pages have localized canonical/hreflang links and
Open Graph/Twitter metadata. `/opengraph-image` provides a 1200 × 630 PNG.
The four homepages render visible product FAQs and matching JSON-LD, plus
WebSite and SoftwareApplication entities. Both entities carry the name the
product is short for, All-in-One LM, as their schema.org alternateName, and the
first FAQ answer spells it out in prose, so the two names are tied together for
a reader and for an answer engine. Only released Windows support is advertised;
no ratings, rankings or performance claims are invented.

Public benchmark detail pages render their initial data on the server and
revalidate in the browser. Metadata uses each result's model, hardware, method
and workload. Request-scoped deduplication avoids duplicate database reads.
Only public fields cross the server/client boundary; owner identifiers and
measurement chunks are excluded. Deleted/missing results are 404s. Hidden
results have noindex and no server payload, while the existing authenticated
client view remains available. Database errors are not misreported as 404s.

`/sitemap.xml` contains the static localized routes. The separate, uncached
`/benchmarks/sitemap.xml` includes up to 1,000 recent public results in all four
languages with actual modification dates. It does not enumerate the entire
historical corpus; add paginated sitemaps if historical discovery grows beyond
this bound. Database outages fail that feed rather than publishing an empty
successful feed; the static sitemap remains independent.

The wildcard robots rule allows search crawlers (including AI search crawlers)
on public pages and excludes API, management and verification URLs. This does
not override hosting/CDN bot protection. AI-training policy is unchanged.

## Deployment validation

1. Set `SERVICE_ORIGIN` to the public HTTPS origin before building.
2. Check each localized page's raw HTML, canonical, share tags and JSON-LD;
   check a real public result without JavaScript and a deleted result's 404.
3. Check both sitemap URLs and the PNG URL on the deployed origin.
4. Verify site ownership in Google Search Console and Bing Webmaster Tools,
   submit both sitemaps and inspect representative URLs. These are external
   account actions and are not performed by this code change.
5. Monitor indexing, search impressions/clicks and AI referral traffic after
   deployment. Search placement and AI citations are not guaranteed.

Google's [AI feature guidance](https://developers.google.com/search/docs/appearance/ai-features)
recommends crawlable text, internal discovery and structured data that matches
visible content. There is no required AI-specific schema or text file.
FAQPage markup here describes the content; it makes no promise of a Google
FAQ rich result.
