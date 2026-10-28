const fs = require("node:fs");
const path = require("node:path");
const { check, validatePublic, validate } = require("./runtime.cjs");
function load(args, options = {}) {
  const flag = (n) => {
    const i = args.indexOf(n);
    check(
      i >= 0 && args[i + 1],
      "EXPLICIT_CONFIG_APPROVAL_AND_SECRET_FILES_REQUIRED",
    );
    return args[i + 1];
  };
  let config, approval, secrets;
  try {
    config = JSON.parse(fs.readFileSync(flag("--config"), "utf8"));
    approval = JSON.parse(fs.readFileSync(flag("--approval"), "utf8"));
    validatePublic(config, approval, options);
    const secretFile = flag("--secrets");
    const secretPath = fs.realpathSync(secretFile);
    if (config.frontendDirectory) {
      const frontend = fs.existsSync(config.frontendDirectory)
        ? fs.realpathSync(config.frontendDirectory)
        : path.resolve(config.frontendDirectory);
      check(
        secretPath !== frontend && !secretPath.startsWith(frontend + path.sep),
        "SECRETS_OUTSIDE_FRONTEND_REQUIRED",
      );
    }
    // Windows uses ACLs, not POSIX permission bits. Keep the file outside the repo.
    if (options.remaining) {
      const repo = fs.realpathSync(path.resolve(__dirname, "../.."));
      const relative = path.relative(repo, secretPath);
      check(relative.startsWith(".." + path.sep) || path.isAbsolute(relative), "SECRETS_OUTSIDE_REPOSITORY_REQUIRED");
    }
    check(
      process.platform === "win32" || (fs.statSync(secretFile).mode & 0o077) === 0,
      "SECRET_FILE_PERMISSIONS_REQUIRED",
    );
    secrets = JSON.parse(fs.readFileSync(secretFile, "utf8"));
  } catch (e) {
    check(false, e.safeCode || "LOCAL_CONFIGURATION_INVALID");
  }
  validate(config, approval, secrets, options);
  return { config, approval, secrets };
}
module.exports = { load };
