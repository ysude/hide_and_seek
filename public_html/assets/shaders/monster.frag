#version 300 es
precision mediump float;

// Inputs from Vertex Shader
in vec2 v_texCoord;
in vec3 v_normal;

// Texture Sampler (The image)
uniform sampler2D u_texture;

// Final Output Color
out vec4 outColor;

void main() {
    // Sample the color from the texture using UV coordinates
    vec4 texColor = texture(u_texture, v_texCoord);
    
    // Simple Alpha Test: Discard transparent pixels (optional optimization)
    if(texColor.a < 0.1) discard;

    outColor = texColor;
}