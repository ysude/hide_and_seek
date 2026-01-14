// Camera.js
const mat4 = window.glMatrix.mat4;
const vec3 = window.glMatrix.vec3;

function degToRad(degrees) {
    return degrees * Math.PI / 180;
}

export default class Camera {
    constructor(position, up, yaw, pitch) {
        this.position = vec3.fromValues(position[0], position[1], position[2]);
        this.worldUp = vec3.fromValues(up[0], up[1], up[2]);
        this.front = vec3.create();
        this.right = vec3.create();
        this.up = vec3.create();

        this.yaw = yaw;
        this.pitch = pitch;

        this.movementSpeed = 5.0;
        this.mouseSensitivity = 0.1;

        this.updateCameraVectors();
    }

    getViewMatrix() {
        let target = vec3.create();
        vec3.add(target, this.position, this.front);
        let viewMatrix = mat4.create();
        mat4.lookAt(viewMatrix, this.position, target, this.up);
        return viewMatrix;
    }

    processKeyboard(direction, deltaTime) {
        let velocity = this.movementSpeed * deltaTime;
        if (direction === 'FORWARD') {
            let moveDir = vec3.create();
            vec3.scale(moveDir, this.front, velocity);
            vec3.add(this.position, this.position, moveDir);
        }
        if (direction === 'BACKWARD') {
            let moveDir = vec3.create();
            vec3.scale(moveDir, this.front, velocity);
            vec3.sub(this.position, this.position, moveDir);
        }
        if (direction === 'LEFT') {
            let moveDir = vec3.create();
            vec3.scale(moveDir, this.right, velocity);
            vec3.sub(this.position, this.position, moveDir);
        }
        if (direction === 'RIGHT') {
            let moveDir = vec3.create();
            vec3.scale(moveDir, this.right, velocity);
            vec3.add(this.position, this.position, moveDir);
        }
        if (direction === 'UP') {
            let moveDir = vec3.create();
            vec3.scale(moveDir, this.worldUp, velocity);
            vec3.add(this.position, this.position, moveDir);
        }
        if (direction === 'DOWN') {
            let moveDir = vec3.create();
            vec3.scale(moveDir, this.worldUp, velocity);
            vec3.sub(this.position, this.position, moveDir);
        }
    }

    processMouseMovement(xoffset, yoffset, constrainPitch = true) {
        xoffset *= this.mouseSensitivity;
        yoffset *= this.mouseSensitivity;

        this.yaw += xoffset;
        this.pitch += yoffset;

        if (constrainPitch) {
            if (this.pitch > 89.0) this.pitch = 89.0;
            if (this.pitch < -89.0) this.pitch = -89.0;
        }
        this.updateCameraVectors();
    }

    updateCameraVectors() {
        let newFront = vec3.create();
        newFront[0] = Math.cos(degToRad(this.yaw)) * Math.cos(degToRad(this.pitch));
        newFront[1] = Math.sin(degToRad(this.pitch));
        newFront[2] = Math.sin(degToRad(this.yaw)) * Math.cos(degToRad(this.pitch));
        
        vec3.normalize(this.front, newFront);
        vec3.cross(this.right, this.front, this.worldUp);
        vec3.normalize(this.right, this.right);
        vec3.cross(this.up, this.right, this.front);
        vec3.normalize(this.up, this.up);
    }
}