# PYSS Bumper Draw

A phone-installable web app for the PYSS New Year Membership Campaign Bumper
Draw (ബമ്പർ ഡ്രോ): 100 tickets at ₹500, prizes worth ₹45,000. Members can see
which tickets 1–100 are sold, who holds each one, and which are still free.

Ticket sales are read from the **Tickets** tab of the PYSS Google Sheet (the
same sheet the dues app uses), so selling a ticket means adding a row there.

## One-time setup

1. In the PYSS Payments Google Sheet, add a new tab (the **+** at the bottom
   left) and name it exactly **Tickets**.
2. In row 1 type these headings, one per column:
   **Ticket No · S/N · Name · Block · Country · Type · Date**
   (or import `sheet-template/Tickets.csv` with *Insert new sheet(s)*).
3. The sheet is already shared as *Anyone with the link → Viewer*, so nothing
   else is needed.
4. Turn on GitHub Pages for this repo: **Settings → Pages**, Source **Deploy
   from a branch**, Branch **main**, folder **/ (root)**, **Save**.

## Recording a ticket

Add one row per ticket:

| Ticket No | S/N | Name | Block | Country | Type | Date |
|---|---|---|---|---|---|---|
| 1 | 87 | | | | Paid | 2026-11-18 |
| 7 | | Suresh | KNR | India | Paid | 2026-11-19 |
| 12 | 88 | | | | Free | 2026-11-19 |

- **Ticket No** (1–100) is required.
- For a **PYSS member**, enter their **S/N** from the dues list and leave
  Name, Block and Country blank: the app fills them in (and uses the block
  from the Members tab if you changed it there).
- For **someone who isn't a member**, leave S/N blank and type their Name,
  and Block/Country if you want them shown.
- **Type**: `Paid` (₹500) or `Free` for a complimentary ticket from the
  2-year membership offer. Blank counts as Paid.
- **Date** is optional.

The app shows changes when it is opened, brought back to the screen, or when
**Refresh** is tapped (Google can take a minute or two). Rows with a missing
ticket number or name, numbers outside 1–100, and tickets entered twice are
named in the status line so they can be fixed.

Phone numbers or other private details should not go in this tab: anyone with
the app link can read it.

## Installing on a phone

- **Android (Chrome):** tap **Install app** on the page, or **⋮ → Install
  app / Add to Home screen**.
- **iPhone (Safari):** **Share → Add to Home Screen**.

## Files

- `index.html` – the app (includes the member list used to look up S/N)
- `manifest.webmanifest`, `sw.js`, `icons/` – installable app and offline use
- `sheet-template/Tickets.csv` – headings for the Tickets tab
