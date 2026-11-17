// Paints a band of the valley's ground off the page (see paintBaseParallel in ground.js).
import { paintBase } from "./ground.js";

self.onmessage = (e) => {
  const { y0, y1 } = e.data;
  const r = paintBase(y0, y1, (k) => self.postMessage({ progress: k }));
  self.postMessage(r, [r.d.buffer, r.wfAt.buffer, r.lushAt.buffer]);
};
