import { GLTFLoader } from '../core/GLTFLoader.js';
import { ShaderProgram } from '../core/ShaderProgram.js';

const { mat4 } = glMatrix;

export class Monster {
    constructor(gl) {
        this.gl = gl;
        this.loaded = false;
        
        // Transform Settings
        this.position = [0, -3.0, 0]; // Feet on the ground
        this.scale = [1.5, 1.5, 1.5];
        this.rotation = 0;

        // Texture container
        this.texture = null;

        this.init();
    }

    async init() {
        try {
            // Load Shaders
            const vShaderSrc = await fetch('./assets/shaders/monster.vert').then(r => r.text());
            const fShaderSrc = await fetch('./assets/shaders/monster.frag').then(r => r.text());
            this.shader = new ShaderProgram(this.gl, vShaderSrc, fShaderSrc);

            // Load Model (Using the smart loader)
            const loader = new GLTFLoader(this.gl);
            const meshData = await loader.load('./assets/models/monster.glb');
            
            // Load Texture
            await this.loadTexture('./assets/textures/monster_diffuse.png');

            // Setup Buffers
            this.setupBuffers(meshData);
            this.loaded = true;
            console.log("Monster initialized successfully!");

        } catch (error) {
            console.error("Error initializing monster:", error);
        }
    }

    loadTexture(url) {
        return new Promise((resolve) => {
            const gl = this.gl;
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);

            // Placeholder blue pixel while loading
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                          new Uint8Array([0, 0, 255, 255]));

            const image = new Image();
            image.src = url;
            image.onload = () => {
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                gl.generateMipmap(gl.TEXTURE_2D);
                
                // Texture Parameters
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                
                console.log("Texture loaded:", url);
                resolve();
            };
        });
    }

    setupBuffers(data) {
        const gl = this.gl;
        this.vertexCount = data.vertexCount;
        this.indicesLength = data.indices ? data.indices.length : 0;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // --- POSITION ---
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.positions, gl.STATIC_DRAW);
        const aPosition = gl.getAttribLocation(this.shader.program, "a_position");
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);

        // --- UVs ---
        if (data.texCoords) {
            const uvBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, data.texCoords, gl.STATIC_DRAW);
            const aTexCoord = gl.getAttribLocation(this.shader.program, "a_texCoord");
            if (aTexCoord !== -1) {
                gl.enableVertexAttribArray(aTexCoord);
                gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
            }
        }

        // --- INDICES ---
        if (data.indices) {
            const indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
        }

        gl.bindVertexArray(null);
    }

    update(deltaTime) {
        if (!this.loaded) return;
        this.rotation += deltaTime * 0.5;
    }

    draw(gl, viewMatrix, projectionMatrix) {
        if (!this.loaded) return;

        this.shader.use();

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.shader.getUniformLocation("u_texture"), 0);

        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, this.position);
        mat4.rotateY(modelMatrix, modelMatrix, this.rotation);
        mat4.scale(modelMatrix, modelMatrix, this.scale);

        gl.uniformMatrix4fv(this.shader.getUniformLocation("u_modelMatrix"), false, modelMatrix);
        gl.uniformMatrix4fv(this.shader.getUniformLocation("u_viewMatrix"), false, viewMatrix || mat4.create());
        gl.uniformMatrix4fv(this.shader.getUniformLocation("u_projectionMatrix"), false, projectionMatrix || mat4.create());

        gl.bindVertexArray(this.vao);
        if (this.indicesLength > 0) {
            gl.drawElements(gl.TRIANGLES, this.indicesLength, gl.UNSIGNED_SHORT, 0);
        } else {
            gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
        }
        gl.bindVertexArray(null);
    }
}