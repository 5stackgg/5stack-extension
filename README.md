# 5Stack Match Importer

A Chrome extension that imports FACEIT and Leetify matches into your 5Stack
panel from the page you are looking at. The match does not have to be yours.
It is separate from the 5Stack web app, which it imports into.

Click its icon on any of these and a side panel lists every match on the page
that has a demo, marks the ones already in your panel, and imports the ones you
played in. The panel refuses anyone else's match (administrators excepted), and
the icon's badge counts your own matches that are not in 5Stack yet.

| Page | What it finds |
| --- | --- |
| FACEIT match room (`faceit.com/…/cs2/room/1-…`) | That match, every map of a series |
| FACEIT player (`faceit.com/…/players/<nickname>…`) | Their last 20 CS2 5v5 matches |
| Leetify profile (`leetify.com/app/profile/<steam64>`) | Their recent Valve matchmaking and FACEIT matches |
| Leetify match (`leetify.com/app/match-details/<id>`) | That match |

## How it works

**Your 5Stack login.** The extension calls your panel's `/extension/*` routes
with the panel's own session cookie. It holds host permission for the panel, so
Chrome treats those calls as same-site and sends the cookie; there is no token
to copy. Log out of 5Stack and the extension is logged out too. Self-hosted
panels work: type the panel's address once and Chrome asks for access to that
one host.

**FACEIT demos.** FACEIT only hands out a demo to a logged-in user who passes
its Cloudflare Turnstile check, the same thing its "Watch demo" button does.
The extension does exactly that inside a faceit.com tab, using your FACEIT
login: it reads the match from FACEIT's own API, renders FACEIT's Turnstile
widget (it usually passes without a click; when it wants one it shows at the
bottom right of the FACEIT tab), asks FACEIT for a signed download link, and
sends that link to your panel. Links last five minutes, so demos are signed and
sent one at a time, and the panel starts downloading at once. Any faceit.com
tab will do; from a Leetify page the extension uses an open FACEIT tab or
opens one in the background.

**Valve demos (from Leetify).** Leetify's public API gives each matchmaking
match's share code. The extension sends the codes to your panel, which imports
them the same way as a share code pasted into 5Stack.

The panel checks every FACEIT link against FACEIT's own record of the match
before downloading it, so it only ever fetches that match's demo from FACEIT's
storage.

## Panel requirements

- `/extension` routed to the api on the web domain (5stack-panel).
- **External matches** turned on in the panel's application settings.
- FACEIT imports: a FACEIT Data API key (`FACEIT_API_KEY`), which the panel
  uses to check each demo link. Neither the Downloads API approval nor the
  **FACEIT import** switch (that one runs the automatic poller) is needed.
- Valve imports: the Steam game coordinator configured, as for share codes.
- Each user can import 30 demos an hour.

## Develop

```sh
yarn install
yarn dev        # opens Chrome with the extension loaded and reloading
yarn typecheck
yarn test
yarn build      # .output/chrome-mv3, load it unpacked from chrome://extensions
yarn zip        # .output/5stack-extension-<version>-chrome.zip
```

To try it against a local panel, enter `localhost:3000` (or wherever the web
app runs) as the panel address.

## Release

Bump `version` in `package.json` on `main`. The `extension` workflow builds the
zip and submits it to the Chrome Web Store (see `STORE.md`). A version bumped
while another is still in review waits for the next six-hourly run.
