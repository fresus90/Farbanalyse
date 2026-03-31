/**
 * Hintergrund-Entfernung via Canvas Flood-Fill
 * Client-seitig, keine API nötig.
 */

/**
 * Entfernt den Hintergrund eines Bildes per Flood-Fill vom Rand.
 * @param {HTMLImageElement} imgEl - Das Quellbild
 * @param {HTMLCanvasElement} workCanvas - Arbeits-Canvas (versteckt)
 * @returns {Promise<string>} Data-URL des freigestellten Bildes
 */
export function removeBackground(imgEl, workCanvas) {
  return new Promise((resolve, reject) => {
    try {
      const MAX = 900;
      let W = imgEl.naturalWidth;
      let H = imgEl.naturalHeight;

      if (W > MAX) { H = Math.round(H * MAX / W); W = MAX; }
      if (H > MAX) { W = Math.round(W * MAX / H); H = MAX; }

      workCanvas.width = W;
      workCanvas.height = H;

      const ctx = workCanvas.getContext('2d');
      ctx.drawImage(imgEl, 0, 0, W, H);

      const id = ctx.getImageData(0, 0, W, H);
      const d = id.data;

      // Hintergrundfarbe aus Randpixeln schätzen
      const samples = [];
      for (let x = 0; x < W; x++) {
        samples.push([d[(0 * W + x) * 4], d[(0 * W + x) * 4 + 1], d[(0 * W + x) * 4 + 2]]);
        samples.push([d[((H - 1) * W + x) * 4], d[((H - 1) * W + x) * 4 + 1], d[((H - 1) * W + x) * 4 + 2]]);
      }
      for (let y = 0; y < H; y++) {
        samples.push([d[(y * W) * 4], d[(y * W) * 4 + 1], d[(y * W) * 4 + 2]]);
        samples.push([d[(y * W + W - 1) * 4], d[(y * W + W - 1) * 4 + 1], d[(y * W + W - 1) * 4 + 2]]);
      }

      const bgR = samples.reduce((a, c) => a + c[0], 0) / samples.length;
      const bgG = samples.reduce((a, c) => a + c[1], 0) / samples.length;
      const bgB = samples.reduce((a, c) => a + c[2], 0) / samples.length;

      const HARD = 48;
      const SOFT = 70;

      function dist(i) {
        const dr = d[i] - bgR, dg = d[i + 1] - bgG, db = d[i + 2] - bgB;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      }

      // Flood-Fill vom Rand
      const visited = new Uint8Array(W * H);
      const queue = [];

      function enq(x, y) {
        const i = y * W + x;
        if (visited[i]) return;
        visited[i] = 1;
        if (dist(i * 4) < HARD) queue.push(i);
      }

      for (let x = 0; x < W; x++) { enq(x, 0); enq(x, H - 1); }
      for (let y = 0; y < H; y++) { enq(0, y); enq(W - 1, y); }

      let qi = 0;
      while (qi < queue.length) {
        const i = queue[qi++];
        d[i * 4 + 3] = 0; // Alpha auf 0

        const qx = i % W;
        const qy = (i / W) | 0;

        const neighbors = [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (visited[ni]) continue;
          visited[ni] = 1;
          const nd = dist(ni * 4);
          if (nd < HARD) queue.push(ni);
          else if (nd < SOFT) d[ni * 4 + 3] = Math.round(((nd - HARD) / (SOFT - HARD)) * 255);
        }
      }

      // Kantenglättung
      const alpha = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) alpha[i] = d[i * 4 + 3];

      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (alpha[i] === 255) {
            const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
            const hasTransparent = neighbors.some(([px, py]) => alpha[py * W + px] === 0);
            if (hasTransparent) d[i * 4 + 3] = 140;
          }
        }
      }

      ctx.putImageData(id, 0, 0);
      resolve(workCanvas.toDataURL('image/png'));
    } catch (err) {
      reject(err);
    }
  });
}
