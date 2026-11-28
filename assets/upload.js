/* Birdboost uploads: sends a photo or short video to the "community" storage in Supabase.
   Photos are resized on the phone first (max 2000px), so uploads are quick on mobile data.
   Files land in community/incoming/ under a random name; nothing is shown anywhere until Birdboost approves it. */
window.BBUpload = (() => {
  const CFG = window.BB_CONFIG || {};
  const ok = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/PASTE/.test(CFG.SUPABASE_URL));
  const MAX = 25 * 1024 * 1024;
  async function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.2e6) return file;
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
      return blob && blob.size < file.size ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
    } catch (e) { return file; }
  }
  async function send(file, onProgress) {
    if (!ok) throw new Error("not_set_up");
    if (!file) throw new Error("no_file");
    if (!/^(image|video)\//.test(file.type)) throw new Error("not_media");
    file = await shrink(file);
    if (file.size > MAX) throw new Error("too_big");
    const ext = (file.type.split("/")[1] || "bin").replace("quicktime", "mov").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
    const name = "incoming/" + new Date().toISOString().slice(0, 10) + "-" + crypto.randomUUID() + "." + ext;
    await new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open("POST", CFG.SUPABASE_URL + "/storage/v1/object/community/" + name);
      x.setRequestHeader("apikey", CFG.SUPABASE_ANON_KEY);
      x.setRequestHeader("Authorization", "Bearer " + CFG.SUPABASE_ANON_KEY);
      x.setRequestHeader("Content-Type", file.type);
      x.setRequestHeader("x-upsert", "false");
      if (onProgress) x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      x.onload = () => x.status < 300 ? res() : rej(new Error("upload_" + x.status));
      x.onerror = () => rej(new Error("network"));
      x.send(file);
    });
    return CFG.SUPABASE_URL + "/storage/v1/object/public/community/" + name;
  }
  return { send, ok };
})();
