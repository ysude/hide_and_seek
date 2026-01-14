/* 
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/ClientSide/javascript.js to edit this template
 */


// entities/Player.js
import * as THREE from "three";

export class Player {
    constructor(camera, controls) {
        this.camera = camera;
        this.controls = controls;
        
        // Oyuncu Özellikleri
        this.health = 100;
        this.inventory = [];
        this.height = 1.7; // Göz hizası
        this.speed = 4;
        this.runSpeed = 8;
    }

    update(dt, keys) {
        // Hareket mantığını Game.js'den buraya taşıyabilirsin
    }
}