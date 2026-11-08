import test from "node:test";
import assert from "node:assert/strict";
import { readSelection, speechAvailable } from "../client/src/read-aloud.js";

function fixture(text = "Selected passage") {
  const calls = [];
  const api = {
    tts: { pause() {}, resume() {}, getVoices: async () => [{ voiceName: "Remote", remote: true }, { voiceName: "Local", remote: false }], stop: () => calls.push("stop"), speak: async (text, options) => calls.push({ text, options }) },
    scripting: { executeScript: async target => { calls.push(target); return [{ result: { text } }]; } }
  };
  return { api, calls };
}
test("missing speech APIs report recovery steps instead of a TypeError", async () => {
  for (const api of [undefined, {}, { tts: {} }]) {
    assert.equal(speechAvailable(api), false);
    await assert.rejects(readSelection(api, "42"), /Reload Clearspace/);
  }
  assert.equal(speechAvailable(fixture().api), true);
});
test("reads original tab selection with a local voice and bounded speed", async () => {
  const { api, calls } = fixture();
  await readSelection(api, "42", { rate: 10, voiceName: "Remote" });
  assert.equal(calls[0].target.tabId, 42);
  assert.equal(calls[1], "stop");
  assert.equal(calls[2].text, "Selected passage");
  assert.equal(calls[2].options.voiceName, "Local");
  assert.equal(calls[2].options.rate, 2);
});
test("missing target, empty and oversized selections never speak", async () => {
  for (const [tab, text, message] of [[null, "text", /extension icon/], ["42", "", /No text selected/], ["42", "a".repeat(32769), /shorter passage/]]) {
    const { api, calls } = fixture(text);
    await assert.rejects(readSelection(api, tab), message);
    assert.ok(!calls.some(call => call === "stop" || call.text));
  }
});
test("permission failures and missing local voices produce useful errors", async () => {
  const { api } = fixture();
  api.scripting.executeScript = async () => { throw new Error("denied"); };
  await assert.rejects(readSelection(api, "42"), /protected/);
  api.tts.getVoices = async () => [{ remote: true }];
  await assert.rejects(readSelection(api, "42"), /No local speech voice/);
});
test("stop or unmount during loading prevents delayed speech", async () => {
  const { api, calls } = fixture();
  await readSelection(api, "42", {}, undefined, () => false);
  assert.equal(calls.length, 1);
});
