/* Review-only source boundary; no SQL execution or live service access. */
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  vm = require("node:vm");
const { execFileSync } = require("node:child_process"),
  { createHash } = require("node:crypto");
const base = "60e3b56523265c75f981e380a50fa1209b190502",
  root = "igotu_v2/";
const allowed = new Set(
  [
    "client/dashboard.html",
    "client/create-request.html",
    "client/my-requests.html",
    "client/request-details.html",
    "client/messages.html",
    "client/edit-profile.html",
    "js/client-edit-profile.js",
  ].map((p) => root + p),
);
const old = (p) => execFileSync("git", ["show", `${base}:${p}`]);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", base], {
  encoding: "utf8",
})
  .trim()
  .split("\n");
let protectedCount = 0;
for (const p of paths.filter(
  (p) =>
    (p.startsWith(root) && !allowed.has(p)) ||
    p.endsWith(".sql") ||
    [
      "tests/system-functional.cjs",
      "tests/auth-smoke.cjs",
      "tests/mandatory-verification.cjs",
      "tests/ui-smoke.cjs",
    ].includes(p),
)) {
  assert.equal(hash(fs.readFileSync(p)), hash(old(p)), p);
  protectedCount++;
}
for (const name of [
  "dashboard",
  "create-request",
  "my-requests",
  "request-details",
  "messages",
]) {
  const p = `${root}client/${name}.html`,
    strip = (s) =>
      s
        .replace(
          /<link rel="stylesheet" href="\.\.\/css\/client-profile-media.css"\s*\/>/g,
          "",
        )
        .replace(
          /<script type="module" src="\.\.\/js\/client-profile-media-display.js"><\/script>/g,
          "",
        )
        .replace(/\s+/g, " ")
        .trim();
  assert.equal(
    strip(fs.readFileSync(p, "utf8")),
    strip(old(p).toString()),
    "unrelated HTML changed " + name,
  );
}
const js = fs.readFileSync(root + "js/client-edit-profile.js", "utf8");
assert(
  /phone\.replace\(\/\[\^0-9\+\]\/g, ""\)\.length < 7/.test(js),
  "original phone validation",
);
assert(
  js.includes(
    '.select(\n      "id, user_code, full_name, email, phone, role, status, profile_completed",\n    )',
  ) && js.includes('.eq("id", sessionData.session.user.id)'),
  "owned profile query",
);
assert(
  js.includes(
    '"complete_basic_profile", {\n        p_full_name: fullName,\n        p_phone: phone,\n      }',
  ),
  "original basic RPC signature",
);
assert(
  !/\.from\("users"\)[\s\S]{0,30}\.update|service_role|\.getPublicUrl\(/.test(
    js,
  ),
  "unsafe direct update/media exposure",
);
assert(js.includes("if (saving || !profile) return;"), "duplicate save lock");
for (const f of [
  "client-edit-profile.js",
  "client-profile-media.js",
  "client-profile-media-display.js",
])
  new vm.Script(
    fs
      .readFileSync(root + "js/" + f, "utf8")
      .replace(/^import[\s\S]*?from "[^"\n]+";\n/gm, "")
      .replace(/^export /gm, ""),
    { filename: f },
  );
const html = fs.readFileSync(root + "client/edit-profile.html", "utf8"),
  ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
assert.equal(ids.length, new Set(ids).size, "unique IDs");
for (const [, id] of old(root + "client/edit-profile.html")
  .toString()
  .matchAll(/\bid="([^"]+)"/g))
  assert(ids.includes(id), "original ID " + id);
for (const [, id] of html.matchAll(/<label[^>]*for="([^"]+)"/g))
  assert(ids.includes(id), "label " + id);
for (const [, id] of html.matchAll(/<use href="#([^"]+)"/g))
  assert(ids.includes(id), "icon " + id);
assert.equal((html.match(/<dialog\b/g) || []).length, 2);
const assets = root + "assets/client-edit-profile/";
assert.equal(fs.readdirSync(assets + "avatars").length, 12);
assert.equal(fs.readdirSync(assets + "banners").length, 8);
for (const dir of ["avatars", "banners"])
  for (const f of fs.readdirSync(assets + dir)) {
    const s = fs.readFileSync(assets + dir + "/" + f, "utf8");
    assert(
      !/<script|foreignObject|https?:\/\/(?!www.w3.org\/2000\/svg)/.test(s),
      "local original SVG " + f,
    );
  }
const sqlPath =
    root +
    "database/client-profile-media-review/" +
    fs.readdirSync(root + "database/client-profile-media-review")[0],
  sql = fs.readFileSync(sqlPath, "utf8");
for (const clause of [
  "ENABLE ROW LEVEL SECURITY",
  "AS RESTRICTIVE",
  "require_workspace('client')",
  "FOR UPDATE",
  "last_operation_id=p_operation_id",
  "version<>p_expected_version",
  "upsert",
  "public.complete_basic_profile",
]) {
  if (["upsert", "public.complete_basic_profile"].includes(clause))
    assert(!sql.includes(clause), "existing contract or upsert changed");
  else assert(sql.includes(clause), "SQL boundary " + clause);
}
assert(
  sql.includes(
    "VALUES('client-profile-media','client-profile-media',false,5242880,ARRAY['image/webp'])",
  ),
  "private bounded bucket",
);
assert(
  !/CREATE (?:OR REPLACE )?FUNCTION public\.[\s\S]*?SECURITY DEFINER/.test(sql),
  "public definer endpoint",
);
assert(
  !/ALTER TABLE public\.users|UPDATE public\.users|GRANT UPDATE.*users/i.test(
    sql,
  ),
  "existing users permissions",
);
fs.mkdirSync("docs/client-edit-profile/validation", { recursive: true });
fs.writeFileSync(
  "docs/client-edit-profile/validation/source-contract.json",
  JSON.stringify(
    {
      base,
      protectedFiles: protectedCount,
      otherClientHtml: "only media stylesheet/module opt-in",
      personalRpc: "complete_basic_profile(p_full_name,p_phone)",
      originalValidation: true,
      localAvatars: 12,
      localBanners: 8,
      syntax: true,
      sql: "source checks only; never executed",
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `PASS ${protectedCount} protected files; five Client pages only opt into shared media display; personal RPC/validation/query; IDs/labels/icons; 12/8 local assets; JS syntax and review-only SQL boundaries.`,
);
