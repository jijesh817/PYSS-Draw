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

## Selling tickets from the app (treasurer)

The app can add a sale to the Tickets tab itself, protected by a PIN. The PIN
is checked by a small script that lives inside the Google Sheet, so it never
appears in the app's code. Set it up once, on a computer:

1. Open the PYSS Google Sheet → **Extensions → Apps Script**.
2. Delete what's in the editor, paste the whole of `apps-script/Code.gs`,
   and click **Save**.
3. Click **Project Settings** (gear on the left) → **Script Properties** →
   **Add script property**. Property `PIN`, value: a number only the
   treasurer knows. **Save script properties**.
4. Click **Deploy → New deployment**, choose the type **Web app** (gear next
   to "Select type"). Set **Execute as: Me** and **Who has access: Anyone**,
   then **Deploy**. Google asks you to authorise: choose your account, then
   **Advanced → Go to … (unsafe) → Allow** (it's your own script).
5. Copy the **Web app URL** (it ends in `/exec`) and paste it into
   `APPS_SCRIPT_URL` in `index.html`.

Using it: tap **Sell a ticket** (or tap an available ticket, then **Sell
ticket N**). Enter the PIN the first time, pick the member from the list (or
type any name for a guest), choose **Paid ₹500** or **Free (offer)**, and
**Save sale**. The phone remembers the PIN; **Forget PIN** removes it. A sold
ticket can be undone with **Cancel this sale**. The script refuses a ticket
that is already sold, and locks out PIN guessing after 10 wrong tries in 10
minutes.

To change the PIN, edit the `PIN` script property. If you change Code.gs
later, use **Deploy → Manage deployments → Edit → Version: New version** so
the URL stays the same.

## Owner and admins

Three levels, set in **Apps Script → Project Settings → Script Properties**:

| Property | Value | Who |
|---|---|---|
| `OWNER_PIN` | your PIN | **Owner** – sell, cancel any sale, reminders, record dues payments |
| `OWNER_NAME` | your name (optional) | shown in the **By** column for your actions |
| `ADMIN_PINS` | `Ravi:483920, Suresh:771204` | **Admins** – sell, cancel only their own sales, reminders, record dues payments |

Everyone else just opens the link and views. Every sale and payment records
who made it in a **By** column (added automatically). To remove an admin,
delete their `Name:PIN` from `ADMIN_PINS`; nothing else changes. PIN
changes take effect immediately, with no redeploy.

The older single `PIN` property keeps working as the owner PIN until
`OWNER_PIN` is set; delete it afterwards. The app shows "Signed in as …
Owner/Admin" with a **Sign out** link.

## Admin-only: categories and WhatsApp

Member categories (e.g. `Admin`, `Former admin 2024–2026`) and WhatsApp
numbers are **admin-only**. They live in a **private** "PYSS Contacts"
sheet (sharing *Restricted*), never in the public PYSS sheet. The script
sends them only after an owner/admin PIN, and the app keeps them in memory
only.

- Columns: **S/N · Name · Block · Country · Role · WhatsApp** (import
  `sheet-template/Contacts.csv`). Role can hold several categories,
  separated by commas. Leave WhatsApp blank if not needed.
- Script Properties: `CONTACTS_SHEET_ID` = that sheet's ID.
- In the app, tap **Admin sign in** (or sell a ticket) to see category tags
  and **Send reminders**, which can filter by category. **Sign out** hides
  them again. Members never see either.

## WhatsApp reminders (treasurer)

**Send reminders** lists members who haven't taken a ticket yet, with a
WhatsApp button for each. Tapping it opens that member's chat in *your*
WhatsApp with the message typed in; you tap **Send**. The member is then
marked as reminded (shared between treasurer phones).

Phone numbers are kept in a **separate, private** Google Sheet, never in the
public PYSS sheet, and the app only receives them after the PIN.

1. Create a new Google Sheet (e.g. "PYSS Contacts") and keep its sharing
   **Restricted**. Import `sheet-template/Contacts.csv` (all members' S/N and
   names) or type the headings **S/N** and **WhatsApp** in row 1.
2. Fill in **WhatsApp** numbers with the country code, e.g. `971501234567`
   (spaces, `+` or a leading `00` are fine).
3. Copy the sheet's ID (between `/d/` and `/edit` in its address).
4. In Apps Script: **Project Settings → Script Properties → Add script
   property** `CONTACTS_SHEET_ID` = that ID.
5. Paste the latest `apps-script/Code.gs`, then **Deploy → Manage
   deployments → Edit → Version: New version → Deploy**, and allow access
   if asked.
6. Open the web app link: it should show `"contacts":"N numbers"`.

The message can be edited on the reminders screen; `{name}`, `{left}`
(tickets left) and `{link}` (app link) are filled in for each member.
A **Reminded** column is added to the contacts sheet automatically.

## Installing on a phone

- **Android (Chrome):** tap **Install app** on the page, or **⋮ → Install
  app / Add to Home screen**.
- **iPhone (Safari):** **Share → Add to Home Screen**.

## Files

- `index.html` – the app (includes the member list used to look up S/N)
- `manifest.webmanifest`, `sw.js`, `icons/` – installable app and offline use
- `sheet-template/Tickets.csv` – headings for the Tickets tab
- `apps-script/Code.gs` – the sheet script that saves sales made in the app and reads reminder numbers
- `sheet-template/Contacts.csv` – start of the private contacts sheet (S/N, name, block, country, WhatsApp)
