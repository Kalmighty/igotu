const fs = require("node:fs");
const { check, validatePublic, validate } = require("./runtime.cjs");
function load(args) {
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
    validatePublic(config, approval);
    const secretFile = flag("--secrets");
    check(
      (fs.statSync(secretFile).mode & 0o077) === 0,
      "SECRET_FILE_PERMISSIONS_REQUIRED",
    );
    secrets = JSON.parse(fs.readFileSync(secretFile, "utf8"));
  } catch (e) {
    check(false, e.safeCode || "LOCAL_CONFIGURATION_INVALID");
  }
  validate(config, approval, secrets);
  return { config, approval, secrets };
}
module.exports = { load };
