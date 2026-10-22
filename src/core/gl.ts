import type { RGB } from './math'

/** SDF shape ids understood by the instance shader. */
export const Shape = {
  Circle: 0,
  Tri: 1, // points toward +x at rot 0
  Box: 2,
  Diamond: 3,
  Hex: 4,
  Star: 5,
  Cross: 6,
  Capsule: 7, // w = half length, h = radius; along +x
  Glow: 8, // soft radial light, always additive
  Pent: 9,
  Oct: 10,
  Arc: 11, // w = radius, h = half thickness, outline param = half aperture (rad); opens toward +x
  Heart: 12,
  Ring: 13, // outline param = thickness (default 18% of radius)
} as const

const FLOATS = 14 // x y w h | rot shape outline glow | r g b a | add glowR
const MAX_INST = 65536

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_ps;
layout(location=2) in vec4 a_ro;
layout(location=3) in vec4 a_col;
layout(location=4) in vec2 a_ex;
uniform vec4 u_view;
uniform float u_px;
out vec2 v_p; out vec2 v_s; flat out int v_sh; out float v_ol; out float v_gl; out vec4 v_c; out float v_add; out float v_gr;
void main(){
  vec2 s = a_ps.zw;
  int sh = int(a_ro.y + 0.5);
  vec2 e = (sh == 2 || sh == 3 || sh == 7) ? s : (sh == 11 ? vec2(s.x + s.y) : vec2(s.x * 1.25));
  float base = (sh == 7 || sh == 11) ? s.y : min(e.x, e.y);
  float gr = a_ex.y > 0.0 ? a_ex.y : clamp(base * 0.6 + 2.0, 3.0, 40.0);
  vec2 ext = e + (a_ro.w > 0.0 ? vec2(gr * 3.5) : vec2(2.0 * u_px));
  vec2 p = a_corner * ext;
  float c = cos(a_ro.x), sn = sin(a_ro.x);
  vec2 wp = a_ps.xy + vec2(p.x * c - p.y * sn, p.x * sn + p.y * c);
  gl_Position = vec4((wp - u_view.xy) * u_view.zw, 0.0, 1.0);
  v_p = p; v_s = s; v_sh = sh; v_ol = a_ro.z; v_gl = a_ro.w; v_c = a_col; v_add = a_ex.x; v_gr = gr;
}`

const QUAD_FS = `#version 300 es
precision highp float;
in vec2 v_p; in vec2 v_s; flat in int v_sh; in float v_ol; in float v_gl; in vec4 v_c; in float v_add; in float v_gr;
uniform float u_px;
out vec4 o;
float dot2(vec2 v){ return dot(v,v); }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTri(vec2 p, float r){
  const float k = sqrt(3.0);
  p.x = abs(p.x) - r; p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float ndot(vec2 a, vec2 b){ return a.x * b.x - a.y * b.y; }
float sdRhombus(vec2 p, vec2 b){
  p = abs(p);
  float h = clamp(ndot(b - 2.0 * p, b) / dot(b, b), -1.0, 1.0);
  float d = length(p - 0.5 * b * vec2(1.0 - h, 1.0 + h));
  return d * sign(p.x * b.y + p.y * b.x - b.x * b.y);
}
float sdHex(vec2 p, float r){
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float sdPent(vec2 p, float r){
  const vec3 k = vec3(0.809016994, 0.587785252, 0.726542528);
  p.y = -p.y; p.x = abs(p.x);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= vec2(clamp(p.x, -r * k.z, r * k.z), r);
  return length(p) * sign(p.y);
}
float sdOct(vec2 p, float r){
  const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623);
  p = abs(p);
  p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y);
  p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}
float sdStar(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.y = -p.y; p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
float sdHeart(vec2 p){
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
void main(){
  vec2 p = v_p; vec2 s = v_s; float d;
  if (v_sh == 8) {
    float t = clamp(1.0 - length(p) / s.x, 0.0, 1.0);
    o = vec4(v_c.rgb * t * t * v_c.a, 0.0);
    return;
  }
  bool selfOutlined = false;
  switch (v_sh) {
    case 0: d = length(p) - s.x; break;
    case 1: d = sdTri(vec2(p.y, p.x), s.x); break;
    case 2: { float rr = min(s.x, s.y) * 0.18; d = sdBox(p, s - rr) - rr; break; }
    case 3: d = sdRhombus(p, s); break;
    case 4: d = sdHex(p, s.x); break;
    case 5: d = sdStar(p, s.x, 0.45); break;
    case 6: d = min(sdBox(p, vec2(s.x, s.x * 0.3)), sdBox(p, vec2(s.x * 0.3, s.x))); break;
    case 7: { float h = max(s.x - s.y, 0.0); vec2 q = p; q.x -= clamp(q.x, -h, h); d = length(q) - s.y; break; }
    case 9: d = sdPent(p, s.x); break;
    case 10: d = sdOct(p, s.x); break;
    case 11: {
      vec2 q = vec2(abs(p.y), p.x);
      vec2 sc = vec2(sin(v_ol), cos(v_ol));
      d = ((sc.y * q.x > sc.x * q.y) ? length(q - sc * s.x) : abs(length(q) - s.x)) - s.y;
      selfOutlined = true; break;
    }
    case 12: { float k = s.x * 1.3; d = sdHeart(vec2(p.x, -p.y) / k + vec2(0.0, 0.55)) * k; break; }
    case 13: { float th = v_ol > 0.0 ? v_ol : s.x * 0.18; d = abs(length(p) - s.x + th * 0.5) - th * 0.5; selfOutlined = true; break; }
    default: d = length(p) - s.x;
  }
  if (!selfOutlined && v_ol > 0.0) d = abs(d + v_ol * 0.5) - v_ol * 0.5;
  float fill = clamp(0.5 - d / u_px, 0.0, 1.0);
  float g = 0.0;
  if (v_gl > 0.0) {
    float dd = max(d, 0.0) / v_gr;
    g = v_gl * exp(-dd * 1.6) * (1.0 - smoothstep(2.4, 3.4, dd)) * 0.75;
  }
  float a = v_c.a;
  o = vec4(v_c.rgb * (fill + g) * a, fill * a * (1.0 - v_add));
}`

const FULL_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
out vec2 v_uv;
void main(){ v_uv = a_corner * 0.5 + 0.5; gl_Position = vec4(a_corner, 0.0, 1.0); }`

const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res; uniform vec4 u_view; uniform float u_time; uniform float u_px;
uniform vec3 u_c0; uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_grid;
uniform float u_style; uniform float u_gridA; uniform vec2 u_focus; uniform float u_pulse;
out vec4 o;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vn(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return v; }
float stars(vec2 wp, float par, float cell, float dens){
  vec2 sp = (u_view.xy * par + (wp - u_view.xy)) / cell;
  vec2 id = floor(sp); vec2 f = fract(sp) - 0.5;
  float h = h21(id);
  if (h < 1.0 - dens) return 0.0;
  vec2 off = vec2(h21(id + 7.1), h21(id + 3.7)) - 0.5;
  float d = length(f - off * 0.7);
  float tw = 0.6 + 0.4 * sin(u_time * (1.0 + h * 3.0) + h * 40.0);
  return smoothstep(0.08, 0.0, d) * tw;
}
float lineAA(float dist, float w){ return 1.0 - smoothstep(w * 0.5, w * 0.5 + u_px * 1.5, dist); }
void main(){
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec2 wp = u_view.xy + ndc / u_view.zw;
  vec2 np = u_view.xy * 0.3 + (wp - u_view.xy);
  float n1 = fbm(np * 0.0011 + vec2(u_time * 0.006, 0.0));
  float n2 = fbm(np * 0.0024 - vec2(0.0, u_time * 0.01) + 5.0);
  vec3 col = u_c0;
  col += u_c1 * smoothstep(0.38, 0.95, n1) * 0.55;
  col += u_c2 * smoothstep(0.52, 1.0, n2) * 0.45;
  col += vec3(0.85, 0.9, 1.0) * (stars(wp, 0.12, 46.0, 0.06) * 0.55 + stars(wp, 0.45, 90.0, 0.08) * 0.9);
  float g = 0.0;
  int st = int(u_style + 0.5);
  if (st == 0) {
    vec2 gp = wp / 80.0; vec2 f = abs(fract(gp - 0.5) - 0.5) * 80.0;
    vec2 F = abs(fract(gp / 4.0 - 0.5) - 0.5) * 320.0;
    g = max(lineAA(min(f.x, f.y), 1.2) * 0.55, lineAA(min(F.x, F.y), 2.2));
  } else if (st == 1) {
    vec2 p = wp / 70.0; vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h; vec2 b = mod(p - h, r) - h;
    vec2 q = dot(a, a) < dot(b, b) ? a : b; q = abs(q);
    float e = 0.5 - max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
    g = lineAA(e * 70.0, 1.6);
  } else if (st == 2) {
    vec2 gp = wp / 56.0; vec2 f = (fract(gp) - 0.5) * 56.0;
    g = smoothstep(2.6, 1.2, length(f));
  } else if (st == 3) {
    float r = length(wp); float a = atan(wp.y, wp.x);
    float ring = abs(fract(r / 120.0 - u_time * 0.05) - 0.5) * 120.0;
    float spoke = abs(fract(a / 6.2831853 * 24.0) - 0.5) / 24.0 * 6.2831853 * r;
    g = max(lineAA(ring, 1.6), lineAA(spoke, 1.0) * 0.5);
  }
  float fade = 0.35 + 0.65 * exp(-length(wp - u_focus) / 700.0);
  col += u_grid * g * u_gridA * fade * (1.0 + u_pulse * 0.6);
  o = vec4(col, 1.0);
}`

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_thresh;
out vec4 o;
vec3 pre(vec3 c){ float br = max(c.r, max(c.g, c.b)); float k = max(br - u_thresh, 0.0) / max(br, 1e-4); return c * k; }
void main(){
  vec3 c = pre(texture(u_src, v_uv + u_texel * vec2(-1, -1)).rgb) + pre(texture(u_src, v_uv + u_texel * vec2(1, -1)).rgb)
         + pre(texture(u_src, v_uv + u_texel * vec2(-1, 1)).rgb) + pre(texture(u_src, v_uv + u_texel * vec2(1, 1)).rgb);
  o = vec4(min(c * 0.25, vec3(24.0)), 1.0);
}`

const DOWN_FS = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel;
out vec4 o;
void main(){
  vec2 h = u_texel;
  vec4 s = texture(u_src, v_uv) * 4.0;
  s += texture(u_src, v_uv - h); s += texture(u_src, v_uv + h);
  s += texture(u_src, v_uv + vec2(h.x, -h.y)); s += texture(u_src, v_uv - vec2(h.x, -h.y));
  o = s / 8.0;
}`

const UP_FS = `#version 300 es
precision highp float;
in vec2 v_uv; uniform sampler2D u_src; uniform vec2 u_texel;
out vec4 o;
void main(){
  vec2 h = u_texel;
  vec4 s = texture(u_src, v_uv + vec2(-h.x * 2.0, 0.0));
  s += texture(u_src, v_uv + vec2(-h.x, h.y)) * 2.0;
  s += texture(u_src, v_uv + vec2(0.0, h.y * 2.0));
  s += texture(u_src, v_uv + vec2(h.x, h.y)) * 2.0;
  s += texture(u_src, v_uv + vec2(h.x * 2.0, 0.0));
  s += texture(u_src, v_uv + vec2(h.x, -h.y)) * 2.0;
  s += texture(u_src, v_uv + vec2(0.0, -h.y * 2.0));
  s += texture(u_src, v_uv + vec2(-h.x, -h.y)) * 2.0;
  o = s / 12.0;
}`

const COMP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene; uniform sampler2D u_bloom;
uniform float u_bloomStr; uniform float u_ca; uniform float u_vig; uniform float u_time; uniform float u_aspect;
uniform vec4 u_flash; uniform vec4 u_tint; uniform vec4 u_rip[4]; uniform float u_sat;
out vec4 o;
float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = v_uv;
  for (int i = 0; i < 4; i++) {
    vec4 r = u_rip[i];
    if (r.w <= 0.0) continue;
    vec2 d = uv - r.xy; d.x *= u_aspect;
    float l = length(d);
    float band = exp(-pow((l - r.z) / 0.035, 2.0));
    vec2 n = l > 1e-4 ? d / l : vec2(0.0);
    n.x /= u_aspect;
    uv -= n * band * r.w * 0.03;
  }
  vec3 col;
  if (u_ca > 0.0) {
    vec2 dir = (uv - 0.5) * u_ca * 0.012;
    col = vec3(texture(u_scene, uv + dir).r, texture(u_scene, uv).g, texture(u_scene, uv - dir).b);
  } else col = texture(u_scene, uv).rgb;
  col += texture(u_bloom, uv).rgb * u_bloomStr;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, u_sat);
  vec2 vc = (v_uv - 0.5) * vec2(u_aspect, 1.0);
  float vig = smoothstep(1.15, 0.25, length(vc));
  col *= mix(1.0, vig, u_vig);
  col = mix(col, u_tint.rgb, u_tint.a * smoothstep(0.25, 1.0, length(vc)));
  col = mix(col, u_flash.rgb, u_flash.a);
  col += (h12(v_uv * 1000.0 + fract(u_time)) - 0.5) * 0.018;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

type Target = { fb: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number }
type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

export interface Ripple {
  x: number
  y: number
  t: number
  life: number
  str: number
  speed: number
}

class Renderer {
  gl!: WebGL2RenderingContext
  canvas!: HTMLCanvasElement
  fx!: HTMLCanvasElement
  ctx!: CanvasRenderingContext2D
  W = 1
  H = 1
  cssW = 1
  cssH = 1
  dpr = 1
  renderScale = 1
  viewH = 720
  scale = 1
  cam = { x: 0, y: 0, zoom: 1, ox: 0, oy: 0 }
  time = 0
  bg = { c0: [0.01, 0.01, 0.03] as RGB, c1: [0.1, 0.05, 0.3] as RGB, c2: [0.0, 0.2, 0.35] as RGB, grid: [0.2, 0.4, 0.9] as RGB, style: 0, gridA: 0.35, focusX: 0, focusY: 0, pulse: 0 }
  post = { bloom: 1.1, thresh: 0.55, ca: 0, vig: 0.55, sat: 1.08, flash: [1, 1, 1, 0] as number[], tint: [1, 0, 0, 0] as number[] }
  ripples: Ripple[] = []
  bounds = { l: 0, r: 0, t: 0, b: 0 }

  private data = new Float32Array(MAX_INST * FLOATS)
  private n = 0
  private vao!: WebGLVertexArrayObject
  private fsVao!: WebGLVertexArrayObject
  private inst!: WebGLBuffer
  private quad!: Prog
  private bgP!: Prog
  private bright!: Prog
  private down!: Prog
  private up!: Prog
  private comp!: Prog
  private scene!: Target
  private chain: Target[] = []
  private fmt = { internal: 0, type: 0 }

  init(canvas: HTMLCanvasElement, fx: HTMLCanvasElement) {
    this.canvas = canvas
    this.fx = fx
    this.ctx = fx.getContext('2d')!
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' })!
    this.gl = gl
    const hdr = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')
    this.fmt = hdr ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE }
    if (!hdr) this.post.thresh = 0.4

    this.quad = this.program(QUAD_VS, QUAD_FS, ['u_view', 'u_px'])
    this.bgP = this.program(FULL_VS, BG_FS, ['u_res', 'u_view', 'u_time', 'u_px', 'u_c0', 'u_c1', 'u_c2', 'u_grid', 'u_style', 'u_gridA', 'u_focus', 'u_pulse'])
    this.bright = this.program(FULL_VS, BRIGHT_FS, ['u_src', 'u_texel', 'u_thresh'])
    this.down = this.program(FULL_VS, DOWN_FS, ['u_src', 'u_texel'])
    this.up = this.program(FULL_VS, UP_FS, ['u_src', 'u_texel'])
    this.comp = this.program(FULL_VS, COMP_FS, ['u_scene', 'u_bloom', 'u_bloomStr', 'u_ca', 'u_vig', 'u_time', 'u_aspect', 'u_flash', 'u_tint', 'u_rip', 'u_sat'])

    const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    const cbuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, cbuf)
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW)

    this.fsVao = gl.createVertexArray()!
    gl.bindVertexArray(this.fsVao)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.inst = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW)
    const stride = FLOATS * 4
    const attr = (loc: number, size: number, off: number) => {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4)
      gl.vertexAttribDivisor(loc, 1)
    }
    attr(1, 4, 0)
    attr(2, 4, 4)
    attr(3, 4, 8)
    attr(4, 2, 12)
    gl.bindVertexArray(null)
    this.resize()
  }

  private program(vs: string, fs: string, uniforms: string[]): Prog {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error')
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error')
    const u: Prog['u'] = {}
    for (const name of uniforms) u[name] = gl.getUniformLocation(p, name)
    return { p, u }
  }

  private target(w: number, h: number): Target {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, this.fmt.internal, w, h, 0, gl.RGBA, this.fmt.type, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    return { fb, tex, w, h }
  }

  private free(t: Target) {
    this.gl.deleteFramebuffer(t.fb)
    this.gl.deleteTexture(t.tex)
  }

  resize() {
    const cssW = window.innerWidth, cssH = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 2) * this.renderScale
    const maxPx = 2560 * 1440
    if (cssW * cssH * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (cssW * cssH))
    const W = Math.max(1, Math.round(cssW * dpr)), H = Math.max(1, Math.round(cssH * dpr))
    if (W === this.W && H === this.H && this.scene) return
    this.cssW = cssW
    this.cssH = cssH
    this.dpr = dpr
    this.W = this.canvas.width = W
    this.H = this.canvas.height = H
    const fdpr = Math.min(window.devicePixelRatio || 1, 2)
    this.fx.width = Math.round(cssW * fdpr)
    this.fx.height = Math.round(cssH * fdpr)
    if (this.scene) this.free(this.scene)
    this.chain.forEach((t) => this.free(t))
    this.scene = this.target(W, H)
    this.chain = []
    let w = W >> 1, h = H >> 1
    for (let i = 0; i < 6 && w > 4 && h > 4; i++) {
      this.chain.push(this.target(w, h))
      w >>= 1
      h >>= 1
    }
  }

  /** world units visible horizontally / vertically */
  get viewW() {
    return this.W / this.scale
  }

  begin(dt: number) {
    this.time += dt
    this.resize()
    this.scale = (this.H / this.viewH) * this.cam.zoom
    const gl = this.gl
    const cx = this.cam.x + this.cam.ox, cy = this.cam.y + this.cam.oy
    const hw = this.W / this.scale / 2, hh = this.H / this.scale / 2
    this.bounds = { l: cx - hw, r: cx + hw, t: cy - hh, b: cy + hh }
    for (const r of this.ripples) r.t += dt
    this.ripples = this.ripples.filter((r) => r.t < r.life)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb)
    gl.viewport(0, 0, this.W, this.H)
    gl.disable(gl.BLEND)
    const b = this.bg, u = this.bgP.u
    gl.useProgram(this.bgP.p)
    gl.uniform2f(u.u_res, this.W, this.H)
    gl.uniform4f(u.u_view, cx, cy, (2 * this.scale) / this.W, (-2 * this.scale) / this.H)
    gl.uniform1f(u.u_time, this.time)
    gl.uniform1f(u.u_px, 1 / this.scale)
    gl.uniform3fv(u.u_c0, b.c0)
    gl.uniform3fv(u.u_c1, b.c1)
    gl.uniform3fv(u.u_c2, b.c2)
    gl.uniform3fv(u.u_grid, b.grid)
    gl.uniform1f(u.u_style, b.style)
    gl.uniform1f(u.u_gridA, b.gridA)
    gl.uniform2f(u.u_focus, b.focusX, b.focusY)
    gl.uniform1f(u.u_pulse, b.pulse)
    gl.bindVertexArray(this.fsVao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    this.n = 0
  }

  /** Queue one SDF instance. add=1 → additive light, add=0 → alpha-blended solid. */
  draw(shape: number, x: number, y: number, w: number, h: number, rot: number, c: RGB, a = 1, glow = 0, outline = 0, add = 1, glowR = 0) {
    const m = Math.max(w, h) * 1.3 + (glow > 0 ? 60 : 4)
    const B = this.bounds
    if (x + m < B.l || x - m > B.r || y + m < B.t || y - m > B.b) return
    if (this.n >= MAX_INST) this.flush()
    const d = this.data, o = this.n++ * FLOATS
    d[o] = x
    d[o + 1] = y
    d[o + 2] = w
    d[o + 3] = h
    d[o + 4] = rot
    d[o + 5] = shape
    d[o + 6] = outline
    d[o + 7] = glow
    d[o + 8] = c[0]
    d[o + 9] = c[1]
    d[o + 10] = c[2]
    d[o + 11] = a
    d[o + 12] = add
    d[o + 13] = glowR
  }

  /** Glowing line segment (capsule). */
  line(x1: number, y1: number, x2: number, y2: number, thick: number, c: RGB, a = 1, glow = 1, add = 1) {
    const dx = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    this.draw(Shape.Capsule, (x1 + x2) / 2, (y1 + y2) / 2, len / 2 + thick / 2, thick / 2, Math.atan2(dy, dx), c, a, glow, 0, add)
  }

  flush() {
    if (!this.n) return
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fb)
    gl.viewport(0, 0, this.W, this.H)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.quad.p)
    const cx = this.cam.x + this.cam.ox, cy = this.cam.y + this.cam.oy
    gl.uniform4f(this.quad.u.u_view, cx, cy, (2 * this.scale) / this.W, (-2 * this.scale) / this.H)
    gl.uniform1f(this.quad.u.u_px, 1 / this.scale)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * FLOATS)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n)
    this.n = 0
  }

  private pass(prog: Prog, src: Target, dst: Target | null, texelScale = 1) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null)
    gl.viewport(0, 0, dst ? dst.w : this.W, dst ? dst.h : this.H)
    gl.useProgram(prog.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, src.tex)
    gl.uniform1i(prog.u.u_src, 0)
    gl.uniform2f(prog.u.u_texel, (0.5 * texelScale) / src.w, (0.5 * texelScale) / src.h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  end() {
    this.flush()
    const gl = this.gl
    gl.bindVertexArray(this.fsVao)
    gl.disable(gl.BLEND)
    const ch = this.chain
    gl.useProgram(this.bright.p)
    gl.uniform1f(this.bright.u.u_thresh, this.post.thresh)
    this.pass(this.bright, this.scene, ch[0], 2)
    for (let i = 1; i < ch.length; i++) this.pass(this.down, ch[i - 1], ch[i], 2)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE)
    for (let i = ch.length - 1; i > 0; i--) this.pass(this.up, ch[i], ch[i - 1], 1)
    gl.disable(gl.BLEND)

    const u = this.comp.u
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.W, this.H)
    gl.useProgram(this.comp.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex)
    gl.uniform1i(u.u_scene, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, ch[0].tex)
    gl.uniform1i(u.u_bloom, 1)
    const p = this.post
    gl.uniform1f(u.u_bloomStr, p.bloom * 0.55)
    gl.uniform1f(u.u_ca, p.ca)
    gl.uniform1f(u.u_vig, p.vig)
    gl.uniform1f(u.u_time, this.time)
    gl.uniform1f(u.u_aspect, this.W / this.H)
    gl.uniform1f(u.u_sat, p.sat)
    gl.uniform4fv(u.u_flash, p.flash)
    gl.uniform4fv(u.u_tint, p.tint)
    const rip = new Float32Array(16)
    this.ripples.slice(0, 4).forEach((r, i) => {
      const [sx, sy] = this.toScreen(r.x, r.y)
      const k = r.t / r.life
      rip.set([sx / this.cssW, 1 - sy / this.cssH, r.t * r.speed, r.str * (1 - k) * (1 - k)], i * 4)
    })
    gl.uniform4fv(u.u_rip, rip)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
  }

  /** world → CSS pixel position (for the 2D overlay / DOM) */
  toScreen(x: number, y: number): [number, number] {
    const k = this.scale / this.dpr
    return [(x - this.cam.x - this.cam.ox) * k + this.cssW / 2, (y - this.cam.y - this.cam.oy) * k + this.cssH / 2]
  }

  /** CSS pixel → world position */
  toWorld(px: number, py: number): [number, number] {
    const k = this.scale / this.dpr
    return [(px - this.cssW / 2) / k + this.cam.x + this.cam.ox, (py - this.cssH / 2) / k + this.cam.y + this.cam.oy]
  }

  /** world units → CSS px */
  get k() {
    return this.scale / this.dpr
  }

  ripple(x: number, y: number, str = 1, life = 0.7, speed = 1.1) {
    this.ripples.push({ x, y, t: 0, life, str, speed })
  }

  /** prepare the 2D overlay for this frame */
  overlay() {
    const c = this.ctx, f = this.fx.width / this.cssW
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, this.fx.width, this.fx.height)
    c.setTransform(f, 0, 0, f, 0, 0)
    return c
  }
}

export const renderer = new Renderer()
