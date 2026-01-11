// InputController.js - TIKLAMA DESTEKLİ
export default class InputController {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        
        // Tıklama kontrolü
        this.isMouseClicked = false; 

        // Klavye
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Mouse Hareket
        canvas.addEventListener('click', () => {
            canvas.requestPointerLock();
        });

        // Tıklama (Mousedown ile yakalayıp bayrağı kaldırıyoruz)
        document.addEventListener('mousedown', () => {
            if (document.pointerLockElement === this.canvas) {
                this.isMouseClicked = true;
            }
        });

        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    handleMouseMove(e) {
        if (document.pointerLockElement === this.canvas) {
            this.mouseDeltaX += e.movementX;
            this.mouseDeltaY -= e.movementY;
        }
    }

    isKeyPressed(key) {
        return !!this.keys[key];
    }

    getMouseDelta() {
        const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        return delta;
    }
    
    // Tıklamayı oku ve hemen sıfırla (Yoksa sürekli tıklıyor sanar)
    getClick() {
        const clicked = this.isMouseClicked;
        this.isMouseClicked = false;
        return clicked;
    }
}