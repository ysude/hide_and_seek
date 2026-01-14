// Cube.js
const mat4 = window.glMatrix.mat4;
const vec3 = window.glMatrix.vec3;

function degToRad(d) { return d * Math.PI / 180; }

export default class Cube {
    constructor(gl, position = [0, 0, 0], color = [1.0, 0.5, 0.2, 1.0], scale = [1, 1, 1]) {
        this.gl = gl;
        this.position = vec3.fromValues(position[0], position[1], position[2]);
        this.rotation = vec3.create(); // [0, 0, 0] -> X, Y, Z açısı
        this.scale = vec3.fromValues(scale[0], scale[1], scale[2]);
        
        this.baseColor = color;
        this.isSelected = false;
        
        this.modelMatrix = mat4.create();
        this.updateModelMatrix();

        if (!Cube.VAO) Cube.initBuffers(gl);
    }

    updateModelMatrix() {
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
        
        mat4.rotateX(this.modelMatrix, this.modelMatrix, degToRad(this.rotation[0]));
        mat4.rotateY(this.modelMatrix, this.modelMatrix, degToRad(this.rotation[1]));
        mat4.rotateZ(this.modelMatrix, this.modelMatrix, degToRad(this.rotation[2]));
        
        mat4.scale(this.modelMatrix, this.modelMatrix, this.scale);
    }

    checkIntersection(rayOrigin, rayDirection) {
        let oc = vec3.create();
        vec3.sub(oc, this.position, rayOrigin);
        let t = vec3.dot(oc, rayDirection);
        if (t < 0) return false;
        let closestPoint = vec3.create();
        vec3.scale(closestPoint, rayDirection, t);
        vec3.add(closestPoint, closestPoint, rayOrigin);
        let distance = vec3.dist(this.position, closestPoint);
        let radius = Math.max(this.scale[0], this.scale[1], this.scale[2]) * 0.7; 
        return distance < radius;
    }

    draw(shaderProgram, viewMatrix, projectionMatrix) {
        this.updateModelMatrix();

        const gl = this.gl;
        shaderProgram.use();

        const pLoc = gl.getUniformLocation(shaderProgram.program, "uProjection");
        const vLoc = gl.getUniformLocation(shaderProgram.program, "uView");
        const mLoc = gl.getUniformLocation(shaderProgram.program, "uModel");
        const cLoc = gl.getUniformLocation(shaderProgram.program, "uColor");

        gl.uniformMatrix4fv(pLoc, false, projectionMatrix);
        gl.uniformMatrix4fv(vLoc, false, viewMatrix);
        gl.uniformMatrix4fv(mLoc, false, this.modelMatrix);
        
        let drawColor = this.isSelected ? [1.0, 1.0, 1.0, 1.0] : this.baseColor;
        if (cLoc) gl.uniform4fv(cLoc, drawColor);

        gl.bindVertexArray(Cube.VAO);
        gl.drawElements(gl.TRIANGLES, Cube.numIndices, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }

    static initBuffers(gl) {
        const vertices = new Float32Array([
            -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
            -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,
            -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,
            -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
             0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,
            -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
        ]);

        const normals = new Float32Array([
             0.0,  0.0,  1.0,   0.0,  0.0,  1.0,   0.0,  0.0,  1.0,   0.0,  0.0,  1.0,
             0.0,  0.0, -1.0,   0.0,  0.0, -1.0,   0.0,  0.0, -1.0,   0.0,  0.0, -1.0,
             0.0,  1.0,  0.0,   0.0,  1.0,  0.0,   0.0,  1.0,  0.0,   0.0,  1.0,  0.0,
             0.0, -1.0,  0.0,   0.0, -1.0,  0.0,   0.0, -1.0,  0.0,   0.0, -1.0,  0.0,
             1.0,  0.0,  0.0,   1.0,  0.0,  0.0,   1.0,  0.0,  0.0,   1.0,  0.0,  0.0,
            -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,      
            4, 5, 6, 4, 6, 7,      
            8, 9, 10, 8, 10, 11,   
            12, 13, 14, 12, 14, 15, 
            16, 17, 18, 16, 18, 19, 
            20, 21, 22, 20, 22, 23  
        ]);

        Cube.VAO = gl.createVertexArray();
        gl.bindVertexArray(Cube.VAO);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        const nbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);
        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        Cube.numIndices = indices.length;
    }
}