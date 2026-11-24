/* ShapeBlur for the desktop footer logo: a soft blur "lens" that drifts across the logo
   (or follows the pointer), with a slight colour split at its edge.

   Plain-JS port of React Bits' <ShapeBlur /> (JS-CSS variant, https://reactbits.dev/animations/shape-blur),
   changed for this page:
   - the logo keeps its own colours (gradient bubble + dark wordmark) instead of one flat colour;
   - the logo's outline is the SVG itself, drawn at the canvas's real pixel size, so it stays as sharp as
     the plain image wherever the lens isn't (React Bits rebuilds it from a 512px distance field, which
     makes thin lettering look jagged at this size);
   - the idle lens drifts only over the logo, not the margin round it.

   Usage: ShapeBlur(wrapperEl, { src, pad, ...options }). The wrapper holds a static <img> fallback and
   gets the class "is-live" once the WebGL version is drawing. Without WebGL2 nothing changes. */
(() => {
  const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  // Coverage = the logo's alpha, rasterised by the browser at full resolution.
  const SHAPE = `#version 300 es
precision highp float;
uniform sampler2D uMask;
out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(uMask, 0));
  outColor = vec4(texture(uMask, uv).a, 0.0, 0.0, 1.0);
}`;

  const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform float uLod;
uniform vec2 uStep;
uniform vec2 uScale;
out vec4 outColor;

void main() {
  vec2 size = vec2(textureSize(uSource, int(uLod)));
  vec2 center = gl_FragCoord.xy * uScale;
  float sum = textureLod(uSource, center / size, uLod).r * 6.0;
  sum += textureLod(uSource, (center - uStep) / size, uLod).r * 4.0;
  sum += textureLod(uSource, (center + uStep) / size, uLod).r * 4.0;
  sum += textureLod(uSource, (center - 2.0 * uStep) / size, uLod).r;
  sum += textureLod(uSource, (center + 2.0 * uStep) / size, uLod).r;
  outColor = vec4(sum / 16.0, 0.0, 0.0, 1.0);
}`;

  const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uPyramid;
uniform sampler2D uArt;
uniform float uMaxLod;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uBlur;
uniform vec3 uLens;
uniform vec2 uLensShape;
uniform float uFocus;
uniform float uChroma;
out vec4 outColor;

float bspline(vec2 uv, float lod) {
  vec2 size = vec2(textureSize(uPyramid, int(lod)));
  vec2 st = uv * size - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 p0 = (i - 0.5 + w1 / g0) / size;
  vec2 p1 = (i + 1.5 + w3 / g1) / size;
  float a = textureLod(uPyramid, p0, lod).r;
  float b = textureLod(uPyramid, vec2(p1.x, p0.y), lod).r;
  float c = textureLod(uPyramid, vec2(p0.x, p1.y), lod).r;
  float d = textureLod(uPyramid, p1, lod).r;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

float blurred(vec2 uv, float sigma) {
  if (sigma <= 0.6) return textureLod(uPyramid, uv, 0.0).r;
  float lod = sigma < 1.7 ? (sigma - 0.6) / 1.1 : log2(sigma / 0.866);
  lod = clamp(lod, 0.0, uMaxLod);
  float base = floor(lod);
  float t = lod - base;
  float a = base < 0.5 ? textureLod(uPyramid, uv, 0.0).r : bspline(uv, base);
  if (t < 0.001) return a;
  return mix(a, bspline(uv, min(base + 1.0, uMaxLod)), t);
}

void main() {
  vec2 texel = 1.0 / vec2(textureSize(uPyramid, 0));
  vec2 uv = gl_FragCoord.xy * texel;
  vec2 p = gl_FragCoord.xy / uDpr - 0.5 * uResolution;
  vec2 toLens = p - uLens.xy;
  float lensDistance = length(toLens);
  float lens = uLens.z * (1.0 - smoothstep(uLensShape.x * (1.0 - uLensShape.y), uLensShape.x, lensDistance));
  float amount = mix(lens, 1.0 - lens, uFocus);
  float sigma = uBlur * amount * uDpr;
  vec2 dir = lensDistance > 0.001 ? toLens / lensDistance : vec2(0.0);
  vec2 split = dir * uChroma * 0.3 * sigma * texel;
  vec3 cover = vec3(
    blurred(uv - split, sigma * (1.0 + uChroma * 0.25)),
    blurred(uv, sigma),
    blurred(uv + split, sigma * (1.0 - uChroma * 0.2))
  );
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  cover = clamp(cover + grain / 255.0 * step(0.001, sigma), 0.0, 1.0);
  float alpha = max(max(cover.r, cover.g), cover.b);
  vec3 art = texture(uArt, uv).rgb;   // logo colours, smeared past its edges
  outColor = vec4(art * cover, alpha);
}`;

  const compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  };

  const link = (gl, vertex, source) => {
    const fragment = compile(gl, gl.FRAGMENT_SHADER, source);
    const program = gl.createProgram();
    if (!fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.bindAttribLocation(program, 0, "aPosition");
    gl.linkProgram(program);
    gl.deleteShader(fragment);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
    gl.deleteProgram(program);
    return null;
  };

  const locate = (gl, program, names) => {
    const map = {};
    for (const name of names) map[name] = gl.getUniformLocation(program, name);
    return map;
  };

  // The logo drawn at w × h device pixels, centred with a margin of `m` pixels all round.
  const rasterise = (image, w, h, m) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(image, m, m, w - 2 * m, h - 2 * m);
    return c;
  };

  // Same layout, with each colour smeared outward so blurred edges keep the right hue
  // (only RGB is used; coverage comes from the mask).
  const smear = (mask, unit) => {
    const c = document.createElement("canvas");
    c.width = mask.width;
    c.height = mask.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = "destination-over"; // each ring goes underneath the last
    for (const r of [1, 2, 4, 8, 16, 32, 64, 128]) {
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        ctx.drawImage(mask, r * unit * Math.cos(a), r * unit * Math.sin(a));
      }
    }
    return c;
  };

  window.ShapeBlur = (wrapper, options = {}) => {
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const s = {
      src: options.src || "",
      blur: Math.max(0, options.blur ?? 16),
      lensSize: clamp(options.lensSize ?? 0.3, 0.02, 2),
      lensSoftness: clamp(options.lensSoftness ?? 0.7, 0, 1),
      focus: !!options.focus,
      chroma: clamp(options.chroma ?? 0.3, 0, 1),
      idle: options.idle ?? true,
      pad: Math.max(0, options.pad ?? 0), // margin round the logo, as a fraction of its width
    };

    const canvas = document.createElement("canvas");
    canvas.className = "shape-blur__canvas";
    canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    if (!vertex) return;
    const shapeProgram = link(gl, vertex, SHAPE);
    const blurProgram = link(gl, vertex, BLUR);
    const compositeProgram = link(gl, vertex, COMPOSITE);
    if (!shapeProgram || !blurProgram || !compositeProgram) return;
    wrapper.appendChild(canvas);

    const shapeUniforms = locate(gl, shapeProgram, ["uMask"]);
    const blurUniforms = locate(gl, blurProgram, ["uSource", "uLod", "uStep", "uScale"]);
    const compositeUniforms = locate(gl, compositeProgram, [
      "uPyramid", "uArt", "uMaxLod", "uResolution", "uDpr", "uBlur", "uLens", "uLensShape", "uFocus", "uChroma",
    ]);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const precise = Boolean(gl.getExtension("EXT_color_buffer_float"));
    const format = precise ? gl.R16F : gl.R8;
    const framebuffer = gl.createFramebuffer();

    const linearTexture = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };
    const maskTexture = linearTexture();
    const artTexture = linearTexture();

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pointer = { x: 0, y: 0, active: false };
    const lens = { x: 0, y: 0, power: 0, placed: false };
    const pyramid = { texture: null, temps: [], sizes: [], levels: 0, dirty: true };
    const view = { cx: 0, cy: 0, rx: 1, ry: 1 }; // the logo itself, from the canvas centre (y up)
    const state = { width: 1, height: 1, dpr: 1, time: 0, ready: false };
    const image = new Image();
    let raf = 0;
    let last = 0;
    let visible = false;

    const allocate = () => {
      if (pyramid.texture) gl.deleteTexture(pyramid.texture);
      pyramid.temps.forEach(texture => texture && gl.deleteTexture(texture));
      const width = canvas.width;
      const height = canvas.height;
      pyramid.levels = Math.min(10, Math.floor(Math.log2(Math.max(width, height))) + 1);
      pyramid.sizes = [];
      for (let k = 0; k < pyramid.levels; k++) {
        pyramid.sizes.push([Math.max(1, width >> k), Math.max(1, height >> k)]);
      }
      const configure = () => {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      };
      pyramid.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pyramid.texture);
      gl.texStorage2D(gl.TEXTURE_2D, pyramid.levels, format, width, height);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
      configure();
      pyramid.temps = [null];
      for (let k = 1; k < pyramid.levels; k++) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, format, pyramid.sizes[k][0], pyramid.sizes[k - 1][1]);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        configure();
        pyramid.temps.push(texture);
      }
      pyramid.dirty = true;
    };

    // Draw the logo at the canvas's pixel size, as the coverage mask and the colour art
    const uploadLogo = () => {
      if (!state.ready) return;
      const m = Math.round((canvas.width / (1 + 2 * s.pad)) * s.pad);
      const mask = rasterise(image, canvas.width, canvas.height, m);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
      gl.bindTexture(gl.TEXTURE_2D, artTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, smear(mask, state.dpr));
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      pyramid.dirty = true;
    };

    // Lens path while idle: a slow Lissajous wander over the logo.
    const wander = t => [
      view.cx + view.rx * (0.75 * Math.sin(t * 0.37) + 0.2 * Math.sin(t * 1.13 + 1.7)),
      view.cy + view.ry * (0.7 * Math.sin(t * 0.53 + 0.9) + 0.2 * Math.cos(t * 0.91 + 0.4)),
    ];

    // Coverage mask → blur pyramid (only when the size or logo changes)
    const drawShape = () => {
      if (!pyramid.dirty || !state.ready) return;
      pyramid.dirty = false;

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.texture, 0);
      gl.viewport(0, 0, pyramid.sizes[0][0], pyramid.sizes[0][1]);
      gl.useProgram(shapeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskTexture);
      gl.uniform1i(shapeUniforms.uMask, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(blurProgram);
      gl.uniform1i(blurUniforms.uSource, 0);
      for (let k = 1; k < pyramid.levels; k++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.temps[k], 0);
        gl.viewport(0, 0, pyramid.sizes[k][0], pyramid.sizes[k - 1][1]);
        gl.bindTexture(gl.TEXTURE_2D, pyramid.texture);
        gl.uniform1f(blurUniforms.uLod, k - 1);
        gl.uniform2f(blurUniforms.uStep, 1, 0);
        gl.uniform2f(blurUniforms.uScale, 2, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.texture, k);
        gl.viewport(0, 0, pyramid.sizes[k][0], pyramid.sizes[k][1]);
        gl.bindTexture(gl.TEXTURE_2D, pyramid.temps[k]);
        gl.uniform1f(blurUniforms.uLod, 0);
        gl.uniform2f(blurUniforms.uStep, 0, 1);
        gl.uniform2f(blurUniforms.uScale, 1, 2);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const render = () => {
      if (!pyramid.texture || !state.ready) return;
      gl.bindVertexArray(vao);
      gl.disable(gl.BLEND);
      drawShape();

      const { width, height } = state;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compositeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pyramid.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, artTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(compositeUniforms.uPyramid, 0);
      gl.uniform1i(compositeUniforms.uArt, 1);
      gl.uniform1f(compositeUniforms.uMaxLod, pyramid.levels - 1);
      gl.uniform2f(compositeUniforms.uResolution, width, height);
      gl.uniform1f(compositeUniforms.uDpr, state.dpr);
      gl.uniform1f(compositeUniforms.uBlur, s.blur);
      gl.uniform3f(compositeUniforms.uLens, lens.x, lens.y, lens.power);
      gl.uniform2f(compositeUniforms.uLensShape, s.lensSize * Math.min(width, height), s.lensSoftness);
      gl.uniform1f(compositeUniforms.uFocus, s.focus ? 1 : 0);
      gl.uniform1f(compositeUniforms.uChroma, s.chroma);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = now => {
      raf = 0;
      if (!visible) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      state.time += dt;

      const drifting = !pointer.active && s.idle && !reduce;
      let targetX = lens.x;
      let targetY = lens.y;
      let targetPower = 0;
      if (pointer.active) {
        targetX = pointer.x;
        targetY = pointer.y;
        targetPower = 1;
      } else if (drifting) {
        [targetX, targetY] = wander(state.time);
        targetPower = 0.85;
      }
      if (!lens.placed) {
        lens.x = targetX;
        lens.y = targetY;
        lens.placed = true;
      }
      const follow = 1 - Math.exp(-dt * (pointer.active ? 10 : 3));
      lens.x += (targetX - lens.x) * follow;
      lens.y += (targetY - lens.y) * follow;
      lens.power += (targetPower - lens.power) * (1 - Math.exp(-dt * 4));

      render();

      const settled =
        Math.abs(targetX - lens.x) < 0.1 &&
        Math.abs(targetY - lens.y) < 0.1 &&
        Math.abs(targetPower - lens.power) < 0.002;
      if (!settled || drifting) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (raf || !visible) return;
      raf = requestAnimationFrame(frame);
    };

    const onPointerMove = event => {
      if (!visible) return;
      const rect = canvas.getBoundingClientRect();
      const logo = wrapper.getBoundingClientRect();
      const margin = s.lensSize * Math.min(rect.width, rect.height) * 0.5;
      pointer.active =
        event.clientX > logo.left - margin && event.clientX < logo.right + margin &&
        event.clientY > logo.top - margin && event.clientY < logo.bottom + margin;
      pointer.x = event.clientX - rect.left - rect.width / 2;
      pointer.y = rect.top + rect.height / 2 - event.clientY;
      wake();
    };

    const onPointerLeave = () => {
      pointer.active = false;
      wake();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return; // hidden
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.width = rect.width;
      state.height = rect.height;
      canvas.width = Math.round(state.width * state.dpr);
      canvas.height = Math.round(state.height * state.dpr);

      const logo = wrapper.getBoundingClientRect();
      view.cx = logo.left + logo.width / 2 - (rect.left + rect.width / 2);
      view.cy = rect.top + rect.height / 2 - (logo.top + logo.height / 2);
      view.rx = Math.max(1, logo.width / 2);
      view.ry = Math.max(1, logo.height / 2);

      allocate();
      uploadLogo();
      render();
      wake();
    };

    // The canvas overhangs the wrapper (the logo box) by `pad` × the logo width on every side
    const fitCanvas = (w, h) => {
      canvas.style.left = `${-s.pad * 100}%`;
      canvas.style.marginTop = `${-s.pad * 100}%`; // % margins are relative to the wrapper's width
      canvas.style.width = `${(1 + 2 * s.pad) * 100}%`;
      canvas.style.aspectRatio = `${w * (1 + 2 * s.pad)} / ${h + 2 * s.pad * w}`;
    };

    image.onload = () => {
      fitCanvas(image.naturalWidth, image.naturalHeight);
      state.ready = true;
      resize();
      wrapper.classList.add("is-live");
    };
    image.src = s.src;

    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) { last = 0; wake(); }
    }).observe(wrapper);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("webglcontextlost", () => wrapper.classList.remove("is-live"));
  };
})();
