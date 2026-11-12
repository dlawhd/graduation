import test from "node:test";
import assert from "node:assert/strict";
import { loginReturnTarget } from "./loginReturn.mjs";

test("login return keeps the registered route, query and fragment", () => {
  for (const path of ["/support/new?from=%2Fjars%2F7&jarId=7#context", "/invite/AB12CD", "/jars/7?tab=members", "/jars/design/new?draft=18"]) {
    assert.equal(loginReturnTarget(path), path);
  }
});

test("login return rejects other origins and non-destination routes", () => {
  for (const path of [null, "//other.example/jars", "/\\other.example/jars", "https://other.example", "/login/success", "/jars/../jars", "/jars/%2e%2e/jars", "/support/new\n", "/unknown", "/%2Fjars"]) {
    assert.equal(loginReturnTarget(path), null);
  }
});
