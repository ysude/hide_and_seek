#version 300 es

// Input Attributes from the Model
in vec3 a_position;
in vec2 a_texCoord; // UV coordinates
in vec3 a_normal;

// Uniform Matrices from JavaScript
uniform mat4 u_modelMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;

// Outputs to Fragment Shader
out vec2 v_texCoord;
out vec3 v_normal;

void main() {
    // Calculate position on screen
    gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
    
    // Pass UVs and Normals to the fragment shader
    v_texCoord = a_texCoord;
    v_normal = mat3(u_modelMatrix) * a_normal;
}