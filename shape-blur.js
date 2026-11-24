/* ShapeBlur for the big IC mark: a soft blur "lens" that drifts across the logo
   (or follows the pointer), with a slight colour split at its edge.

   Plain-JS port of React Bits' <ShapeBlur /> (JS-CSS variant, https://reactbits.dev/animations/shape-blur),
   trimmed to the image-shape mode with fill on, and changed in three ways for this page:
   - the logo keeps its own artwork colours (gradient + highlight) instead of one flat colour;
   - the mark is sized to fill its canvas, so it can be cropped by a parent with overflow: hidden;
   - the idle lens drifts only over the part of the logo that's actually visible in that crop.

   Usage: ShapeBlur(wrapperEl, { src, ...options }). The wrapper holds a static <img> fallback;
   it gets the class "is-live" once the WebGL version is drawing, so CSS can swap the two.
   Without WebGL2 nothing changes and the fallback image stays. */
(() => {
  const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

  // Coverage of the shape, from a signed distance field built from the image's alpha.
  const SHAPE = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uDpr;
uniform int uReady;
uniform sampler2D uFieldTexture;
uniform vec2 uField;
out vec4 outColor;

float shapeDistance(vec2 p) {
  if (uReady == 0) return 1e5;
  vec2 uv = p / (2.0 * uField.x) + 0.5;
  vec2 inside = clamp(uv, 0.0, 1.0);
  float d = texture(uFieldTexture, vec2(inside.x, 1.0 - inside.y)).r * uField.y;
  return d + length((uv - inside) * 2.0 * uField.x);
}

void main() {
  vec2 p = gl_FragCoord.xy / uDpr - 0.5 * uResolution;
  float d = shapeDistance(p);
  float aa = 1.0 / uDpr;
  outColor = vec4(clamp(0.5 - d / aa, 0.0, 1.0), 0.0, 0.0, 1.0);
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
  // (React Bits softens coverage above 0.85 here; dropped so the solid logo stays fully opaque on white)
  float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  cover = clamp(cover + grain / 255.0, 0.0, 1.0);
  float alpha = max(max(cover.r, cover.g), cover.b);
  vec3 art = texture(uArt, uv).rgb;   // logo colours, extended past its edges by the gradient
  outColor = vec4(art * cover, alpha);
}`;

  const FIELD = 512;
  const PAD = 0.35;
  const FAR = 1e20;
  const ART_GRADIENT = [[0, "#000000"], [0.335, "#02152B"], [1, "#0B79FE"]];

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

  const sweep = (grid, offset, stride, length, f, v, z) => {
    for (let q = 0; q < length; q++) f[q] = grid[offset + q * stride];
    let k = 0;
    v[0] = 0;
    z[0] = -FAR;
    z[1] = FAR;
    for (let q = 1; q < length; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * (q - v[k]));
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = FAR;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k++;
      const gap = q - v[k];
      grid[offset + q * stride] = gap * gap + f[v[k]];
    }
  };

  const distanceTransform = (grid, size) => {
    const f = new Float64Array(size);
    const v = new Int32Array(size);
    const z = new Float64Array(size + 1);
    for (let x = 0; x < size; x++) sweep(grid, x, size, size, f, v, z);
    for (let y = 0; y < size; y++) sweep(grid, y * size, 1, size, f, v, z);
  };

  const buildField = image => {
    const raster = document.createElement("canvas");
    raster.width = FIELD;
    raster.height = FIELD;
    const ctx = raster.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const width = image.naturalWidth || FIELD;
    const height = image.naturalHeight || FIELD;
    const scale = FIELD / (1 + PAD) / Math.max(width, height);
    ctx.drawImage(image, (FIELD - width * scale) / 2, (FIELD - height * scale) / 2, width * scale, height * scale);
    const pixels = ctx.getImageData(0, 0, FIELD, FIELD).data;
    const outside = new Float64Array(FIELD * FIELD);
    const inside = new Float64Array(FIELD * FIELD);
    for (let i = 0; i < FIELD * FIELD; i++) {
      const alpha = pixels[i * 4 + 3] / 255;
      const edge = 0.5 - alpha;
      outside[i] = alpha >= 0.999 ? 0 : alpha <= 0.001 ? FAR : edge > 0 ? edge * edge : 0;
      inside[i] = alpha >= 0.999 ? FAR : alpha <= 0.001 ? 0 : edge < 0 ? edge * edge : 0;
    }
    distanceTransform(outside, FIELD);
    distanceTransform(inside, FIELD);
    const field = new Float32Array(FIELD * FIELD);
    for (let i = 0; i < FIELD * FIELD; i++) field[i] = Math.sqrt(outside[i]) - Math.sqrt(inside[i]);
    return field;
  };

  // The logo's colours on an opaque canvas: brand gradient everywhere, artwork on top,
  // so blurred edges that spill past the shape still pick up the right colour.
  const buildArt = image => {
    const art = document.createElement("canvas");
    art.width = 1024;
    art.height = Math.round(1024 * (image.naturalHeight / image.naturalWidth));
    const ctx = art.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, art.width, 0);
    ART_GRADIENT.forEach(([stop, color]) => gradient.addColorStop(stop, color));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, art.width, art.height);
    ctx.drawImage(image, 0, 0, art.width, art.height);
    return art;
  };

  window.ShapeBlur = (wrapper, options = {}) => {
    const s = {
      src: options.src || "",
      blur: Math.max(0, options.blur ?? 16),
      lensSize: clamp(options.lensSize ?? 0.3, 0.02, 2),
      lensSoftness: clamp(options.lensSoftness ?? 0.7, 0, 1),
      focus: !!options.focus,
      chroma: clamp(options.chroma ?? 0.3, 0, 1),
      idle: options.idle ?? true,
    };

    const canvas = document.createElement("canvas");
    canvas.className = "ic-mark__canvas";
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

    const shapeUniforms = locate(gl, shapeProgram, ["uResolution", "uDpr", "uReady", "uFieldTexture", "uField"]);
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
    gl.activeTexture(gl.TEXTURE0);
    const fieldTexture = linearTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1e4]));
    gl.activeTexture(gl.TEXTURE1);
    const artTexture = linearTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([11, 121, 254, 255]));
    gl.activeTexture(gl.TEXTURE0);

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const pointer = { x: 0, y: 0, active: false };
    const lens = { x: 0, y: 0, power: 0, placed: false };
    const pyramid = { texture: null, temps: [], sizes: [], levels: 0, key: "" };
    const view = { cx: 0, cy: 0, rx: 1, ry: 1 }; // visible part of the logo, from the canvas centre (y up)
    const state = { width: 1, height: 1, dpr: 1, time: 0, ready: false };
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
      pyramid.key = "";
    };

    // Lens path while idle: a slow Lissajous wander over the visible strip of the logo.
    const wander = t => [
      view.cx + view.rx * (0.75 * Math.sin(t * 0.37) + 0.2 * Math.sin(t * 1.13 + 1.7)),
      view.cy + view.ry * (0.7 * Math.sin(t * 0.53 + 0.9) + 0.2 * Math.cos(t * 0.91 + 0.4)),
    ];

    const drawShape = () => {
      const { width, height } = state;
      const fieldHalf = (width / 2) * (1 + PAD); // the image spans the full canvas width
      const key = [canvas.width, canvas.height, state.ready].join("|");
      if (key === pyramid.key) return;
      pyramid.key = key;

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pyramid.texture, 0);
      gl.viewport(0, 0, pyramid.sizes[0][0], pyramid.sizes[0][1]);
      gl.useProgram(shapeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.uniform1i(shapeUniforms.uFieldTexture, 0);
      gl.uniform2f(shapeUniforms.uResolution, width, height);
      gl.uniform1f(shapeUniforms.uDpr, state.dpr);
      gl.uniform1i(shapeUniforms.uReady, state.ready ? 1 : 0);
      gl.uniform2f(shapeUniforms.uField, fieldHalf, (2 * fieldHalf) / FIELD);
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
      if (!pyramid.texture) return;
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
      const clip = wrapper.getBoundingClientRect();
      const margin = s.lensSize * Math.min(rect.width, rect.height) * 0.5;
      // Only react while the pointer is over (or near) the visible part of the logo
      pointer.active =
        event.clientX > clip.left - margin && event.clientX < clip.right + margin &&
        event.clientY > clip.top - margin && event.clientY < clip.bottom + margin;
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
      if (!rect.width || !rect.height) return; // hidden (e.g. closed menu)
      state.dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.width = rect.width;
      state.height = rect.height;
      canvas.width = Math.round(state.width * state.dpr);
      canvas.height = Math.round(state.height * state.dpr);

      const clip = wrapper.getBoundingClientRect();
      const left = Math.max(clip.left, rect.left), right = Math.min(clip.right, rect.right);
      const top = Math.max(clip.top, rect.top), bottom = Math.min(clip.bottom, rect.bottom);
      view.cx = (left + right) / 2 - (rect.left + rect.width / 2);
      view.cy = rect.top + rect.height / 2 - (top + bottom) / 2;
      view.rx = Math.max(1, (right - left) / 2);
      view.ry = Math.max(1, (bottom - top) / 2);

      allocate();
      render();
      wake();
    };

    const image = new Image();
    image.onload = () => {
      let field = null;
      try { field = buildField(image); } catch (_) { field = null; }
      if (!field) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, FIELD, FIELD, 0, gl.RED, gl.FLOAT, field);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, artTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, buildArt(image));
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.activeTexture(gl.TEXTURE0);
      state.ready = true;
      render();
      wrapper.classList.add("is-live");
      wake();
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
    resize();
  };
})();
