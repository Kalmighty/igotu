/* Prepared real signed-URL expiry test; no network unless separately authorized. */
const { makeRuntime, check } = require("./runtime.cjs");
function signedResource(value) {
  check(typeof value === "string", "SIGNED_URL_REQUIRED");
  const resource = value.startsWith("/object/sign/")
    ? "/storage/v1" + value
    : value;
  check(
    resource.startsWith("/storage/v1/object/sign/payment-proofs/") &&
      resource.includes("?token="),
    "SIGNED_URL_PATH_REJECTED",
  );
  return resource;
}
async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--execute")) {
    console.log(
      "PREPARED_NOT_EXECUTED: 300-second receipt URL, anonymous public denial, expiry after 305 seconds, reauthorized fresh preview.",
    );
    return;
  }
  const { config, approval, secrets } = require("./config.cjs").load(args);
  const x = makeRuntime(config, approval, secrets);
  let a = await x.actor("providerA");
  check(config.receiptRequestId, "SYNTHETIC_RECEIPT_FIXTURE_REQUIRED");
  const ref = await x.success(
    x.rpc(a, "payment_proof_reference", {
      p_request_id: config.receiptRequestId,
    }),
  );
  check(ref.length === 1, "RECEIPT_REFERENCE_CONTROL_FAILED");
  const endpoint =
    "/storage/v1/object/sign/payment-proofs/" +
    ref[0].proof_path.split("/").map(encodeURIComponent).join("/");
  async function sign() {
    const r = await x.success(
      x.request(a, endpoint, { method: "POST", body: { expiresIn: 300 } }),
    );
    return signedResource(r.signedURL || r.signedUrl);
  }
  const old = await sign();
  check((await x.request(null, old)).ok, "SIGNED_URL_POSITIVE_CONTROL_FAILED");
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 30000));
    console.log("Waiting for signed-URL expiry: " + (i + 1) * 30 + " seconds");
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const expired = await x.request(null, old);
  check(
    !expired.ok && [400, 401, 403].includes(expired.status),
    "SIGNED_URL_NOT_EXPIRED",
  );
  a = await x.actor("providerA", { refresh: true });
  await x.sessionControl(a);
  check((await x.request(null, await sign())).ok, "SIGNED_URL_REFRESH_FAILED");
  console.log(
    "PASS actual 300-second expiry and reauthorization. No URL/token recorded.",
  );
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      "BLOCKED_OR_FAILED: " + (e.safeCode || "EXPIRY_CONTROL_FAILED"),
    );
    process.exitCode = 2;
  });
module.exports = { signedResource };
