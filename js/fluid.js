/* Paint fluid — WebGL stable-fluids simulation (after Pavel Dobryakov's WebGL-Fluid-Simulation, MIT).
   Full-screen canvas behind the page; mouse / touch drags wet paint in KAPCI colours. */
(function () {
  'use strict';
  const canvas = document.getElementById('fluid');
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 760;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const config = {
    SIM_RESOLUTION: mobile ? 96 : 128,
    DYE_RESOLUTION: mobile ? 512 : 1024,
    DENSITY_DISSIPATION: 0.9,
    VELOCITY_DISSIPATION: 0.25,
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 20,
    CURL: 28,
    SPLAT_RADIUS: mobile ? 0.35 : 0.25,
    SPLAT_FORCE: 6000,
  };

  // KAPCI logo palette (linear-ish rgb 0..1)
  const PALETTE = [
    [0.84, 0.14, 0.18], // red
    [0.95, 0.55, 0.16], // orange
    [0.99, 0.76, 0.09], // yellow
    [0.71, 0.80, 0.18], // lime
    [0.24, 0.61, 0.28], // green
    [0.26, 0.71, 0.85], // cyan
    [0.11, 0.35, 0.59], // navy
    [0.55, 0.25, 0.75], // violet (Latico)
  ];
  let paletteIndex = 0;
  function nextColor(scale) {
    const c = PALETTE[paletteIndex++ % PALETTE.length];
    const s = scale == null ? 0.18 : scale;
    return { r: c[0] * s, g: c[1] * s, b: c[2] * s };
  }

  const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let gl = canvas.getContext('webgl2', params);
  const isWebGL2 = !!gl;
  if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  if (!gl) { document.documentElement.classList.add('no-webgl'); return; }

  let halfFloat, supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
  }
  if (!isWebGL2 && !halfFloat) { document.documentElement.classList.add('no-webgl'); return; }
  gl.clearColor(0, 0, 0, 0);
  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

  function supportRenderTextureFormat(internalFormat, format, type) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }
  function getSupportedFormat(internalFormat, format, type) {
    if (!supportRenderTextureFormat(internalFormat, format, type)) {
      if (!isWebGL2) return null;
      switch (internalFormat) {
        case gl.R16F: return getSupportedFormat(gl.RG16F, gl.RG, type);
        case gl.RG16F: return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat, format };
  }
  const formatRGBA = isWebGL2 ? getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType) : getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
  const formatRG = isWebGL2 ? getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType) : formatRGBA;
  const formatR = isWebGL2 ? getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType) : formatRGBA;
  if (!formatRGBA || !formatRG || !formatR) { document.documentElement.classList.add('no-webgl'); return; }
  if (!supportLinearFiltering) config.DYE_RESOLUTION = 512;

  /* ---------- shaders ---------- */
  function compile(type, source, keywords) {
    if (keywords) source = keywords.map(k => '#define ' + k + '\n').join('') + source;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
    return s;
  }
  function makeProgram(vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPosition');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { u, bind() { gl.useProgram(p); } };
  }

  const baseVertex = compile(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`);

  const clearShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`);

  const displayShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uTexture; uniform vec2 texelSize;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      // fake lighting so the dye reads like glossy wet paint
      vec3 lc = texture2D(uTexture, vL).rgb;
      vec3 rc = texture2D(uTexture, vR).rgb;
      vec3 tc = texture2D(uTexture, vT).rgb;
      vec3 bc = texture2D(uTexture, vB).rgb;
      float dx = length(rc) - length(lc);
      float dy = length(tc) - length(bc);
      vec3 n = normalize(vec3(dx, dy, length(texelSize)));
      float diffuse = clamp(dot(n, vec3(0.0, 0.0, 1.0)) + 0.7, 0.7, 1.0);
      float spec = pow(clamp(dot(n, normalize(vec3(-0.4, 0.5, 1.0))), 0.0, 1.0), 28.0);
      c = min(c * 1.15, vec3(1.0)) * diffuse;
      float a = max(c.r, max(c.g, c.b));
      c += spec * 0.35 * a;
      a = clamp(a + spec * 0.2 * a, 0.0, 1.0);
      gl_FragColor = vec4(c, a);
    }`);

  const splatShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }`);

  const advectionShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity; uniform sampler2D uSource;
    uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5;
      vec2 iuv = floor(st); vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      float decay = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }`, supportLinearFiltering ? null : ['MANUAL_FILTERING']);

  const divergenceShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`);

  const curlShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }`);

  const vorticityShader = compile(gl.FRAGMENT_SHADER, `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
    uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * dt;
      velocity = min(max(velocity, -1000.0), 1000.0);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`);

  const pressureShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      gl_FragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
    }`);

  const gradientSubtractShader = compile(gl.FRAGMENT_SHADER, `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
    uniform sampler2D uPressure; uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }`);

  const clearProgram = makeProgram(baseVertex, clearShader);
  const displayProgram = makeProgram(baseVertex, displayShader);
  const splatProgram = makeProgram(baseVertex, splatShader);
  const advectionProgram = makeProgram(baseVertex, advectionShader);
  const divergenceProgram = makeProgram(baseVertex, divergenceShader);
  const curlProgram = makeProgram(baseVertex, curlShader);
  const vorticityProgram = makeProgram(baseVertex, vorticityShader);
  const pressureProgram = makeProgram(baseVertex, pressureShader);
  const gradientSubtractProgram = makeProgram(baseVertex, gradientSubtractShader);

  /* ---------- geometry ---------- */
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  /* ---------- framebuffers ---------- */
  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      texture, fbo, width: w, height: h, texelSizeX: 1 / w, texelSizeY: 1 / h,
      attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
    };
  }
  function createDoubleFBO(w, h, internalFormat, format, type, param) {
    let a = createFBO(w, h, internalFormat, format, type, param);
    let b = createFBO(w, h, internalFormat, format, type, param);
    return {
      width: w, height: h, texelSizeX: a.texelSizeX, texelSizeY: a.texelSizeY,
      get read() { return a; }, get write() { return b; },
      swap() { const t = a; a = b; b = t; },
    };
  }
  function getResolution(resolution) {
    let ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (ar < 1) ar = 1 / ar;
    const min = Math.round(resolution), max = Math.round(resolution * ar);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  }

  let dye, velocity, divergence, curl, pressure;
  function initFramebuffers() {
    const simRes = getResolution(config.SIM_RESOLUTION);
    const dyeRes = getResolution(config.DYE_RESOLUTION);
    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    gl.disable(gl.BLEND);
    dye = createDoubleFBO(dyeRes.width, dyeRes.height, formatRGBA.internalFormat, formatRGBA.format, halfFloatTexType, filtering);
    velocity = createDoubleFBO(simRes.width, simRes.height, formatRG.internalFormat, formatRG.format, halfFloatTexType, filtering);
    divergence = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, halfFloatTexType, gl.NEAREST);
    curl = createFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, halfFloatTexType, gl.NEAREST);
    pressure = createDoubleFBO(simRes.width, simRes.height, formatR.internalFormat, formatR.format, halfFloatTexType, gl.NEAREST);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; return true; }
    return false;
  }

  /* ---------- simulation ---------- */
  function step(dt) {
    gl.disable(gl.BLEND);

    curlProgram.bind();
    gl.uniform2f(curlProgram.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(curlProgram.u.uVelocity, velocity.read.attach(0));
    blit(curl);

    vorticityProgram.bind();
    gl.uniform2f(vorticityProgram.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(vorticityProgram.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(vorticityProgram.u.uCurl, curl.attach(1));
    gl.uniform1f(vorticityProgram.u.curl, config.CURL);
    gl.uniform1f(vorticityProgram.u.dt, dt);
    blit(velocity.write); velocity.swap();

    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(divergenceProgram.u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    clearProgram.bind();
    gl.uniform1i(clearProgram.u.uTexture, pressure.read.attach(0));
    gl.uniform1f(clearProgram.u.value, config.PRESSURE);
    blit(pressure.write); pressure.swap();

    pressureProgram.bind();
    gl.uniform2f(pressureProgram.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(pressureProgram.u.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pressureProgram.u.uPressure, pressure.read.attach(1));
      blit(pressure.write); pressure.swap();
    }

    gradientSubtractProgram.bind();
    gl.uniform2f(gradientSubtractProgram.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    gl.uniform1i(gradientSubtractProgram.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(gradientSubtractProgram.u.uVelocity, velocity.read.attach(1));
    blit(velocity.write); velocity.swap();

    advectionProgram.bind();
    gl.uniform2f(advectionProgram.u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
    if (!supportLinearFiltering) gl.uniform2f(advectionProgram.u.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
    const velocityId = velocity.read.attach(0);
    gl.uniform1i(advectionProgram.u.uVelocity, velocityId);
    gl.uniform1i(advectionProgram.u.uSource, velocityId);
    gl.uniform1f(advectionProgram.u.dt, dt);
    gl.uniform1f(advectionProgram.u.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write); velocity.swap();

    if (!supportLinearFiltering) gl.uniform2f(advectionProgram.u.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
    gl.uniform1i(advectionProgram.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(advectionProgram.u.uSource, dye.read.attach(1));
    gl.uniform1f(advectionProgram.u.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write); dye.swap();
  }

  function render() {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);
    displayProgram.bind();
    gl.uniform2f(displayProgram.u.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
    gl.uniform1i(displayProgram.u.uTexture, dye.read.attach(0));
    blit(null);
  }

  function correctRadius(radius) {
    const ar = canvas.width / canvas.height;
    return ar > 1 ? radius * ar : radius;
  }
  function splat(x, y, dx, dy, color, radiusScale) {
    splatProgram.bind();
    gl.uniform1i(splatProgram.u.uTarget, velocity.read.attach(0));
    gl.uniform1f(splatProgram.u.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.u.point, x, y);
    gl.uniform3f(splatProgram.u.color, dx, dy, 0);
    gl.uniform1f(splatProgram.u.radius, correctRadius(config.SPLAT_RADIUS * (radiusScale || 1) / 100));
    blit(velocity.write); velocity.swap();

    gl.uniform1i(splatProgram.u.uTarget, dye.read.attach(0));
    gl.uniform3f(splatProgram.u.color, color.r, color.g, color.b);
    blit(dye.write); dye.swap();
  }

  /* ---------- input ---------- */
  const pointer = { x: 0, y: 0, px: 0, py: 0, dx: 0, dy: 0, moved: false, down: false, color: nextColor(), init: false };
  function updatePointer(clientX, clientY) {
    const x = clientX / window.innerWidth, y = 1 - clientY / window.innerHeight;
    if (!pointer.init) { pointer.x = x; pointer.y = y; pointer.init = true; }
    pointer.px = pointer.x; pointer.py = pointer.y;
    pointer.x = x; pointer.y = y;
    const ar = canvas.width / canvas.height;
    let dx = pointer.x - pointer.px, dy = pointer.y - pointer.py;
    if (ar < 1) dx *= ar;
    if (ar > 1) dy /= ar;
    pointer.dx = dx; pointer.dy = dy;
    pointer.moved = Math.abs(dx) > 0 || Math.abs(dy) > 0;
  }
  window.addEventListener('mousemove', e => updatePointer(e.clientX, e.clientY), { passive: true });
  window.addEventListener('touchstart', e => { const t = e.touches[0]; pointer.init = false; updatePointer(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove', e => { const t = e.touches[0]; updatePointer(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('mousedown', e => {
    if (e.target.closest('a,button,input,select,textarea,label')) return;
    burstAt(e.clientX, e.clientY);
  });

  function burstAt(clientX, clientY, rgb) {
    const x = clientX / window.innerWidth, y = 1 - clientY / window.innerHeight;
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const c = rgb ? { r: rgb[0] * 0.9, g: rgb[1] * 0.9, b: rgb[2] * 0.9 } : nextColor(0.9);
      splat(x, y, Math.cos(a) * 900, Math.sin(a) * 900, c, 1.4);
    }
  }

  function randomSplats(count) {
    for (let i = 0; i < count; i++) {
      const c = nextColor(1.2);
      splat(Math.random(), Math.random(), 1200 * (Math.random() - 0.5), 1200 * (Math.random() - 0.5), c, 1.6);
    }
  }

  /* gentle "brush stroke" that paints itself when nobody is touching the screen */
  const ghost = { t: Math.random() * 100, color: nextColor(0.5) };
  function ghostBrush(dt) {
    ghost.t += dt * 0.55;
    const t = ghost.t;
    const x = 0.5 + 0.38 * Math.sin(t * 0.9) * Math.cos(t * 0.31);
    const y = 0.55 + 0.3 * Math.sin(t * 1.3 + 1.7);
    const x2 = 0.5 + 0.38 * Math.sin((t + 0.03) * 0.9) * Math.cos((t + 0.03) * 0.31);
    const y2 = 0.55 + 0.3 * Math.sin((t + 0.03) * 1.3 + 1.7);
    if (Math.floor(t * 0.5) !== ghost.last) { ghost.last = Math.floor(t * 0.5); ghost.color = nextColor(0.45); }
    splat(x2, y2, (x2 - x) * 160000, (y2 - y) * 160000, ghost.color, 0.9);
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  let idle = 0;
  let colorTimer = 0;
  let visible = true;
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; last = performance.now(); });

  function frame() {
    const now = performance.now();
    let dt = Math.min((now - last) / 1000, 0.016666);
    last = now;
    if (resizeCanvas()) initFramebuffers();
    if (visible) {
      colorTimer += dt * 1.6;
      if (colorTimer >= 1) { colorTimer = 0; pointer.color = nextColor(); }
      if (pointer.moved) {
        pointer.moved = false; idle = 0;
        splat(pointer.x, pointer.y, pointer.dx * config.SPLAT_FORCE, pointer.dy * config.SPLAT_FORCE, pointer.color);
      } else {
        idle += dt;
        if (!reduced && idle > 1.2 && window.scrollY < window.innerHeight * 0.9) ghostBrush(dt);
      }
      step(dt);
      render();
    }
    requestAnimationFrame(frame);
  }

  resizeCanvas();
  initFramebuffers();
  randomSplats(reduced ? 4 : 10);
  requestAnimationFrame(frame);

  // public hooks for the page (colour picker splashes, etc.)
  window.PaintFluid = {
    burst: (clientX, clientY, rgb) => burstAt(clientX, clientY, rgb),
    random: n => randomSplats(n || 5),
  };
})();
