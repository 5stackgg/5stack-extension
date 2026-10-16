# Chrome Web Store listing

What the developer dashboard says for **5Stack**. Paste from here when the
listing or a permission changes; the `extension` workflow only sends the
package.

## Releasing

Bump `version` in `package.json`. On main, `.github/workflows/extension.yml`
builds the zip (`yarn zip`) and sends it for review with
`scripts/publish-extension.mjs`. The store refuses a version it has seen.

It signs in as a Google Cloud service account that the dashboard's **Account**
page names as able to publish. Set up once:

1. In Google Cloud, enable the **Chrome Web Store API** on a project and create
   a service account with no roles. Make a JSON key for it.
2. In the developer dashboard, with the **5Stack** publisher selected,
   **Account** → add the service account's email.
3. On the repo: the key file as the secret `CWS_SERVICE_ACCOUNT`, the publisher
   id from the dashboard's **Settings** as the variable `CWS_PUBLISHER_ID`, and
   the item id as the variable `CWS_EXTENSION_ID`. The workflow is skipped
   until both variables exist.

The very first upload has to be made by hand in the dashboard (**Add new
item**), because the API can only update an item that exists.

## Store listing

**Name:** 5Stack

**Summary** (132 characters at most):
Import FACEIT and Leetify CS2 matches into your 5Stack panel from the page you are on, with their demos, stats and replays.

**Description:**

5Stack is the open source Counter-Strike 2 platform for running your own
matches, leagues and tournaments. This extension is its companion for matches
played elsewhere.

Open a FACEIT match room or player page, or a Leetify profile or match, and
click the 5Stack icon. A side panel lists every match on the page that has a
demo, shows which ones are already in your 5Stack panel, and imports the rest
with one click: demo, scoreboard, stats, 2D and 3D replay.

- Works on anyone's matches, not only your own.
- FACEIT demos are fetched with your own FACEIT login, the same way FACEIT's
  "Watch demo" button does.
- Valve matchmaking matches found on Leetify are imported by their share code.
- Works with 5stack.gg or your own self-hosted 5Stack panel.

It needs a 5Stack account. It does nothing until you click its icon, and sends
nothing anywhere but your own 5Stack panel.

**Category:** Tools
**Language:** English

**Graphics you provide:** the 128px icon is in the package; a 1280×800
screenshot of the side panel next to a FACEIT match room, and one next to a
Leetify profile; a 440×280 small promo tile.

## Privacy practices

**Single purpose:**
Import the Counter-Strike 2 matches shown on the FACEIT or Leetify page the user is viewing into the user's own 5Stack panel.

**Permission justifications:**

- **sidePanel:** the extension's whole interface is a side panel opened from
  its toolbar icon. It stays open while the user works on the FACEIT page,
  which FACEIT's captcha sometimes needs.
- **storage:** keeps the address of the user's 5Stack panel.
- **scripting:** when the user imports a FACEIT match, runs a function in a
  faceit.com tab that reads that match from FACEIT's API and asks FACEIT for
  the demo's download link, using the user's own FACEIT login, as FACEIT's own
  "Watch demo" button does.
- **Host permissions:**
  - **www.faceit.com:** to read the match or player on the page and get the
    demo's download link, as above.
  - **leetify.com and api-public.cs-prod.leetify.com:** to recognise the
    Leetify page the user is on and read its matches from Leetify's public API.
  - **5stack.gg:** the default 5Stack panel the matches are imported into.
  - **Any https site (optional, asked at setup):** 5Stack is self-hosted, so a
    user's panel can be on any domain. Chrome asks for access to the one host
    the user types in; nothing else is requested.

**Remote code:** No, I am not using remote code.

**Data usage.** Collected:

- **Authentication information:** the user's 5Stack session cookie is sent to
  their own 5Stack panel, which is how the panel knows who is importing. The
  extension never reads or stores it, or the FACEIT login.
- **Website content:** match ids, share codes and FACEIT demo download links
  from the page the user is on, sent to the user's 5Stack panel.

Certify all three: not sold to third parties; not used or transferred for
purposes unrelated to the item's single purpose; not used or transferred to
determine creditworthiness or for lending.

**Privacy policy URL:** https://docs.5stack.gg/extension/privacy

## Distribution

**Visibility:** Unlisted for the first review, then Public.
**Regions:** All regions.
