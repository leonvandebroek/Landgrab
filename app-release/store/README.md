# Store pages (App Store, Google Play)

Everything a store shows about the app lives here, so a change is a pull request and not a click in a console. The
store-assets skill explains each part; `node app-release/stores/asc-listing.mjs check` says what Apple would refuse.

| | |
|---|---|
| `listing.json` | Languages, categories, copyright, age rating, countries, review contact and review notes |
| `<language>.json` | Name (30), subtitle (30), promotional text (170), keywords (100, commas, no spaces), description, addresses; `shortDescription` is Google Play's 80 characters |
| `screenshots/ios/<language>/iphone-69`, `ipad-13` | App Store screenshots: 1320 x 2868 (or 1290 x 2796) and 2064 x 2752 (or 2048 x 2732), PNG, 1 to 10 each |
| `screenshots/android/<language>/phone`, `tablet-7`, `tablet-10` | Google Play screenshots |
| `android/icon-512.png`, `android/<language>/feature-graphic.png` | Google Play's icon and 1024 x 500 banner |

Each language gets its own screenshots, with the app's own screens in that language. Pictures show demo data only:
never a real customer's name, guest or e-mail address.

`listing.json` settings:

* `ios.ageRating`: `none-of-the-above` answers every age question "none" (most business and utility apps). An app with
  violence, gambling, user content or the like sets `manual` and answers in App Store Connect.
* `ios.countries`: `all` (every country, and new ones as Apple adds them) or `manual`.

## Filling in App Store Connect

```sh
node app-release/stores/asc-listing.mjs appid     # registers the bundle id with push; safe to repeat
node app-release/stores/asc-listing.mjs check     # reads this folder only
node app-release/stores/asc-listing.mjs plan      # reads App Store Connect, changes nothing
node app-release/stores/asc-listing.mjs apply     # texts, categories, age, price, countries, review, screenshots
node app-release/stores/asc-listing.mjs verify    # reads the whole page back
```

It needs `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_KEY_P8` (the Admin key from the signing-keys skill). `apply` can be
repeated and never sends the app to review. Another app of the same repository: add `--app <key>`; its folder is
`app-release/store/<key>/`.

By hand, because Apple's API has no call for it:

* **The app record**: App Store Connect, Apps, +, New App (platform, name, primary language, bundle id, SKU).
* **App Privacy**: which data the app collects, whether it is linked to the user, and whether it tracks. This is a
  legal statement: the owner confirms it. Typical for a business app with sign-in: Contact Info and User Content and
  Identifiers, linked to the user, App Functionality only, no tracking; add Diagnostics when the app sends crash reports.
* **EU trader status** (Digital Services Act): once per account, in Business, before the first release in the EU.
* **A demo account** that signs in without a second step from a real person (no SMS code, no e-mail link).
