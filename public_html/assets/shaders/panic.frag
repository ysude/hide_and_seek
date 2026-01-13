precision highp float;

uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uPanic;
uniform float uPulseFreq;
uniform float uChromaticShift;
uniform float uEdgeSmear;
uniform float uVignetteStrength;
uniform float uGrainStrength;
uniform float uJitter;
uniform vec3 uRedTint;

in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 pixel = 1.0 / uResolution;

  float h = hash(vUv * uResolution + uTime * 120.0);
  float h2 = hash(vUv * uResolution + (uTime + 1.0) * 120.0);
  vec2 jitter = (vec2(h, h2) - 0.5) * uJitter * pixel * uPanic;
  vec2 uv = vUv + jitter;

  float pulse = 0.5 + 0.5 * sin(uTime * uPulseFreq);
  vec2 dir = normalize(uv - 0.5 + 0.0001);

  float chroma = uChromaticShift * (0.6 + 0.6 * pulse) * uPanic;
  vec2 chromaOffset = dir * chroma * pixel;

  vec3 color;
  color.r = texture(tDiffuse, uv + chromaOffset).r;
  color.g = texture(tDiffuse, uv).g;
  color.b = texture(tDiffuse, uv - chromaOffset).b;

  float smear = uEdgeSmear * uPanic;
  vec3 smearColor = texture(tDiffuse, uv + dir * smear * pixel).rgb;
  color = mix(color, smearColor, 0.35 * uPanic);

  vec3 tint = mix(vec3(1.0), uRedTint, uPanic);
  color *= tint;

  float dist = length(uv - 0.5);
  float vignette = smoothstep(0.2, 0.85, dist);
  color *= 1.0 - vignette * uVignetteStrength;

  float n = (hash(uv * uResolution + uTime * 90.0) - 0.5) * uGrainStrength;
  color += n;

  outColor = vec4(color, 1.0);
}
