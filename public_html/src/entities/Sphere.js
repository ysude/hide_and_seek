// Sphere.js 
const mat4 = window.glMatrix.mat4;
const vec3 = window.glMatrix.vec3;

function degToRad(d) { return d * Math.PI / 180; }

export default class Sphere {
    constructor(gl, position = [0, 0, 0], color = [1.0, 0.0, 0.0, 1.0], scale = [1, 1, 1]) {
        this.gl = gl;
        this.position = vec3.fromValues(position[0], position[1], position[2]);
        this.rotation = vec3.create(); 
        this.scale = vec3.fromValues(scale[0], scale[1], scale[2]);
        
        this.baseColor = color;
        this.isSelected = false;
        
        this.modelMatrix = mat4.create();
        this.updateModelMatrix();

        if (!Sphere.VAO) {
            Sphere.initBuffers(gl);
        }
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
        let radius = Math.max(this.scale[0], this.scale[1]) * 1.0; 
        
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

        gl.bindVertexArray(Sphere.VAO);
        gl.drawElements(gl.TRIANGLES, Sphere.numIndices, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }

    static initBuffers(gl) {
        const latitudeBands = 30; 
        const longitudeBands = 30; 
        const radius = 1.0;

        const vertices = [];
        const normals = [];
        const indices = [];

        for (let latNumber = 0; latNumber <= latitudeBands; latNumber++) {
            let theta = latNumber * Math.PI / latitudeBands;
            let sinTheta = Math.sin(theta);
            let cosTheta = Math.cos(theta);

            for (let longNumber = 0; longNumber <= longitudeBands; longNumber++) {
                let phi = longNumber * 2 * Math.PI / longitudeBands;
                let sinPhi = Math.sin(phi);
                let cosPhi = Math.cos(phi);

                let x = cosPhi * sinTheta;
                let y = cosTheta;
                let z = sinPhi * sinTheta;
                let u = 1 - (longNumber / longitudeBands);
                let v = 1 - (latNumber / latitudeBands);

                normals.push(x);
                normals.push(y);
                normals.push(z);
                
                vertices.push(radius * x);
                vertices.push(radius * y);
                vertices.push(radius * z);
            }
        }

        for (let latNumber = 0; latNumber < latitudeBands; latNumber++) {
            for (let longNumber = 0; longNumber < longitudeBands; longNumber++) {
                let first = (latNumber * (longitudeBands + 1)) + longNumber;
                let second = first + longitudeBands + 1;
                
                indices.push(first);
                indices.push(second);
                indices.push(first + 1);

                indices.push(second);
                indices.push(second + 1);
                indices.push(first + 1);
            }
        }

        Sphere.VAO = gl.createVertexArray();
        gl.bindVertexArray(Sphere.VAO);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        const nbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(1);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        Sphere.numIndices = indices.length;
    }
}