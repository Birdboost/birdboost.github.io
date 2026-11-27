// Birdboost Flock portal settings.
// Paste the two values from Supabase > Project Settings > API (or "API Keys").
// The "anon" / "publishable" key is safe to put here: it can only do what the
// database rules allow. NEVER paste the "service_role" / "secret" key here.
window.BB_CONFIG = {
  SUPABASE_URL: "PASTE_PROJECT_URL_HERE",       // looks like https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: "PASTE_ANON_KEY_HERE"      // long text starting with eyJ... or sb_publishable_
};
