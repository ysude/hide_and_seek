import * as THREE from 'three';
import { GLTFLoader as ThreeGLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class GLTFLoader {
    constructor(gl) {
        this.gl = gl;
        this.loader = new ThreeGLTFLoader();
    }

    /**
     * Loads a .glb file, finds all mesh parts, merges them, 
     * and returns raw data for WebGL.
     */
    async load(url) {
        return new Promise((resolve, reject) => {
            this.loader.load(
                url, 
                (gltf) => {
                    const meshData = this.extractAndMergeGeometry(gltf.scene);
                    if (meshData) {
                        resolve(meshData);
                    } else {
                        reject("No mesh data found in the model!");
                    }
                }, 
                undefined, 
                (error) => {
                    reject(error);
                }
            );
        });
    }

    extractAndMergeGeometry(scene) {
        const meshes = [];

        // 1. Traverse the scene and find ALL mesh objects
        scene.traverse((child) => {
            if (child.isMesh) {
                // Ensure the transformation matrix is up to date
                child.updateMatrixWorld(true); 
                meshes.push(child);
            }
        });

        if (meshes.length === 0) return null;

        console.log(`Found ${meshes.length} mesh parts. Merging into one geometry...`);

        // 2. Merge geometries into a single mesh
        let finalGeometry;
        
        if (meshes.length === 1) {
            // If it's already a single piece, just use it
            finalGeometry = meshes[0].geometry;
        } else {
            // Collect all geometries
            const geometries = [];
            meshes.forEach(mesh => {
                // Clone the geometry so we don't modify the original scene
                const geom = mesh.geometry.clone();
                
                // Apply the local transformation (position/rotation relative to parent)
                // directly to the vertices. This ensures parts stay where they belong.
                geom.applyMatrix4(mesh.matrixWorld);
                
                geometries.push(geom);
            });

            // Merge them using Three.js Utils
            try {
                finalGeometry = BufferGeometryUtils.mergeGeometries(geometries, false);
            } catch (e) {
                console.warn("Merge failed, falling back to the first mesh part.", e);
                finalGeometry = meshes[0].geometry;
            }
        }

        if (!finalGeometry) return null;

        // 3. Extract raw arrays for Native WebGL
        return {
            positions: finalGeometry.attributes.position.array,
            normals: finalGeometry.attributes.normal ? finalGeometry.attributes.normal.array : null,
            texCoords: finalGeometry.attributes.uv ? finalGeometry.attributes.uv.array : null,
            indices: finalGeometry.index ? finalGeometry.index.array : null,
            vertexCount: finalGeometry.index ? finalGeometry.index.count : finalGeometry.attributes.position.count
        };
    }
}