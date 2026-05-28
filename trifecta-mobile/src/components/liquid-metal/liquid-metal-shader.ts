/**
 * Mercury-style liquid metal shader inspired by high-contrast molten chrome buttons.
 * Heavy domain-warped noise, sharp specular blobs, gold/silver ramps, and RGB fringe.
 */
export const LIQUID_METAL_SHADER = `
uniform float u_time;
uniform float2 u_resolution;
uniform float u_press;
uniform float u_turbulence;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + 17.0;
    a *= 0.5;
  }
  return v;
}

float fieldAt(vec2 p, float t) {
  vec2 q = p;
  q += vec2(fbm(q * 1.15 + t * 0.55), fbm(q * 1.15 - t * 0.45 + 4.7)) * 0.42;
  q += vec2(fbm(q * 2.1 + t * 0.35), fbm(q * 2.1 - t * 0.62 + 1.9)) * 0.28;
  float n1 = fbm(q * 1.65 + t * 0.38);
  float n2 = fbm(q * 2.35 - t * 0.52 + 2.4);
  return n1 * 0.58 + n2 * 0.42;
}

half4 main(vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution;
  vec2 p = (uv - 0.5) * 2.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time * (0.42 + u_press * 0.55) * u_turbulence;
  float field = fieldAt(p, t);

  float liquid = smoothstep(0.22, 0.68, field);
  float body = smoothstep(0.38, 0.78, field);
  float highlight = smoothstep(0.58, 0.9, field);
  float spec = smoothstep(0.76, 0.985, field);

  float eps = 0.012 * (1.0 + u_press * 0.65);
  float hR = smoothstep(0.58, 0.9, fieldAt(p + vec2(eps, 0.0), t));
  float hB = smoothstep(0.58, 0.9, fieldAt(p - vec2(eps, 0.0), t));
  float fringe = highlight * (1.0 - highlight);

  vec3 ink = vec3(0.01, 0.01, 0.012);
  vec3 deep = vec3(0.05, 0.05, 0.055);
  vec3 silver = vec3(0.72, 0.76, 0.82);
  vec3 gold = vec3(0.98, 0.78, 0.32);
  vec3 hot = vec3(1.0, 0.99, 0.96);

  float warm = sin(t * 0.9 + p.x * 2.8 + p.y * 1.6) * 0.5 + 0.5;

  vec3 col = mix(ink, deep, liquid);
  col = mix(col, mix(silver, gold, warm), body);
  col = mix(col, mix(gold, hot, warm), highlight);
  col = mix(col, hot, spec);

  col.r += fringe * (hR - highlight) * 0.85 + fringe * 0.12;
  col.g += fringe * 0.04;
  col.b += fringe * (hB - highlight) * 0.95 + fringe * 0.08;

  float iri = fringe * (sin(field * 24.0 + t * 2.4) * 0.5 + 0.5);
  col += vec3(iri * 0.22, iri * 0.1, iri * 0.28);

  float dist = length(p);
  float bowl = smoothstep(0.72, 0.98, dist);
  col *= 1.0 - bowl * 0.55;
  float rim = smoothstep(0.9, 1.0, dist);
  col += rim * vec3(0.18, 0.18, 0.2);

  col += spec * u_press * 0.18;
  col = pow(col, vec3(0.92));

  return half4(clamp(col, 0.0, 1.0), 1.0);
}
`;
