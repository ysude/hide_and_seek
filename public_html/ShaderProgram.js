// ShaderProgram.js
export default class ShaderProgram {
    constructor(gl, vsSource, fsSource) {
        this.gl = gl;
        const vertexShader = this.loadShader(gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(gl.FRAGMENT_SHADER, fsSource);

        // Shader programını oluştur
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);

        // Hata kontrolü
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            alert('Shader Programı bağlanamadı: ' + gl.getProgramInfoLog(this.program));
            this.program = null;
        }
    }

    use() {
        this.gl.useProgram(this.program);
    }

    // Shader kodunu derleyen yardımcı fonksiyon
    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert('Shader derlenirken hata oluştu: ' + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
}