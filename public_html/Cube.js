// Cube.js - HAREKET VE DÖNME YETENEKLİ
const mat4 = window.glMatrix.mat4;
const vec3 = window.glMatrix.vec3;

// Dereceyi Radyana çeviren yardımcı (glMatrix sıkıntısı olmasın diye elle yazdık)
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
        
        // 1. Önce Taşı
        mat4.translate(this.modelMatrix, this.modelMatrix, this.position);
        
        // 2. Sonra Döndür (X, Y, Z eksenlerinde)
        mat4.rotateX(this.modelMatrix, this.modelMatrix, degToRad(this.rotation[0]));
        mat4.rotateY(this.modelMatrix, this.modelMatrix, degToRad(this.rotation[1]));
        mat4.rotateZ(this.modelMatrix, this.modelMatrix, degToRad(this.rotation[2]));
        
        // 3. En son Ölçekle
        mat4.scale(this.modelMatrix, this.modelMatrix, this.scale);
    }

    // --- Basit Çarpışma Testi (Aynı kalıyor) ---
    checkIntersection(rayOrigin, rayDirection) {
        let oc = vec3.create();
        vec3.sub(oc, this.position, rayOrigin);
        let t = vec3.dot(oc, rayDirection);
        if (t < 0) return false;
        let closestPoint = vec3.create();
        vec3.scale(closestPoint, rayDirection, t);
        vec3.add(closestPoint, closestPoint, rayOrigin);
        let distance = vec3.dist(this.position, closestPoint);
        let radius = Math.max(this.scale[0], this.scale[1], this.scale[2]) * 0.7; // Biraz büyüttük toleransı
        return distance < radius;
    }

    draw(shaderProgram, viewMatrix, projectionMatrix) {
        // Her çizimden önce matrisi güncelle (Hareket etmiş olabilir)
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

    // Cube.js içindeki initBuffers fonksiyonunu bununla değiştir:
    static initBuffers(gl) {
        // Pozisyonlar (X, Y, Z)
        const vertices = new Float32Array([
            // Ön Yüz
            -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
            // Arka Yüz
            -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5, -0.5,
            // Üst Yüz
            -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,
            // Alt Yüz
            -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
            // Sağ Yüz
             0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,
            // Sol Yüz
            -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
        ]);

        // Normaller (Işığın yüzeye çarpma açısını hesaplamak için)
        const normals = new Float32Array([
            // Ön (Z+)
             0.0,  0.0,  1.0,   0.0,  0.0,  1.0,   0.0,  0.0,  1.0,   0.0,  0.0,  1.0,
            // Arka (Z-)
             0.0,  0.0, -1.0,   0.0,  0.0, -1.0,   0.0,  0.0, -1.0,   0.0,  0.0, -1.0,
            // Üst (Y+)
             0.0,  1.0,  0.0,   0.0,  1.0,  0.0,   0.0,  1.0,  0.0,   0.0,  1.0,  0.0,
            // Alt (Y-)
             0.0, -1.0,  0.0,   0.0, -1.0,  0.0,   0.0, -1.0,  0.0,   0.0, -1.0,  0.0,
            // Sağ (X+)
             1.0,  0.0,  0.0,   1.0,  0.0,  0.0,   1.0,  0.0,  0.0,   1.0,  0.0,  0.0,
            // Sol (X-)
            -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0,  -1.0,  0.0,  0.0
        ]);

        const indices = new Uint16Array([
            0, 1, 2, 0, 2, 3,       // Ön
            4, 5, 6, 4, 6, 7,       // Arka
            8, 9, 10, 8, 10, 11,    // Üst
            12, 13, 14, 12, 14, 15, // Alt
            16, 17, 18, 16, 18, 19, // Sağ
            20, 21, 22, 20, 22, 23  // Sol
        ]);

        Cube.VAO = gl.createVertexArray();
        gl.bindVertexArray(Cube.VAO);

        // 1. Pozisyon Bufferı (Location = 0)
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        // 2. Normal Bufferı (Location = 1) - YENİ
        const nbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, nbo);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0); // Shader'da layout(location=1) olacak
        gl.enableVertexAttribArray(1);

        // İndex Bufferı
        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);
        Cube.numIndices = indices.length;
    }
}