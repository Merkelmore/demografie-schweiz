# Search visibility checks

The homepage stays map-first: no article section or additional map controls.
A compact footer link opens the separate methodology page. Detailed canton
results and explanations remain on optional, linked pages. Keep the homepage
free of the reading-page stylesheet so its original map and footer sizes stay intact.

Search visibility smoke paths: `/robots.txt`, `/sitemap.xml`, `/politischer-kompass`,
`/kantone/zuerich`, `/methodik`, and `/opengraph-image`. The 31 public content pages
are generated at build time from the existing reviewed compass/vote snapshots.
After changing those snapshots, rebuild to update the pages and their source dates.
Unknown canton slugs must return 404. The application permanently redirects the
WWW host to the canonical apex while preserving the requested path and query.

Run `npm run test:seo` against a running build (`SEO_BASE_URL` selects the target).
The test performs only public reads; it needs no production credential.

Owner follow-up: verify this domain in Google Search Console and Bing Webmaster
Tools through those providers' protected settings, then submit
`https://politik-kompass-schweiz.info/sitemap.xml`. Check indexing and real search
queries after crawlers revisit. Do not invent verification tokens or claim the
property is verified without checking the provider account. Search/assistant
visibility is not guaranteed and is independent of model-training inclusion.
