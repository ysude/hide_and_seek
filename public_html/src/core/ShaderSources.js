// ShaderSources.js - SHADER KODLARI BURADA
export const vsSource = `#version 300 es
layout(location = 0) in vec3 aPos; 
layout(location = 1) in vec3 aNormal;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProjection;
out vec3 FragPos; out vec3 Normal;
void main() { 
    FragPos = vec3(uModel * vec4(aPos, 1.0)); 
    Normal = mat3(transpose(inverse(uModel))) * aNormal; 
    gl_Position = uProjection * uView * vec4(FragPos, 1.0); 
}`;

export const fsSourceDefault = `#version 300 es
precision mediump float; out vec4 FragColor; in vec3 FragPos; in vec3 Normal;
uniform vec4 uColor; uniform vec3 uLightPos; uniform vec3 uLightDir; 
uniform float uCutoff; uniform bool uLightOn; uniform bool uPointLightOn;
void main() {
    vec3 norm = normalize(Normal); vec3 result = 0.2 * vec3(1.0);
    if (uLightOn) {
        vec3 lightDir = normalize(uLightPos - FragPos);
        if(dot(lightDir, normalize(-uLightDir)) > uCutoff) result += max(dot(norm, lightDir), 0.0) * vec3(1.0);
    }
    if (uPointLightOn) {
        vec3 pDir = normalize(vec3(25, 20, 0) - FragPos);
        result += max(dot(norm, pDir), 0.0) * 0.8 * vec3(1.0, 1.0, 0.9);
    }
    FragColor = vec4(result * uColor.rgb, uColor.a);
}`;

export const fsSourceToon = `#version 300 es
precision mediump float; out vec4 FragColor; in vec3 FragPos; in vec3 Normal;
uniform vec4 uColor; uniform vec3 uLightPos; uniform vec3 uLightDir; 
uniform float uCutoff; uniform bool uLightOn; uniform bool uPointLightOn;
void main() {
    vec3 norm = normalize(Normal); vec3 result = 0.3 * vec3(1.0);
    vec3 lightCalc = vec3(0.0);
    if (uLightOn) {
        vec3 lightDir = normalize(uLightPos - FragPos);
        if(dot(lightDir, normalize(-uLightDir)) > uCutoff) lightCalc += max(dot(norm, lightDir), 0.0) * vec3(1.0);
    }
    if (uPointLightOn) {
        vec3 pDir = normalize(vec3(25, 20, 0) - FragPos);
        lightCalc += max(dot(norm, pDir), 0.0) * vec3(1.0);
    }
    float intensity = length(lightCalc);
    if (intensity > 0.95) intensity = 1.0;
    else if (intensity > 0.5) intensity = 0.6;
    else if (intensity > 0.2) intensity = 0.3;
    else intensity = 0.1;
    FragColor = vec4((result + intensity) * uColor.rgb, uColor.a);
}`;