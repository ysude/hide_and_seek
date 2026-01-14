// SceneManager.js 

export default class SceneManager {
    constructor(gl) {
        this.gl = gl;
        this.alphabet = {
        };
    }
	createQuestData() {
		return [
		{ type: "card", pos: [-5, -0.5, -5], size: [0.3, 0.05, 0.5] },
		{ type: "card", pos: [ 5, -0.5, -8], size: [0.3, 0.05, 0.5] },
		{ type: "card", pos: [10, -0.5,  5], size: [0.3, 0.05, 0.5] },
		{ type: "door", pos: [ 0,  1.5,-15], size: [2.0, 2.5, 0.2] }
		];
	}

}