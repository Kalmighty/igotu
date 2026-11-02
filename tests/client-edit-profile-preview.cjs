/* Synthetic profile-media backend adapter; not database/RLS execution or proof. */
const { chromium } = require("playwright");
const { install, seed, ids } = require("./system-fixture.cjs");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const base = process.env.UI_BASE_URL || "http://127.0.0.1:4210",
  out = "docs/client-edit-profile";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
for (const dir of ["screenshots", "validation", "before"])
  fs.mkdirSync(`${out}/${dir}`, { recursive: true });
let count = 0,
  scans = 0;
const errors = [],
  metrics = [];
const ok = (v, m) => {
  assert(v, m);
  count++;
};
const empty = (uid) => ({
  user_id: uid,
  avatar_mode: "initial",
  avatar_value: null,
  banner_mode: "default",
  banner_value: null,
  banner_design: null,
  version: 0,
  last_operation_id: null,
});
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  async function open(opt = {}) {
    const c = await browser.newContext({
      viewport: { width: opt.width || 1536, height: opt.height || 1000 },
      reducedMotion: "reduce",
    });
    const tables = seed();
    tables.users.find((u) => u.id === ids.client).full_name =
      "Synthetic Client A";
    tables.users.find((u) => u.id === ids.client).email = "client-a@igotu.test";
    if (opt.prepare) opt.prepare(tables);
    const s = await install(c, {
      tables,
      role: opt.role || "client",
      fail: opt.fail,
    });
    const state = {
      row: empty(ids.client),
      objects: new Map(),
      calls: [],
      unavailable: !!opt.unavailable,
      failUpload: false,
      lostUpload: false,
      failSave: false,
      lostSave: false,
      hold: opt.mediaHold || null,
      failDelete: false,
    };
    await c.exposeBinding("__profileMediaApi", async (source, op) => {
      state.calls.push(structuredClone(op));
      if (state.hold) await state.hold(op);
      const own = s.tables.users.find((u) => u.id === ids[s.role]);
      if (
        !own ||
        s.role !== "client" ||
        own.status !== "active" ||
        own.profile_completed !== true ||
        !own.identity_verified
      )
        return { data: null, error: { code: "42501" } };
      if (op.kind === "rpc") {
        if (state.unavailable)
          return { data: null, error: { code: "PGRST202" } };
        if (op.name === "get_client_profile_media")
          return { data: structuredClone(state.row), error: null };
        if (op.name === "save_client_profile_media") {
          if (state.failSave) return { data: null, error: { code: "NETWORK" } };
          const a = op.args,
            p = a.p_settings;
          if (state.row.last_operation_id === a.p_operation_id)
            return { data: structuredClone(state.row), error: null };
          if (state.row.version !== a.p_expected_version)
            return { data: null, error: { code: "40001" } };
          if (
            !p ||
            Object.keys(p).sort().join() !==
              "avatar_mode,avatar_value,banner_design,banner_mode,banner_value"
          )
            return { data: null, error: { code: "22023" } };
          for (const kind of ["avatar", "banner"])
            if (
              p[kind + "_mode"] === "upload" &&
              (!p[kind + "_value"].startsWith(ids.client + "/" + kind + "/") ||
                !state.objects.has(p[kind + "_value"]))
            )
              return { data: null, error: { code: "42501" } };
          state.row = {
            ...structuredClone(p),
            user_id: ids.client,
            version: state.row.version + 1,
            last_operation_id: a.p_operation_id,
          };
          if (state.lostSave) {
            state.lostSave = false;
            throw Error("Synthetic lost acknowledgement");
          }
          return { data: structuredClone(state.row), error: null };
        }
      }
      if (op.kind === "storage") {
        if (op.action === "upload") {
          if (state.failUpload)
            return { data: null, error: { statusCode: 500 } };
          if (
            !new RegExp(
              `^${ids.client}/(avatar|banner)/[a-f0-9-]{36}\\.webp$`,
            ).test(op.name) ||
            op.type !== "image/webp" ||
            op.options.upsert !== false
          )
            return { data: null, error: { statusCode: 403 } };
          if (state.objects.has(op.name))
            return { data: null, error: { statusCode: 409 } };
          state.objects.set(op.name, op);
          if (state.lostUpload) {
            state.lostUpload = false;
            throw Error("Synthetic lost upload response");
          }
          return { data: { path: op.name }, error: null };
        }
        if (op.action === "signed")
          return state.objects.has(op.name)
            ? {
                data: { signedUrl: `${base}/profile-fixture-image/${op.name}` },
                error: null,
              }
            : { data: null, error: { code: "404" } };
        if (op.action === "remove") {
          if (state.failDelete)
            return { data: null, error: { code: "NETWORK" } };
          if (
            op.names.some(
              (n) =>
                !n.startsWith(ids.client + "/") ||
                [state.row.avatar_value, state.row.banner_value].includes(n),
            )
          )
            return { data: null, error: { code: "42501" } };
          for (const name of op.names) state.objects.delete(name);
          return { data: [], error: null };
        }
      }
      return { data: null, error: { code: "UNEXPECTED" } };
    });
    await c.route("**/*", async (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== new URL(base).origin) return r.fallback();
      if (
        opt.before &&
        ["/client/edit-profile.html", "/js/client-edit-profile.js"].includes(
          u.pathname,
        )
      ) {
        return r.fulfill({
          contentType: u.pathname.endsWith(".js")
            ? "text/javascript"
            : "text/html",
          body: require("node:child_process").execFileSync(
            "git",
            [
              "show",
              `60e3b56523265c75f981e380a50fa1209b190502:igotu_v2${u.pathname}`,
            ],
            { encoding: "utf8" },
          ),
        });
      }
      if (u.pathname === "/js/supabaseClient.js") {
        let js = fs
          .readFileSync("tests/system-fixture.js", "utf8")
          .replaceAll("window.__systemApi(", "transport(")
          .replace(
            "upload: (name, file, options) =>",
            "upload: async (name, file, options) =>",
          )
          .replace(
            "size: file.size,",
            "size: file.size, bytes: Array.from(new Uint8Array(await file.arrayBuffer())),",
          );
        js =
          `const transport = op => (op.kind==='rpc' && ['get_client_profile_media','save_client_profile_media'].includes(op.name) || op.kind==='storage' && op.bucket==='client-profile-media') ? window.__profileMediaApi(op) : window.__systemApi(op);\n` +
          js;
        return r.fulfill({ contentType: "text/javascript", body: js });
      }
      if (u.pathname.startsWith("/profile-fixture-image/")) {
        const item = state.objects.get(
          decodeURIComponent(
            u.pathname.slice("/profile-fixture-image/".length),
          ),
        );
        return item
          ? r.fulfill({
              contentType: "image/webp",
              body: Buffer.from(item.bytes),
            })
          : r.fulfill({ status: 404, body: "" });
      }
      return r.fallback();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.setDefaultTimeout(10000);
    await p.goto(base + "/client/edit-profile.html");
    if (!opt.noWait && !opt.before && (!opt.role || opt.role === "client"))
      await p.waitForFunction(
        () => !document.getElementById("personalFields")?.disabled,
      );
    if (!opt.noWait && !opt.before && !opt.role)
      await p.waitForFunction(
        () =>
          document.getElementById("appearanceState").textContent !== "Loading",
      );
    return { p, c, s, state };
  }
  async function shot(p, name) {
    await p.evaluate(() => {
      const e = document.createElement("aside");
      e.id = "offlineProfileLabel";
      e.textContent = "OFFLINE REVIEW · SYNTHETIC ACCOUNT · NO LIVE SUPABASE";
      e.style =
        "position:fixed;top:0;left:0;right:0;z-index:99999;background:#fff4cd;color:#453b15;text-align:center;font:700 10px/1.5 Arial;pointer-events:none";
      document.body.append(e);
    });
    await p.screenshot({
      path: `${out}/screenshots/${name}.png`,
      fullPage: true,
    });
    await p.locator("#offlineProfileLabel").evaluate((e) => e.remove());
  }
  async function axe(p, label) {
    await p.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await p.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
      });
      return r.violations.map((x) => ({
        id: x.id,
        targets: x.nodes.map((n) => n.target),
      }));
    });
    ok(!violations.length, "axe " + label + JSON.stringify(violations));
    scans++;
  }
  async function choose(p, kind, id) {
    await p
      .locator(kind === "avatar" ? "#editPictureBtn" : "#changeBannerBtn")
      .click();
    await p.locator("input[name=appearanceMode][value=template]").check();
    await p.locator(`input[name=appearanceTemplate][value=${id}]`).check();
    await p.locator("#useAppearancePreview").click();
  }
  async function notice(p, text) {
    await p.waitForFunction(
      (t) => document.getElementById("messageBox").textContent.includes(t),
      text,
    );
  }
  async function upload(p, kind) {
    await p
      .locator(kind === "avatar" ? "#editPictureBtn" : "#changeBannerBtn")
      .click();
    await p.locator("input[name=appearanceMode][value=upload]").check();
    const bytes = await p.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 640;
      const x = c.getContext("2d");
      const g = x.createLinearGradient(0, 0, 960, 640);
      g.addColorStop(0, "#e5f5df");
      g.addColorStop(1, "#075c36");
      x.fillStyle = g;
      x.fillRect(0, 0, 960, 640);
      x.fillStyle = "#f7e6ad";
      x.beginPath();
      x.arc(620, 180, 95, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#13834c";
      x.fillRect(200, 280, 360, 220);
      x.fillStyle = "#fff";
      x.font = "42px Arial";
      x.fillText("Synthetic image", 230, 410);
      const blob = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await p.locator("#profileImageFile").setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from(bytes),
    });
    await p.waitForFunction(
      () => !document.getElementById("useAppearancePreview").disabled,
    );
    ok(await p.locator("#cropControls").isVisible(), kind + " crop visible");
    await p.locator("#cropZoom").fill("1.5");
    await p.locator("#cropX").fill("70");
    await p.locator("#cropY").fill("30");
    await p.locator("#cropZoom").focus();
    await p.keyboard.press("ArrowRight");
    ok(
      Number(await p.locator("#cropZoom").inputValue()) > 1.5,
      "keyboard crop zoom",
    );
    return bytes;
  }
  try {
    for (const width of [1536, 390]) {
      const { p, c } = await open({ width, before: true });
      await p.waitForFunction(
        () =>
          document.getElementById("fullName").value === "Synthetic Client A",
      );
      await shot(p, "before-" + width);
      await c.close();
    }
    {
      let release;
      const barrier = new Promise((r) => (release = r));
      const { p, c, state } = await open({
        noWait: true,
        mediaHold: (o) =>
          o.name === "get_client_profile_media" ? barrier : undefined,
      });
      await p.waitForFunction(
        () =>
          document.getElementById("fullName").value === "Synthetic Client A",
      );
      ok(
        await p.locator("#editPictureBtn").isDisabled(),
        "appearance loading disables edits",
      );
      await shot(p, "loading");
      release();
      await p.waitForFunction(
        () => !document.getElementById("editPictureBtn").disabled,
      );
      await c.close();
    }
    for (const [width, height] of [
      [1920, 1080],
      [1536, 1000],
      [1440, 900],
      [1366, 768],
      [1024, 768],
      [768, 1024],
      [390, 844],
      [320, 800],
    ]) {
      const { p, c, state } = await open({ width, height });
      ok(
        (await p.locator("#fullName").inputValue()) === "Synthetic Client A",
        "actual full name",
      );
      ok(
        (await p.locator("#accountEmail").textContent()) ===
          "client-a@igotu.test",
        "actual email",
      );
      ok(
        (await p.locator('.side-menu a[href="edit-profile.html"]').count()) ===
          0,
        "no profile sidebar item",
      );
      const m = await p.evaluate(() => {
        const r = (s) => {
          const b = document.querySelector(s).getBoundingClientRect();
          return {
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
            right: b.right,
            bottom: b.bottom,
          };
        };
        return {
          width: innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          cover: r("#profileCover"),
          avatar: r("#editProfileAvatar"),
          picture: r("#editPictureBtn"),
          banner: r("#changeBannerBtn"),
          save: r("#saveProfileBtn"),
        };
      });
      metrics.push(m);
      ok(m.pageWidth === width, "no horizontal overflow " + width);
      ok(
        m.avatar.y < m.cover.bottom && m.avatar.bottom > m.cover.bottom,
        "avatar overlaps cover safely",
      );
      ok(
        m.picture.width >= 44 &&
          m.picture.height >= 44 &&
          m.banner.right <= width,
        "appearance buttons usable",
      );
      ok(
        !state.calls.some(
          (o) =>
            o.name === "save_client_profile_media" || o.action === "upload",
        ),
        "initial display never mutates",
      );
      await axe(p, "profile " + width);
      await shot(p, "profile-" + width);
      await c.close();
    }
    {
      const { p, c, s, state } = await open();
      await p.locator("#editPictureBtn").click();
      ok(
        (await p.locator("#templateGallery img").count()) === 12,
        "12 local avatar templates",
      );
      await p.locator("input[name=appearanceMode][value=template]").check();
      await shot(p, "avatar-gallery");
      await axe(p, "avatar dialog");
      await p.keyboard.press("Escape");
      ok(
        await p
          .locator("#editPictureBtn")
          .evaluate((e) => e === document.activeElement),
        "dialog restores focus",
      );
      await choose(p, "avatar", "avatar-03");
      ok(
        (await p.locator("#appearanceState").textContent()) ===
          "Unsaved preview",
        "preview labelled unsaved",
      );
      ok(
        !state.calls.some(
          (o) =>
            o.action === "upload" || o.name === "save_client_profile_media",
        ),
        "selection remains local",
      );
      await p.locator("#changeBannerBtn").click();
      await p.locator("input[name=appearanceMode][value=template]").check();
      ok(
        (await p.locator("#templateGallery img").count()) === 8,
        "8 local banners",
      );
      await shot(p, "banner-gallery");
      await axe(p, "banner dialog");
      await p
        .locator("input[name=appearanceTemplate][value=banner-05]")
        .check();
      await p.locator("#useAppearancePreview").click();
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        state.row.avatar_value === "avatar-03" &&
          state.row.banner_value === "banner-05",
        "template settings acknowledged",
      );
      ok(
        !s.calls.some((o) => o.name === "complete_basic_profile"),
        "appearance save does not fake personal RPC",
      );
      await shot(p, "saved-templates");
      await p.reload();
      await p.waitForFunction(
        () =>
          document.getElementById("appearanceState").textContent ===
          "Saved appearance",
      );
      ok(
        (await p.locator("#editProfileAvatar img").getAttribute("src")) ===
          "../assets/client-edit-profile/avatars/avatar-03.svg",
        "template persists after fixture reload",
      );
      for (const route of [
        "dashboard.html",
        "create-request.html",
        "my-requests.html",
        "request-details.html?request_id=REQ-A",
        "messages.html",
        "edit-profile.html",
      ]) {
        await p.goto(base + "/client/" + route);
        await p.waitForFunction(() => document.querySelector("#avatar img"));
        ok(
          (await p.locator("#avatar img").getAttribute("src")).endsWith(
            "avatar-03.svg",
          ),
          "topbar avatar " + route,
        );
        await p.locator("#profileMenuTrigger").click();
        ok(
          await p.locator(".profile-media-summary img").isVisible(),
          "dropdown avatar " + route,
        );
      }
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await p.locator("#changeBannerBtn").click();
      await p.locator("input[name=appearanceMode][value=custom]").check();
      await p.locator("#bannerColor").selectOption("deep");
      await p.locator("#bannerAccent").selectOption("mint");
      await p.locator("#bannerPattern").selectOption("circles");
      await shot(p, "custom-banner-preview");
      await axe(p, "custom banner dialog");
      await p.locator("#useAppearancePreview").click();
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        state.row.banner_design.color === "deep" &&
          state.row.banner_design.pattern === "circles",
        "allowlisted custom settings saved",
      );
      await p.reload();
      await p.waitForFunction(
        () =>
          document.getElementById("appearanceState").textContent ===
          "Saved appearance",
      );
      ok(
        (await p.locator("#profileCover").getAttribute("style")).includes(
          "radial-gradient",
        ),
        "custom design persists",
      );
      await p.locator("#changeBannerBtn").click();
      await p.locator("input[name=appearanceMode][value=default]").check();
      await p.locator("#useAppearancePreview").click();
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(state.row.banner_mode === "default", "reset banner saved");
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await upload(p, "avatar");
      await shot(p, "avatar-cropping");
      await axe(p, "avatar crop");
      await p.locator("#useAppearancePreview").click();
      ok(!state.objects.size, "crop preview never uploads");
      await upload(p, "banner");
      await shot(p, "banner-cropping");
      await axe(p, "banner crop");
      await p.locator("#useAppearancePreview").click();
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(state.objects.size === 2, "processed avatar/banner uploaded");
      for (const o of state.objects.values()) {
        ok(
          o.type === "image/webp" && o.options.upsert === false,
          "immutable safe format",
        );
        ok(
          o.size <= (o.name.includes("/avatar/") ? 2 : 5) * 1024 * 1024,
          "processed size bound",
        );
      }
      await shot(p, "saved-uploads");
      await p.reload();
      await p.waitForFunction(() =>
        document.getElementById("editProfileAvatar").querySelector("img"),
      );
      ok(
        state.calls.some((o) => o.action === "signed" && o.expires === 300),
        "private 5 minute signing",
      );
      ok(
        state.row.avatar_value.startsWith(ids.client + "/avatar/"),
        "stored owner path not signed URL",
      );
      await choose(p, "avatar", "avatar-01");
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        state.objects.size === 1,
        "superseded avatar cleaned after confirmation",
      );
      ok(
        state.objects.has(state.row.banner_value),
        "banner last good file retained",
      );
      await p.locator("#editPictureBtn").click();
      await p.locator("input[name=appearanceMode][value=initial]").check();
      await p.locator("#useAppearancePreview").click();
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(state.row.avatar_mode === "initial", "default initial restored");
      await c.close();
    }
    {
      const { p, c, state } = await open({ width: 390, height: 844 });
      await p.locator("#editPictureBtn").click();
      await p.locator("input[name=appearanceMode][value=upload]").check();
      for (const [name, type, buffer] of [
        ["unsafe.svg", "image/svg+xml", Buffer.from("<svg/>")],
        ["spoof.png", "image/png", Buffer.from("not an image")],
        ["large.png", "image/png", Buffer.alloc(10 * 1024 * 1024 + 1)],
      ]) {
        await p
          .locator("#profileImageFile")
          .setInputFiles({ name, mimeType: type, buffer });
        await p.waitForFunction(
          () =>
            document.getElementById("appearanceDialogError").textContent
              .length > 0,
        );
        ok(
          await p.locator("#useAppearancePreview").isDisabled(),
          "invalid image blocked " + name,
        );
      }
      ok(!state.objects.size, "invalid files not uploaded");
      await shot(p, "invalid-image-mobile");
      await axe(p, "mobile invalid file");
      await p.keyboard.press("Escape");
      await choose(p, "avatar", "avatar-02");
      await p.locator("#cancelProfileBtn").click();
      ok(
        await p.locator("#unsavedProfileDialog").isVisible(),
        "dirty Cancel confirmation",
      );
      await p.locator("#keepEditingBtn").click();
      ok(
        (await p.locator("#appearanceState").textContent()) ===
          "Unsaved preview",
        "Keep Editing preserves preview",
      );
      await p.locator("#cancelProfileBtn").click();
      await p.locator("#discardChangesBtn").click();
      ok(
        (await p.locator("#appearanceState").textContent()) ===
          "Saved appearance",
        "Cancel restores last confirmed state",
      );
      await p.locator("#fullName").fill("Unsaved Name");
      await p.locator(".profile-back").click();
      await p.locator("#keepEditingBtn").click();
      ok(
        (await p.locator("#fullName").inputValue()) === "Unsaved Name",
        "navigation warning preserves form",
      );
      await shot(p, "unsaved-mobile");
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await upload(p, "avatar");
      await p.locator("#useAppearancePreview").click();
      state.failUpload = true;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "upload could not be confirmed");
      ok(
        (await p.locator("#appearanceState").textContent()) ===
          "Unsaved preview",
        "failed upload retains preview",
      );
      ok(
        !state.calls.some((o) => o.name === "save_client_profile_media"),
        "failed upload never saves settings",
      );
      await shot(p, "upload-error");
      state.failUpload = false;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      const calls = state.calls.filter((o) => o.action === "upload");
      ok(
        calls.length === 2 && calls[0].name === calls[1].name,
        "upload retry reuses exact path",
      );
      ok(state.objects.size === 1, "one stored retry object");
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await upload(p, "avatar");
      await p.locator("#useAppearancePreview").click();
      state.failSave = true;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "saving could not be confirmed");
      const prior = state.calls.filter(
        (o) => o.name === "save_client_profile_media",
      )[0].args;
      ok(
        state.objects.size === 1,
        "uploaded object retained after save failure",
      );
      await shot(p, "save-error");
      state.failSave = false;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        state.calls.filter((o) => o.action === "upload").length === 1,
        "retry does not upload again after upload acknowledgement",
      );
      const last = state.calls
        .filter((o) => o.name === "save_client_profile_media")
        .at(-1).args;
      ok(
        prior.p_operation_id === last.p_operation_id,
        "retry uses same operation",
      );
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await choose(p, "avatar", "avatar-04");
      state.lostSave = true;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(state.row.version === 1, "lost save response reconciled");
      ok(
        state.calls.filter((o) => o.name === "save_client_profile_media")
          .length === 1,
        "no duplicated lost-response mutation",
      );
      await shot(p, "success");
      await c.close();
    }
    {
      let fail = true;
      const { p, c, s, state } = await open({
        fail: (o) =>
          fail && o.kind === "rpc" && o.name === "complete_basic_profile",
      });
      await choose(p, "avatar", "avatar-05");
      await p.locator("#fullName").fill("Synthetic Updated Client");
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Appearance saved.");
      ok(
        state.row.avatar_value === "avatar-05",
        "appearance commit retained on personal failure",
      );
      ok(
        (await p.locator("#fullName").inputValue()) ===
          "Synthetic Updated Client",
        "personal failure keeps values",
      );
      await shot(p, "partial-save");
      fail = false;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        state.row.version === 1,
        "partial retry does not save appearance twice",
      );
      const rpc = s.calls
        .filter((o) => o.name === "complete_basic_profile")
        .at(-1);
      ok(
        Object.keys(rpc.args).sort().join() === "p_full_name,p_phone",
        "original personal RPC signature",
      );
      await c.close();
    }
    {
      const { p, c, state } = await open({ unavailable: true });
      ok(
        await p.locator("#editPictureBtn").isDisabled(),
        "missing migration disables media actions",
      );
      await p.locator("#fullName").fill("Synthetic Personal Only");
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        !state.calls.some((o) => o.name === "save_client_profile_media"),
        "personal save works without media backend",
      );
      await shot(p, "media-unavailable");
      state.unavailable = false;
      await p.locator("#retryAppearanceBtn").click();
      await p.waitForFunction(
        () => !document.getElementById("editPictureBtn").disabled,
      );
      ok(
        (await p.locator("#appearanceState").textContent()) ===
          "Saved appearance",
        "appearance availability retry",
      );
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await choose(p, "avatar", "avatar-06");
      let release;
      const pending = new Promise((r) => (release = r));
      state.hold = (o) =>
        o.name === "save_client_profile_media" ? pending : undefined;
      await p.locator("#saveProfileBtn").click();
      await p.waitForFunction(
        () => document.getElementById("saveProfileBtn").disabled,
      );
      await p
        .locator("#editProfileForm")
        .evaluate((f) =>
          f.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          ),
        );
      await shot(p, "saving");
      ok(
        state.calls.filter((o) => o.name === "save_client_profile_media")
          .length === 1,
        "duplicate submit locked",
      );
      release();
      await notice(p, "Profile updated successfully");
      await c.close();
    }
    for (const role of ["provider", "admin"]) {
      const { p, c, state } = await open({ role, noWait: true });
      await p.waitForTimeout(300);
      ok(!state.calls.length, "unauthorized " + role + " no media operations");
      await c.close();
    }
    {
      const { p, c, state } = await open();
      const r = await p.evaluate(async () =>
        window.__profileMediaApi({
          kind: "storage",
          action: "upload",
          bucket: "client-profile-media",
          name: "another-account/avatar/unsafe.webp",
          type: "image/webp",
          options: { upsert: false },
        }),
      );
      ok(
        !!r.error && !state.objects.size,
        "fixture rejects cross-account path",
      );
      await c.close();
    }

    {
      const { p, c, state } = await open();
      await choose(p, "avatar", "avatar-07");
      state.row = {
        ...state.row,
        avatar_mode: "template",
        avatar_value: "avatar-08",
        version: 1,
        last_operation_id: "another-operation",
      };
      await p.locator("#saveProfileBtn").click();
      await notice(p, "changed in another tab");
      ok(
        state.row.avatar_value === "avatar-08",
        "stale version cannot overwrite newer tab",
      );
      ok(
        (await p.locator("#appearanceState").textContent()) ===
          "Unsaved preview",
        "conflict retains local preview",
      );
      await shot(p, "version-conflict");
      await p.locator("#retryAppearanceBtn").click();
      await p.locator("#discardChangesBtn").click();
      await p.waitForFunction(
        () =>
          document.getElementById("appearanceState").textContent ===
          "Saved appearance",
      );
      ok(
        (
          await p.locator("#editProfileAvatar img").getAttribute("src")
        ).endsWith("avatar-08.svg"),
        "conflict reload recovers confirmed appearance",
      );
      await c.close();
    }
    {
      const { p, c, state } = await open();
      state.row.user_id = ids.provider;
      await p.reload();
      await p.waitForFunction(
        () =>
          document.getElementById("appearanceState").textContent ===
          "Unavailable",
      );
      ok(
        await p.locator("#editPictureBtn").isDisabled(),
        "foreign media response fails closed",
      );
      await c.close();
    }
    {
      const { p, c, state } = await open();
      await upload(p, "avatar");
      await p.locator("#useAppearancePreview").click();
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      state.failDelete = true;
      await choose(p, "avatar", "avatar-09");
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      ok(
        (await p.locator("#appearanceNotice").textContent()).includes(
          "await cleanup",
        ),
        "cleanup failure reported separately",
      );
      ok(
        state.row.avatar_value === "avatar-09" && state.objects.size === 1,
        "cleanup failure preserves confirmed appearance and old object",
      );
      await shot(p, "cleanup-warning");
      await c.close();
    }
    {
      const { p, c } = await open({
        width: 320,
        prepare: (t) => {
          t.users.find((u) => u.id === ids.client).full_name =
            "<img src=x onerror=alert(1)> " + "Long Name ".repeat(8);
        },
      });
      ok(
        (await p.locator("#editProfileDisplayName img").count()) === 0,
        "name uses safe text",
      );
      ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth === innerWidth,
        ),
        "long name does not overflow",
      );
      await shot(p, "long-name-320");
      await axe(p, "long name phone");
      await c.close();
    }

    {
      const { p, c, state } = await open();
      await upload(p, "avatar");
      await p.locator("#useAppearancePreview").click();
      state.lostUpload = true;
      await p.locator("#saveProfileBtn").click();
      await notice(p, "upload could not be confirmed");
      ok(
        state.objects.size === 1,
        "lost upload response retains one immutable object",
      );
      await p.locator("#saveProfileBtn").click();
      await notice(p, "Profile updated successfully");
      const calls = state.calls.filter((o) => o.action === "upload");
      ok(
        calls.length === 2 && calls[0].name === calls[1].name,
        "uncertain upload retries same immutable key",
      );
      ok(
        state.objects.size === 1 && state.row.avatar_mode === "upload",
        "409 recovery adopts original confirmed upload",
      );
      await c.close();
    }
    ok(!errors.length, "no runtime errors " + errors.join(","));
    fs.writeFileSync(
      `${out}/responsive-metrics.json`,
      JSON.stringify(metrics, null, 2) + "\n",
    );
    fs.writeFileSync(
      `${out}/validation/focused.json`,
      JSON.stringify(
        {
          assertions: count,
          axeScans: scans,
          axeViolations: 0,
          liveBackend: false,
          sqlExecuted: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      `PASS ${count} profile assertions; ${scans} axe scans; synthetic/offline only`,
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
