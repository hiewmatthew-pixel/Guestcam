// Film-look filter definitions. Each filter is implemented as a fragment
// shader that takes the sampled camera frame and applies a color-grading
// approximation. The shaders below are deliberately simple — they're
// stylistic, not colorimetrically accurate.

export type FilterId =
  | 'portra-400'
  | 'cinestill-800t'
  | 'kodak-gold-200'
  | 'ilford-hp5'
  | 'fuji-pro-400h';

export type FilterDef = {
  id: FilterId;
  label: string;
  blurb: string;
  fragmentShader: string;
};

const VS = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Helper GLSL prepended to every fragment shader.
const COMMON = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_image;
uniform float u_time;
uniform vec2 u_resolution;

// pseudo-random for grain
float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 saturation(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(l), c, s);
}

vec3 contrast(vec3 c, float k) {
  return (c - 0.5) * k + 0.5;
}

vec3 liftGammaGain(vec3 c, vec3 lift, vec3 gamma, vec3 gain) {
  c = c + lift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / max(gamma, vec3(0.001)));
  c = c * gain;
  return c;
}
`;

const PORTRA_400 = `
${COMMON}
void main() {
  vec4 tex = texture2D(u_image, v_texCoord);
  vec3 c = tex.rgb;

  // warm shadows, soft pastel highlights, slight magenta lift
  c = liftGammaGain(c,
    vec3(0.03, 0.015, 0.025),   // lift: warm + tiny magenta in blacks
    vec3(1.00, 1.04, 1.06),     // gamma: lift highlights cooler/softer
    vec3(1.06, 1.03, 0.98));    // gain: warm overall
  c = saturation(c, 0.92);
  c = contrast(c, 0.92);

  // tiny grain
  float g = (rand(v_texCoord * u_resolution + u_time) - 0.5) * 0.04;
  c += g;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const CINESTILL_800T = `
${COMMON}
void main() {
  vec4 tex = texture2D(u_image, v_texCoord);
  vec3 c = tex.rgb;

  // tungsten cool cast on midtones
  c = liftGammaGain(c,
    vec3(-0.01, 0.0, 0.04),
    vec3(1.02, 1.00, 0.96),
    vec3(0.96, 0.99, 1.08));
  c = contrast(c, 1.05);
  c = saturation(c, 1.05);

  // halation: bloom red around bright areas
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float bloom = smoothstep(0.72, 1.0, lum);
  vec3 halation = vec3(1.0, 0.25, 0.18) * bloom * 0.45;
  c += halation;

  // grain
  float g = (rand(v_texCoord * u_resolution + u_time) - 0.5) * 0.07;
  c += g;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const KODAK_GOLD_200 = `
${COMMON}
void main() {
  vec4 tex = texture2D(u_image, v_texCoord);
  vec3 c = tex.rgb;

  // golden midtones, warm yellows, slight green in shadows
  c = liftGammaGain(c,
    vec3(0.0, 0.02, -0.015),
    vec3(0.98, 1.00, 1.06),
    vec3(1.08, 1.04, 0.92));
  c = saturation(c, 1.12);
  c = contrast(c, 1.02);

  float g = (rand(v_texCoord * u_resolution + u_time) - 0.5) * 0.045;
  c += g;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

const ILFORD_HP5 = `
${COMMON}
void main() {
  vec4 tex = texture2D(u_image, v_texCoord);
  vec3 c = tex.rgb;

  // luminance with subtle red weighting (panchromatic feel)
  float l = dot(c, vec3(0.30, 0.59, 0.11));
  l = (l - 0.5) * 1.18 + 0.5;  // contrast
  l = l * 0.96 + 0.04;          // slightly lifted blacks

  float g = (rand(v_texCoord * u_resolution + u_time) - 0.5) * 0.10;
  l += g;

  gl_FragColor = vec4(vec3(clamp(l, 0.0, 1.0)), 1.0);
}
`;

const FUJI_PRO_400H = `
${COMMON}
void main() {
  vec4 tex = texture2D(u_image, v_texCoord);
  vec3 c = tex.rgb;

  // cool greens, pastel skin tones, airy highlights
  c = liftGammaGain(c,
    vec3(0.0, 0.02, 0.02),
    vec3(1.05, 1.06, 1.04),
    vec3(0.99, 1.04, 1.02));
  c = saturation(c, 0.88);
  c = contrast(c, 0.94);

  // airy highlight roll-off
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float lift = smoothstep(0.7, 1.0, lum) * 0.06;
  c += vec3(lift);

  float g = (rand(v_texCoord * u_resolution + u_time) - 0.5) * 0.035;
  c += g;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export const FILTERS: FilterDef[] = [
  { id: 'portra-400',     label: 'Portra 400',     blurb: 'warm · soft · timeless',         fragmentShader: PORTRA_400 },
  { id: 'cinestill-800t', label: 'Cinestill 800T', blurb: 'tungsten · halated · cinematic', fragmentShader: CINESTILL_800T },
  { id: 'kodak-gold-200', label: 'Kodak Gold 200', blurb: 'golden · sunlit · nostalgic',    fragmentShader: KODAK_GOLD_200 },
  { id: 'ilford-hp5',     label: 'Ilford HP5',     blurb: 'black & white · grainy',         fragmentShader: ILFORD_HP5 },
  { id: 'fuji-pro-400h',  label: 'Fuji Pro 400H',  blurb: 'cool · pastel · airy',           fragmentShader: FUJI_PRO_400H },
];

export const VERTEX_SHADER = VS;

export function getFilter(id: FilterId): FilterDef {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}
