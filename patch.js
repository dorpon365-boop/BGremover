/* patch.js v2 – add next to index.html. Sharper edges, high-quality export, PDF, quality & DPI options. */
(() => {
  const $ = s => document.querySelector(s);

  // ---------- 1. Sharper edges (applied to the AI mask when it is created) ----------
  const M = { alpha: null, ctx: null, w: 0, h: 0, s: 0.5 };
  const lut = s => { const g = 1 + s * 7, t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) t[i] = ((i / 255 - 0.5) * g + 0.5) * 255; return t; };
  const applyLut = (data, alpha) => { const t = lut(M.s); for (let i = 0; i < alpha.length; i++) data[4 * i + 3] = t[alpha[i]]; };
  if (typeof OffscreenCanvasRenderingContext2D !== "undefined") {
    const P = OffscreenCanvasRenderingContext2D.prototype, rawPut = P.putImageData;
    M.rawPut = rawPut;
    P.putImageData = function (img, x, y, ...r) {
      if (this.canvas instanceof OffscreenCanvas && !x && !y && img.data[0] === 255 && img.data[1] === 255 && img.data[2] === 255) {
        const n = img.width * img.height, a = new Uint8Array(n);
        for (let i = 0; i < n; i++) a[i] = img.data[4 * i + 3];
        M.alpha = a; M.ctx = this; M.w = img.width; M.h = img.height;
        applyLut(img.data, a);
      }
      return rawPut.call(this, img, x, y, ...r);
    };
  }
  function resharpen() {
    if (!M.alpha || !M.ctx) return;
    const d = new ImageData(M.w, M.h); d.data.fill(255); applyLut(d.data, M.alpha);
    M.ctx.globalCompositeOperation = "source-over"; M.ctx.clearRect(0, 0, M.w, M.h);
    M.rawPut.call(M.ctx, d, 0, 0);
    const soft = $("#soft"); if (soft) soft.dispatchEvent(new Event("input")); // makes the app repaint
  }

  // ---------- 2. Extra controls ----------
  function addUI() {
    const soft = $("#soft"), fmt = $("#fmt");
    if (!soft || !fmt || $("#xq")) return;
    const sh = document.createElement("div");
    sh.innerHTML = '<div class="row"><span>Edge sharpness</span><span id="xsv">50</span></div><input id="xs" type="range" min="0" max="100" value="50" aria-label="Edge sharpness"><div style="font-size:12px;color:#6A6F78;margin-top:6px">Set this before using the brush. High values make edges crisp; lower keeps fine hair.</div>';
    soft.insertAdjacentElement("afterend", sh);
    $("#xs").oninput = e => { M.s = e.target.value / 100; $("#xsv").textContent = e.target.value; resharpen(); };

    if (![...fmt.options].some(o => o.value === "application/pdf")) fmt.add(new Option("PDF (print ready)", "application/pdf"));
    const ex = document.createElement("div");
    ex.innerHTML = '<div class="row"><span>Quality (JPG / WebP / PDF)</span><span id="xqv">100%</span></div><input id="xq" type="range" min="70" max="100" value="100" aria-label="Quality"><div class="row"><span>Print resolution (passport / stamp)</span></div><select id="xdpi" aria-label="Print resolution"><option value="300">300 DPI (standard)</option><option value="600">600 DPI (extra sharp)</option></select>';
    fmt.parentElement.insertAdjacentElement("afterend", ex);
    $("#xq").oninput = e => $("#xqv").textContent = e.target.value + "%";
  }

  // ---------- 3. High-quality export ----------
  const MM = { "35x45": [35, 45], "51x51": [50.8, 50.8], "20x25": [20, 25], "25x35": [25, 35] };
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // crop in one step, then halve repeatedly (avoids the blur/aliasing of one huge downscale)
  function hq(src, r, ow, oh, white) {
    let c = mk(r.w, r.h), g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    if (white) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    while (c.width / 2 >= ow && c.height / 2 >= oh) {
      const n = mk(c.width / 2, c.height / 2), m = n.getContext("2d"); m.imageSmoothingQuality = "high";
      m.drawImage(c, 0, 0, n.width, n.height); c = n;
    }
    const o = mk(ow, oh), q = o.getContext("2d"); q.imageSmoothingQuality = "high";
    q.drawImage(c, 0, 0, ow, oh); return o;
  }
  function region(cv) {
    const el = $("#crop");
    if (el && el.style.display === "block") {
      const W = cv.width, H = cv.height, p = k => parseFloat(el.style[k]) / 100;
      return { x: p("left") * W, y: p("top") * H, w: p("width") * W, h: p("height") * H };
    }
    return { x: 0, y: 0, w: cv.width, h: cv.height };
  }
  function build() {
    const cv = $("#cv"), r = region(cv), preset = $("#preset").value, fmt = $("#fmt").value, dpi = +($("#xdpi") || { value: 300 }).value;
    let ow, oh, mmW, mmH;
    if (MM[preset]) { [mmW, mmH] = MM[preset]; ow = Math.round(mmW / 25.4 * dpi); oh = Math.round(mmH / 25.4 * dpi); }
    else { const s = +$("#scale").value; ow = Math.round(r.w * s); oh = Math.round(r.h * s); mmW = ow / 300 * 25.4; mmH = oh / 300 * 25.4; }
    const canvas = hq(cv, r, ow, oh, fmt !== "image/png" && fmt !== "image/webp");
    return { canvas, mmW, mmH, preset };
  }
  const blob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
  async function pdf(canvas, wmm, hmm, q) {
    const jpg = new Uint8Array(await (await blob(canvas, "image/jpeg", q)).arrayBuffer()), enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const add = d => { const b = typeof d === "string" ? enc.encode(d) : d; parts.push(b); len += b.length; };
    const W = (wmm * 72 / 25.4).toFixed(2), H = (hmm * 72 / 25.4).toFixed(2);
    const obj = (n, head, stream) => { offs[n] = len; add(`${n} 0 obj\n${head}\n`); if (stream) { add("stream\n"); add(stream); add("\nendstream\n"); } add("endobj\n"); };
    add("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    obj(4, `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
    const cs = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`; obj(5, `<< /Length ${cs.length} >>`, cs);
    const x = len; add("xref\n0 6\n0000000000 65535 f \n" + [1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`);
    return new Blob(parts, { type: "application/pdf" });
  }
  async function output(canvas, mmW, mmH, name) {
    const fmt = $("#fmt").value, q = +($("#xq") || { value: 100 }).value / 100;
    const b = fmt === "application/pdf" ? await pdf(canvas, mmW, mmH, q) : await blob(canvas, fmt, q);
    const ext = fmt === "application/pdf" ? "pdf" : fmt === "image/jpeg" ? "jpg" : fmt.split("/")[1];
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${name}.${ext}`; a.click();
  }

  // Intercept the app's own Download buttons (capture phase = runs first, works whatever the load order)
  document.addEventListener("click", async e => {
    const btn = e.target.closest && e.target.closest("#dl, #sheet");
    if (!btn || btn.disabled) return;
    e.stopImmediatePropagation(); e.preventDefault();
    try {
      const p = build();
      if (btn.id === "dl") return output(p.canvas, p.mmW, p.mmH, `photo-${p.preset || "cutout"}`);
      const dpi = +($("#xdpi") || { value: 300 }).value, SW = 4 * dpi, SH = 6 * dpi, g = Math.round(0.08 * dpi);
      const s = mk(SW, SH), c = s.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, SW, SH);
      const cols = Math.floor((SW + g) / (p.canvas.width + g)), rows = Math.floor((SH + g) / (p.canvas.height + g));
      const ox = (SW - (cols * (p.canvas.width + g) - g)) / 2, oy = (SH - (rows * (p.canvas.height + g) - g)) / 2;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) c.drawImage(p.canvas, ox + i * (p.canvas.width + g), oy + j * (p.canvas.height + g));
      output(s, 101.6, 152.4, `print-sheet-4x6-${p.preset}`);
    } catch (err) { console.error(err); alert("Could not create the file: " + err.message); }
  }, true);

  // ---------- 4. Branding + footer links ----------
  function brand() {
    const b = document.querySelector("header b"); if (b) b.textContent = "Chobi";
    document.title = "Chobi: Passport Photo Maker – Free Passport & Stamp Size Photos";
    if (!$("#xfoot")) {
      const f = document.createElement("footer"); f.id = "xfoot";
      f.style.cssText = "max-width:1100px;margin:24px auto;padding:16px 24px;font-size:13px;color:#4A4F57;text-align:center";
      f.innerHTML = '<a href="about.html">About</a> · <a href="privacy.html">Privacy Policy</a> · <a href="terms.html">Terms</a> · <a href="disclaimer.html">Disclaimer</a> · <a href="contact.html">Contact</a><div style="margin-top:8px">Always check the official photo requirements of the authority you are applying to.</div>';
      document.body.appendChild(f);
    }
  }
  const init = () => { addUI(); brand(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
