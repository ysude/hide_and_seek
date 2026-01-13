import * as THREE from "three";

const postVertexShader = `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}`;

const stealthFragmentShader = `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDesat;
uniform float uVignetteStrength;
uniform float uVignettePower;
uniform float uGrainStrength;
uniform float uGamma;
in vec2 vUv;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 color = texture(tDiffuse, vUv).rgb;

  if (uGamma > 0.0) {
    color = pow(color, vec3(1.0 / uGamma));
  }

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(color, vec3(luma), uDesat);

  float dist = length(vUv - 0.5);
  float vignette = smoothstep(0.2, 0.8, dist);
  vignette = pow(vignette, uVignettePower);
  color *= 1.0 - vignette * uVignetteStrength;

  float n = hash(vUv * uResolution + uTime * 60.0) - 0.5;
  color += n * uGrainStrength;

  outColor = vec4(color, 1.0);
}`;

const panicFragmentShader = `
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
}`;

export const StealthShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uDesat: { value: 0.22 },
    uVignetteStrength: { value: 0.3 },
    uVignettePower: { value: 1.6 },
    uGrainStrength: { value: 0.02 },
    uGamma: { value: 2.2 },
  },
  vertexShader: postVertexShader,
  fragmentShader: stealthFragmentShader,
};

export const PanicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uPanic: { value: 1.0 },
    uPulseFreq: { value: 6.0 },
    uChromaticShift: { value: 1.8 },
    uEdgeSmear: { value: 6.0 },
    uVignetteStrength: { value: 0.55 },
    uGrainStrength: { value: 0.08 },
    uJitter: { value: 1.0 },
    uRedTint: { value: new THREE.Vector3(1.25, 0.2, 0.2) },
  },
  vertexShader: postVertexShader,
  fragmentShader: panicFragmentShader,
};
