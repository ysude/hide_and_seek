import * as THREE from "three";

async function loadText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load shader: ${url}`);
  }
  return res.text();
}

export async function loadPostShaders() {
  const [postAVert, stealthFrag, postBVert, panicFrag] = await Promise.all([
    loadText("./assets/shaders/postA.vert"),
    loadText("./assets/shaders/stealth.frag"),
    loadText("./assets/shaders/postB.vert"),
    loadText("./assets/shaders/panic.frag"),
  ]);

  return {
    stealth: {
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
      vertexShader: postAVert,
      fragmentShader: stealthFrag,
    },
    panic: {
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
      vertexShader: postBVert,
      fragmentShader: panicFrag,
    },
  };
}
