// SceneManager.js - İSİMLER, KARTLAR VE KAPI BURADA

export default class SceneManager {
    constructor(gl) {
        this.gl = gl;
        this.alphabet = {
            'S': [[1,1,1],[1,0,0],[1,1,1],[0,0,1],[1,1,1]],
            'U': [[1,0,1],[1,0,1],[1,0,1],[1,0,1],[1,1,1]],
            'D': [[1,1,0],[1,0,1],[1,0,1],[1,0,1],[1,1,0]],
            'E': [[1,1,1],[1,0,0],[1,1,1],[1,0,0],[1,1,1]],
            'K': [[1,0,1],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
            'R': [[1,1,0],[1,0,1],[1,1,0],[1,0,1],[1,0,1]],
            'M': [[1,0,1],[1,1,1],[1,0,1],[1,0,1],[1,0,1]],
            'A': [[1,1,1],[1,0,1],[1,1,1],[1,0,1],[1,0,1]],
            'L': [[1,0,0],[1,0,0],[1,0,0],[1,0,0],[1,1,1]]
        };
    }

    // Harfleri Oluşturur
    createNameLetters(objects) {
        const draw = (letter, sx, sy, sz, col) => {
            const p = this.alphabet[letter];
            if (!p) return;
            for (let r = 0; r < 5; r++) {
                for (let c = 0; c < 3; c++) {
                    if (p[r][c]) {
                        objects.push(new Cube(this.gl, [sx + c, sy + (4 - r), sz], col, [0.8, 0.8, 0.8]));
                    }
                }
            }
        };

        const Z = -50, X = 40;
        // SUDE
        draw('S', X + 2, 8, Z, [1, .4, .7, 1]);
        draw('U', X + 6, 8, Z, [1, .4, .7, 1]);
        draw('D', X + 10, 8, Z, [1, .4, .7, 1]);
        draw('E', X + 14, 8, Z, [1, .4, .7, 1]);

        // KEREM
        draw('K', X, 1, Z, [.2, .8, 1, 1]);
        draw('E', X + 4, 1, Z, [.2, .8, 1, 1]);
        draw('R', X + 8, 1, Z, [.2, .8, 1, 1]);
        draw('E', X + 12, 1, Z, [.2, .8, 1, 1]);
        draw('M', X + 16, 1, Z, [.2, .8, 1, 1]);

        // KEMAL
        draw('K', X, -6, Z, [.5, 1, .2, 1]);
        draw('E', X + 4, -6, Z, [.5, 1, .2, 1]);
        draw('M', X + 8, -6, Z, [.5, 1, .2, 1]);
        draw('A', X + 12, -6, Z, [.5, 1, .2, 1]);
        draw('L', X + 16, -6, Z, [.5, 1, .2, 1]);

        // İsimlerin Altındaki Platform
        objects.push(new Cube(this.gl, [50, -7, Z], [0.2, 0.2, 0.2, 1.0], [30, 0.5, 10]));
    }

    // Kartları ve Kapıyı Oluşturur
    // SceneManager.js (three-friendly): sadece veri döndür
	createQuestData() {
		return [
		{ type: "card", pos: [-5, -0.5, -5], size: [0.3, 0.05, 0.5] },
		{ type: "card", pos: [ 5, -0.5, -8], size: [0.3, 0.05, 0.5] },
		{ type: "card", pos: [10, -0.5,  5], size: [0.3, 0.05, 0.5] },
		{ type: "door", pos: [ 0,  1.5,-15], size: [2.0, 2.5, 0.2] }
		];
	}

}