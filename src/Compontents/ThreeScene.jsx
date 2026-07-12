import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { useData } from "../Context/DataContext";
import { useError } from "../Context/ErrorContext";
import { worldToScene } from "../utils/dataFunctions";

import sampleBuildings from "../constants/sampleCity.json";
const SCENE_CONFIG = {
    backgroundColor: "#B0E2FF",
    camera: {
        fov: 75,
        near: 0.1,
        far: 15000,
        // South of the origin (north = -Z), so the initial view faces north.
        position: { x: 0, y: 100, z: 200 },
    },
    lights: {
        ambient: { color: 0xffffff, intensity: 0.6 },
        directional: {
            color: 0xffffff,
            intensity: 1,
            position: { x: -300, y: 500, z: -200 },
        },
    },
    controls: {
        enableDamping: true,
        dampingFactor: 0.1,
        maxPolarAngle: Math.PI / 2,
    },
    material: {
        color: "#E8E8E8",
        flatShading: true,
    },
    skybox: {
        size: 15000,
        colors: {
            top: "#87CEEB",
            bottom: "#E0F6FF",
            horizon: "#B0E2FF",
        },
    },
};

const ThreeScene = () => {
    const mountRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const rendererRef = useRef(null);
    const controlsRef = useRef(null);
    const animationFrameRef = useRef(null);
    const cityMeshRef = useRef(null);
    const groundMeshRef = useRef(null);
    const compassRef = useRef({ container: null, arrow: null });
    const buildProgressRef = useRef(0);
    // Shared uniform: 1 = elevation applied, 0 = flat. Toggling only mutates
    // .value, so the geometry never has to be rebuilt to switch modes.
    const elevationUniformRef = useRef({ value: 1 });

    const { buildings, setMesh, elevated, ground, transform, showMap } = useData();
    const { setLoaderState, setLoaderMessage } = useError();

    const createCity = useCallback(
        (buildingsData) => {
            setLoaderMessage("All set! Rendering 3D model...");

            if (!buildingsData?.length) {
                buildingsData = sampleBuildings;
            }

            const geometries = [];

            for (const buildingData of buildingsData) {
                if (!buildingData?.nodes || buildingData.nodes.length < 3) {
                    continue;
                }

                const { elevation, height, nodes } = buildingData;

                const hasInvalidNodes = nodes.some(
                    (node) =>
                        !Array.isArray(node) ||
                        node.length < 2 ||
                        !isFinite(node[0]) ||
                        !isFinite(node[1]),
                );

                if (
                    hasInvalidNodes ||
                    !isFinite(elevation) ||
                    !isFinite(height)
                ) {
                    continue;
                }

                // Nodes are scene [x, z] (east = +X, north = -Z; see
                // worldToScene). THREE.Shape lives in an XY plane, so the
                // shape's y takes -z; rotateX(-90°) then maps shape (x, y, e)
                // to scene (x, e, -y) = (x, e, z) with the extrusion up +Y.
                const shape = new THREE.Shape();

                shape.moveTo(nodes[0][0], -nodes[0][1]);
                for (let i = 1; i < nodes.length; i++) {
                    shape.lineTo(nodes[i][0], -nodes[i][1]);
                }
                shape.lineTo(nodes[0][0], -nodes[0][1]);

                const extrudeSettings = {
                    depth: height / 4,
                    bevelEnabled: false,
                };

                const geometry = new THREE.ExtrudeGeometry(
                    shape,
                    extrudeSettings,
                );
                geometry.rotateX(-Math.PI / 2);

                // Store per-vertex elevation instead of baking it in, so a shader
                // uniform can switch elevation on/off without a rebuild.
                const vertexCount = geometry.attributes.position.count;
                const elevationAttr = new Float32Array(vertexCount).fill(elevation);
                geometry.setAttribute(
                    "aElevation",
                    new THREE.BufferAttribute(elevationAttr, 1),
                );

                geometries.push(geometry);
            }

            if (geometries.length === 0) {
                return null;
            }

            const mergedGeometry = BufferGeometryUtils.mergeGeometries(
                geometries,
                false,
            );

            geometries.forEach((geo) => geo.dispose());

            const material = new THREE.MeshStandardMaterial(
                SCENE_CONFIG.material,
            );
            material.onBeforeCompile = (shader) => {
                shader.uniforms.uElevationFactor = elevationUniformRef.current;
                shader.vertexShader =
                    "attribute float aElevation;\nuniform float uElevationFactor;\n" +
                    shader.vertexShader.replace(
                        "#include <begin_vertex>",
                        "#include <begin_vertex>\n    transformed.y += aElevation * uElevationFactor;",
                    );
            };

            // Geometry is already in the final scene frame — no mesh-level
            // rotations or mirrors (see worldToScene in dataFunctions).
            const cityMesh = new THREE.Mesh(mergedGeometry, material);

            return cityMesh;
        },
        [setLoaderMessage],
    );

    const createSkybox = useCallback(() => {
        const skyboxGeometry = new THREE.SphereGeometry(
            SCENE_CONFIG.skybox.size / 2,
            32,
            32,
        );

        const skyboxMaterial = new THREE.ShaderMaterial({
            uniforms: {
                topColor: {
                    value: new THREE.Color(SCENE_CONFIG.skybox.colors.top),
                },
                bottomColor: {
                    value: new THREE.Color(SCENE_CONFIG.skybox.colors.bottom),
                },
                horizonColor: {
                    value: new THREE.Color(SCENE_CONFIG.skybox.colors.horizon),
                },
                offset: { value: 33 },
                exponent: { value: 0.6 },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform vec3 horizonColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;

                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    float t = max(pow(max(h, 0.0), exponent), 0.0);

                    vec3 color;
                    if (h > 0.0) {
                        color = mix(horizonColor, topColor, t);
                    } else {
                        color = mix(horizonColor, bottomColor, pow(abs(h), exponent));
                    }

                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            side: THREE.BackSide,
        });

        const skybox = new THREE.Mesh(skyboxGeometry, skyboxMaterial);
        return skybox;
    }, []);

    const handleResize = useCallback(() => {
        if (!cameraRef.current || !rendererRef.current) return;

        const camera = cameraRef.current;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    }, []);

    const createCompassOverlay = useCallback(() => {
        if (!mountRef.current) return null;

        const container = document.createElement("div");
        container.setAttribute("id", "three-compass");
        container.style.cssText =
            "position:absolute;left:20px;bottom:20px;width:110px;height:110px;border-radius:8px;background:rgba(255,255,255,0.6);backdrop-filter:blur(5px);display:flex;align-items:center;justify-content:center;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:3;";

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("width", "100");
        svg.setAttribute("height", "100");
        svg.style.display = "block";

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("cx", "50");
        circle.setAttribute("cy", "50");
        circle.setAttribute("r", "40");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", "rgba(0,0,0,0.2)");
        circle.setAttribute("stroke-width", "3");
        svg.appendChild(circle);

        const arrow = document.createElementNS(svgNS, "polygon");
        arrow.setAttribute("points", "50,18 70,75 50,65 30,75");
        arrow.setAttribute("fill", "rgba(0,0,0,0.6)");
        arrow.setAttribute("transform", "translate(0,0)");
        arrow.style.transformOrigin = "50% 50%";
        svg.appendChild(arrow);

        container.appendChild(svg);
        mountRef.current.style.position = "relative";
        mountRef.current.appendChild(container);

        return { container, arrowElement: arrow };
    }, []);

    const cleanup = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        window.removeEventListener("resize", handleResize);

        if (controlsRef.current) {
            controlsRef.current.dispose();
            controlsRef.current = null;
        }

        if (sceneRef.current) {
            sceneRef.current.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    const materials = Array.isArray(object.material)
                        ? object.material
                        : [object.material];
                    materials.forEach((material) => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    });
                }
            });
            sceneRef.current.clear();
        }

        if (rendererRef.current) {
            rendererRef.current.dispose();
            if (mountRef.current?.contains(rendererRef.current.domElement)) {
                mountRef.current.removeChild(rendererRef.current.domElement);
            }
        }

        if (
            compassRef.current.container &&
            mountRef.current?.contains(compassRef.current.container)
        ) {
            mountRef.current.removeChild(compassRef.current.container);
            compassRef.current = { container: null, arrow: null };
        }

        sceneRef.current = null;
        cameraRef.current = null;
        rendererRef.current = null;
        cityMeshRef.current = null;
        groundMeshRef.current = null;
    }, [handleResize]);

    // Scene, camera, renderer, lights, controls and the render loop are created
    // once on mount. Selecting a new city no longer tears any of this down.
    useEffect(() => {
        if (!mountRef.current) return;
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const skybox = createSkybox();
        scene.add(skybox);

        const camera = new THREE.PerspectiveCamera(
            SCENE_CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            SCENE_CONFIG.camera.near,
            SCENE_CONFIG.camera.far,
        );
        const { x, y, z } = SCENE_CONFIG.camera.position;
        camera.position.set(x, y, z);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const ambientLight = new THREE.AmbientLight(
            SCENE_CONFIG.lights.ambient.color,
            SCENE_CONFIG.lights.ambient.intensity,
        );
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(
            SCENE_CONFIG.lights.directional.color,
            SCENE_CONFIG.lights.directional.intensity,
        );
        const sunPos = SCENE_CONFIG.lights.directional.position;
        sunLight.position.set(sunPos.x, sunPos.y, sunPos.z);
        scene.add(sunLight);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = SCENE_CONFIG.controls.enableDamping;
        controls.dampingFactor = SCENE_CONFIG.controls.dampingFactor;
        controls.maxPolarAngle = SCENE_CONFIG.controls.maxPolarAngle;
        controlsRef.current = controls;

        const compass = createCompassOverlay();
        if (compass) {
            compassRef.current.container = compass.container;
            compassRef.current.arrow = compass.arrowElement;
        }

        // Dev-only handle for debugging/inspection (e.g. grabbing a frame
        // when OS-level screenshots of the WebGL canvas are unavailable).
        if (import.meta.env.DEV) {
            window.__atlas = { renderer, scene, camera };
        }

        const dirVec = new THREE.Vector3();
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            controls.update();

            if (cityMeshRef.current && buildProgressRef.current < 1) {
                buildProgressRef.current += 0.001;
                cityMeshRef.current.scale.y = THREE.MathUtils.lerp(
                    cityMeshRef.current.scale.y,
                    1,
                    buildProgressRef.current,
                );
            }

            if (cameraRef.current && compassRef.current.arrow) {
                cameraRef.current.getWorldDirection(dirVec);
                dirVec.y = 0;
                if (dirVec.lengthSq() > 0.000001) dirVec.normalize();
                // North is -Z: heading north (dir = (0,0,-1)) -> arrow at 0°.
                const angleRad = Math.atan2(-dirVec.x, -dirVec.z);
                const angleDeg = angleRad * (180 / Math.PI);
                compassRef.current.arrow.style.transform = `rotate(${angleDeg}deg)`;
            }

            renderer.render(scene, camera);
        };
        animate();

        window.addEventListener("resize", handleResize);

        return cleanup;
    }, [createSkybox, createCompassOverlay, handleResize, cleanup]);

    // Rebuild only the city mesh when the buildings change; the rest of the
    // scene stays alive.
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (cityMeshRef.current) {
            scene.remove(cityMeshRef.current);
            cityMeshRef.current.geometry.dispose();
            cityMeshRef.current.material.dispose();
            cityMeshRef.current = null;
        }

        const cityMesh = createCity(buildings);
        if (cityMesh) {
            cityMesh.scale.y = 0.001;
            buildProgressRef.current = 0;
            scene.add(cityMesh);
            cityMeshRef.current = cityMesh;
            setMesh(cityMesh);
        } else {
            setMesh(null);
        }

        setLoaderState(false);
        setLoaderMessage("");
    }, [buildings, createCity, setMesh, setLoaderState, setLoaderMessage]);

    // Map ground: a textured plane spanning the stitched tiles' exact
    // web-mercator bounds, placed through the same worldToScene mapping the
    // buildings use, so streets land under their footprints. Rebuilt only
    // when a new city/ground arrives.
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        if (groundMeshRef.current) {
            scene.remove(groundMeshRef.current);
            groundMeshRef.current.geometry.dispose();
            if (groundMeshRef.current.material.map) {
                groundMeshRef.current.material.map.dispose();
            }
            groundMeshRef.current.material.dispose();
            groundMeshRef.current = null;
        }

        if (!ground || !transform) return;

        const { wxMin, wyMin, wxMax, wyMax } = ground.tileWorldBounds;
        // Same frame as the buildings, via the same helper: NW and SE tile
        // corners in scene space give the plane's extent and center directly.
        const [xNW, zNW] = worldToScene(wxMin, wyMin, transform);
        const [xSE, zSE] = worldToScene(wxMax, wyMax, transform);

        const geometry = new THREE.PlaneGeometry(xSE - xNW, zSE - zNW);
        // Lay flat facing up; canvas top row (north) lands at -Z.
        geometry.rotateX(-Math.PI / 2);
        geometry.translate((xNW + xSE) / 2, 0, (zNW + zSE) / 2);

        const texture = new THREE.CanvasTexture(ground.canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        if (rendererRef.current) {
            texture.anisotropy = Math.min(
                8,
                rendererRef.current.capabilities.getMaxAnisotropy(),
            );
        }

        // Unlit so the map reads at full brightness regardless of lighting.
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide,
        });

        const groundMesh = new THREE.Mesh(geometry, material);
        groundMesh.position.y = -1; // just below building bases; avoids z-fighting
        scene.add(groundMesh);
        groundMeshRef.current = groundMesh;
    }, [ground, transform]);

    useEffect(() => {
        if (groundMeshRef.current) groundMeshRef.current.visible = showMap;
    }, [showMap, ground]);

    // Elevation is a shader uniform, so toggling is instant — no rebuild.
    useEffect(() => {
        elevationUniformRef.current.value = elevated ? 1 : 0;
    }, [elevated]);

    return (
        <div
            ref={mountRef}
            style={{
                width: "100%",
                height: "100vh",
                margin: 0,
                padding: 0,
                overflow: "hidden",
                zIndex: 0,
            }}
        />
    );
};

export default ThreeScene;
