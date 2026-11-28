# Flock portal: setup guide

The Flock portal has two parts:

- **Ambassador portal**: `https://birdboost.github.io/portal/`. Ambassadors type their access code to see tasks, events, the preview store (in 3D) and the WhatsApp group.
- **Admin page**: `https://birdboost.github.io/portal/admin/`. The Birdboost team logs in with an email and password to manage everything.

The pages are hosted on GitHub Pages, like the application page. The data (ambassadors, codes, tasks, events, merch, sales) is stored in **Supabase**, a free online database. You set it up once. It takes about 15 minutes.

---

## Step 1. Make a free Supabase project

1. Go to **supabase.com** and press **Start your project**. Sign up with the Birdboost email or GitHub account.
2. Press **New project**.
   - **Name:** `birdboost-flock`
   - **Database password:** press **Generate a password**, then save it somewhere safe. You rarely need it, but don't lose it.
   - **Region:** pick the one closest to Zimbabwe that's on the list. An EU region is fine.
   - **Plan:** Free.
3. Press **Create new project** and wait a minute or two while it sets up.

## Step 2. Create the database

1. In your Supabase project, click **SQL Editor** in the left menu, then **New query**.
2. Open `portal-setup/database.sql` in the GitHub repository. Press the **Copy raw file** button (two overlapping squares, top right of the file).
3. Paste it into the Supabase query box.
4. Find the line that says `>>> CHANGE ME`. Just below it, replace `CHANGE-ME@example.com` with the email **you** will use to log in to the admin page. Keep the quote marks.
5. Press **Run**. At the bottom you should see **Birdboost portal database is ready**.
   If Supabase asks you to confirm because the query changes security settings, press to run it anyway. That's expected.

## Step 3. Create your admin login

1. In Supabase, click **Authentication** in the left menu, then **Users**.
2. Press **Add user**, then **Create new user**.
3. Type the **same email** you put in Step 2, and a password you'll remember. Tick **Auto Confirm User**. Press **Create user**.
4. So that strangers can't make logins: go to **Authentication**, then **Sign In / Providers** (on some screens it's **Providers** or **Settings**). Turn **off** "Allow new users to sign up", then press **Save**.
   This is extra safety. Even with sign-ups on, only emails on your admin list can open the admin page.

## Step 4. Connect the website to Supabase

1. In Supabase, open **Project Settings** (the gear icon), then **Data API** or **API Keys**.
2. Copy two things:
   - **Project URL**, which looks like `https://abcdefgh.supabase.co`
   - the **anon public** key, which is a long text starting with `eyJ`. On newer screens it's called the **publishable** key and starts with `sb_publishable_`.
   **Don't** copy the `service_role` or **secret** key. That one must never go on the website.
3. Either send those two values to Claude in the project thread and Claude puts them in, or do it yourself:
   1. On GitHub, open the `birdboost.github.io` repository, then the `portal` folder, then `config.js`.
   2. Press the **pencil** icon to edit.
   3. Replace `PASTE_PROJECT_URL_HERE` with your Project URL, and `PASTE_ANON_KEY_HERE` with the key. Keep the quote marks.
   4. Press **Commit changes**, then **Commit changes** again.
4. Wait about 2 minutes for GitHub to update the site.

## Step 5. Log in and set up

1. Open `https://birdboost.github.io/portal/admin/` and log in with the email and password from Step 3.
2. Go to **Settings**:
   - Paste the **WhatsApp group invite link**. In WhatsApp, open the group, tap its name, tap **Invite via link**, then **Copy link**.
   - Write a short welcome message for ambassadors if you want one.
   - To add other admins, put their email in **Admins**, then create a login for that same email in Supabase (Step 3).
3. Go to **Preview store** and add your unreleased pieces. For the 3D view, upload a **front photo** and a **back photo** of each piece, taken straight on, on a plain background. Ambassadors can then drag to spin it round. If you ever get a 3D model file (`.glb`), upload it too and it replaces the photo version.

---

## Everyday use

### Add an ambassador
1. Go to **Ambassadors** and press **+ Add ambassador**.
2. Fill in their name and WhatsApp number.
3. The page suggests one access code, like `GrumpyPigeon0397`. Press **↻ Shuffle** for a different one, as many times as you like. When you like it, press **✓ Use this code**. Nothing is saved until you do.
4. Press **Create account**.

You then get their **access code**, for logging in, and their **store code** (like `BBTANAKA482`), for sales. Press **Send on WhatsApp** to send them a ready-made welcome message, or **Copy message** to paste it anywhere. Access codes work in any mix of capitals.

### Switch an account off or on
In the **Ambassadors** list, each person shows **🟢 Active** or **🔴 Inactive**.
- **Deactivate** blocks them from the portal straight away, even if they're already logged in or still have their code. Nothing is deleted: their code, tasks, events and sales all stay.
- **Activate** lets them back in with the same code.

### Change someone's code
Press **Change code** next to their name. The page shows their current code and warns you that it's being replaced. Shuffle until you like the new one, then press **✓ Use this code** and confirm. The old code stops working straight away. If you press **Cancel**, nothing changes.

### More code options
Press **Manage** next to their name, then:
- **Revoke code** switches off just the code. **Switch code back on** undoes that.
- **Renew** adds 30 days, 90 days or 1 year, or sets the code to never expire.

### Tasks
**Tasks**, then fill in the form and press **Post to all ambassadors**. Ambassadors press **Mark done** and can add a link to their post. You see who has done it, with links to their posts.

### Events
**Events**, then **+ Post an event**, then write the brief. Ambassadors can read it and apply. In **Team and applicants**, set each person to:
- **Suggest them**: they see "You're invited" and can press "I'm in".
- **On the team**: confirmed.
- **Declined**: not this time.

Untick "Open for applications" to hide an event from ambassadors who aren't involved.

### Sales with store codes
When someone buys a piece with an ambassador's store code, go to **Sales**, then **Record a sale**. Type the code and the page shows whose it is. The leaderboard counts pieces and money per ambassador. Ambassadors see how many pieces they've sold on their home page. **Download CSV** gives you a spreadsheet.

### Pre-orders
Ambassadors can pre-order pieces marked **Pre-order open**. You see the requests under **Preview store**, then **Pre-orders**. Change each one to **confirmed** or **cancelled**, and the ambassador sees the update.

---

## The Nest (the shop on the website)

The website has a shop called **the Nest** at `birdboost.github.io/nest/`. Customers pick a piece, a size and how many, then place their order on the website with their name, phone number, city, and delivery or collection. **Nobody pays on the website.** They see an order reference like `BB-F6370` and the message that Birdboost will contact them. You then contact them to confirm stock, delivery and payment.

### Where orders arrive

Every order arrives in two places, so none get lost:

1. **The admin page, under Shop orders**, once you've done the one-time step below.
2. **An email** from Formspree, to the same inbox that gets ambassador applications, with the subject "New Birdboost order BB-…". If the database can't be reached for any reason, this email is how the order still gets to you. (Formspree's free plan allows 50 submissions a month across applications and orders. If you get more than that, upgrade the Formspree plan.)

If both fail (for example the customer has no signal), the customer is told it didn't go through and can tap **Try again**. Their details are kept.

### One-time step: save orders in the admin page (about 2 minutes)

1. In Supabase, open **SQL Editor**, then **New query**.
2. Open `portal-setup/update-04-orders.sql`, copy all of it, paste it in, and press **Run**. It's safe to run again. It already includes update 3, so you don't need to run update 3 separately.
3. Refresh the admin page. You now have a **Shop orders** tab, and each piece under **Preview store** has a **Sell in the Nest** tick box, a category and a colour.

Until you tick **Sell in the Nest** on any piece, the Nest shows the three Righteous tees from the file `assets/catalog.js` ($15 each). Orders for them are still saved in Shop orders. To change a price there, open that file on GitHub, press the pencil, and change `price: 15`. As soon as one piece is ticked in the admin page, the Nest shows your admin pieces instead.

### Photos from more angles, and 3D models

Each piece can show its front, its back, a 360° turntable and a real 3D model that customers spin and zoom. Customers can always pinch or tap **Zoom** to look closely.

* **Back photo:** in the admin page, edit the piece and upload a back photo. For the built-in tees, put the photo in `assets/img/` and add `back: "assets/img/your-photo.jpg",` to the piece in `assets/catalog.js`.
* **3D model:** you need a `.glb` file of the garment. A designer can export one from CLO 3D or Marvelous Designer, or a 3D scanning app can make one from the real tee. In the admin page, edit the piece and upload the .glb file as its 3D model. For the built-in tees, upload the file to `assets/models/` and add `model: "assets/models/your-file.glb",` to the piece in `assets/catalog.js`. A 3D button then appears on that piece.

### Shop orders

Every order sent from the Nest shows up under **Shop orders**, with a reference like `BB-F6370`, the customer's phone number (tap it to message them on WhatsApp), their area or address, and the ambassador code they used.

Move each order along: **New**, **Confirmed**, **Paid**, **Sent or collected**, or **Cancelled**. When an order with an ambassador's code is paid, press **Add to sales**. The ambassador then sees it on their dashboard and on the leaderboard.

### Ambassador links, discount and commission

* Every ambassador can copy their **Nest link** from their dashboard. It looks like `birdboost.github.io/nest/?code=BIGBIRD7`. Anyone who opens it has that code filled in at checkout.
* Under **Settings** you can set a **discount %** for customers who use an ambassador code. Leave it empty to agree the discount with the customer yourself.
* Under **Settings** you can set a **commission per piece**. Ambassadors then see what they've earned on their dashboard, worked out from the sales you record.

### Taking real card or mobile money payments later

To take payment on the website itself you need a payment provider account in Birdboost's name. For Zimbabwe, Paynow (EcoCash, OneMoney and cards) is the usual choice; Stripe or PayPal work for cards from abroad. The provider then needs a small piece of server code to confirm payments safely, which this site can't do on its own. Until then, contacting the customer to arrange payment is the honest way to do it.

## Good to know

- **Free plan limits.** Supabase's free plan is plenty for this. If nobody uses the portal for 7 days, Supabase pauses the project. If that happens, log in to supabase.com and press **Restore project**. Nothing is lost.
- **Photos.** Keep merch photos under about 2 MB each. Phone photos are fine. The free plan holds 1 GB.
- **Privacy.** Only people with a working code see the preview store. A photo link copied out of the portal will still open for anyone who has it, so ask ambassadors not to share screenshots or links before a drop.
- **Ambassadors stay logged in** on their phone until they press Log out, or until you revoke or replace their code.
- **Times** are shown in Harare time.
