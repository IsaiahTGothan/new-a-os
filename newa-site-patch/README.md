# newa-site: the one header

The app (opened from a file) can only read `https://newa-site.vercel.app/feed.xml` live if the site sends
`Access-Control-Allow-Origin: *` for it. The `newa-site` repository was not available in this session, so the
change is given here for you to apply:

* **vercel.json** — merge the `headers` entries from `vercel.json` in this folder into the site's `vercel.json`
  (create the file at the repo root if there is none). If the site uses Next.js, the equivalent is a `headers()`
  entry in `next.config.js` for `/feed.xml` (and `/api/markets` if that route exists).
* Nothing else on the site changes. Nothing in New A OS ever posts to the site.

Until the header is live, the Inbox still works three ways: **Import feed file**, **Read feed.xml from vault**,
or through the New A OS bridge, which fetches the feed from the computer instead of the browser (no CORS needed).
