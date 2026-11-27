# Birdboost

The Birdboost website, live at birdboost.github.io.

* `index.html`: the home page, "Enter the Flock". Old application links (with `?src=`, `?ref=` and so on) are forwarded to the application page, and links with `?code=` go to the shop with the code filled in.
* `nest/`: the Nest, the shop. Orders are requests; payment is confirmed on WhatsApp.
* `flock/`: Join the Flock, the ambassador application (Formspree).
* `portal/`: the ambassador portal (log in with an access code).
* `portal/admin/`: the admin page for the Birdboost team.
* `portal-setup/`: the database files and the setup guide (`portal-setup/SETUP.md`, including "The Nest").
* `assets/`: shared look (`bb.css`), the digital bird (`bird.js`), shared behaviour (`site.js`), the built-in shop list (`catalog.js`) and images.
