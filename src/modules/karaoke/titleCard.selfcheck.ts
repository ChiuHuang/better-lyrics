import { strict as assert } from "node:assert";
import { isTitleCardVisible } from "./titleCard";

const at = (credits: Parameters<typeof isTitleCardVisible>[0]["credits"], firstSungLineStartS: number, timeS: number) =>
  isTitleCardVisible({ credits, firstSungLineStartS, timeS });

assert.equal(at("auto", 12, 3), true, "auto shows during a long intro");
assert.equal(at("auto", 12, 9.6), false, "auto clears 2.5 s before the first line");
assert.equal(at("auto", 12, 0.2), false, "auto waits until 0.5 s");
assert.equal(at("auto", 12, 0.5), true, "start boundary is inclusive");
assert.equal(at("auto", 12, 9.5), false, "clear boundary is exclusive");
assert.equal(at("auto", 5, 1), true, "auto shows at exactly the minimum intro");
assert.equal(at("auto", 4, 1), false, "auto skips a short intro");
assert.equal(at("intro", 4, 1), true, "intro shows on a short intro");
assert.equal(at("intro", 2.8, 0.6), false, "intro needs a positive window");
assert.equal(at("outro", 12, 3), false);
assert.equal(at("off", 12, 3), false);

console.log("karaoke title card self-check passed");
