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
**Ambassadors**, then **+ Add ambassador**. Fill in their name and WhatsApp number, then press **Create account and code**. You get:
- an **access code** (like `K7PM-3XQD`) that they use to log in, and
- a **store code** (like `BBTANAKA482`) for their sales.

Press **Send on WhatsApp** to send them a ready-made welcome message, or **Copy message** to paste it anywhere.

### Renew, revoke or replace a code
Click the ambassador's name, then:
- **Revoke code** switches it off straight away. They're logged out the next time the page loads anything.
- **Switch code back on** undoes a revoke.
- **Renew** adds 30 days, 90 days or 1 year, or sets the code to never expire.
- **Make a new code** replaces the code if it has leaked. The old one stops working.

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

## Good to know

- **Free plan limits.** Supabase's free plan is plenty for this. If nobody uses the portal for 7 days, Supabase pauses the project. If that happens, log in to supabase.com and press **Restore project**. Nothing is lost.
- **Photos.** Keep merch photos under about 2 MB each. Phone photos are fine. The free plan holds 1 GB.
- **Privacy.** Only people with a working code see the preview store. A photo link copied out of the portal will still open for anyone who has it, so ask ambassadors not to share screenshots or links before a drop.
- **Ambassadors stay logged in** on their phone until they press Log out, or until you revoke or replace their code.
- **Times** are shown in Harare time.
