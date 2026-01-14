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
}
