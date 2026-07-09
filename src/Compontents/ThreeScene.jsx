import { useEffect, useRef, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import { useData } from "../Context/DataContext";
import { useError } from "../Context/ErrorContext";

import sampleBuildings from "../constants/sampleCity.json";
const SCENE_CONFIG = {
    backgroundColor: "#B0E2FF",
    camera: {
        fov: 75,
        near: 0.1,
        far: 15000,
        position: { x: 0, y: 100, z: -200 },
    },
    lights: {
        ambient: { color: 0xffffff, intensity: 0.6 },
        directional: {
            color: 0xffffff,
            intensity: 1,
            position: { x: 300, y: 500, z: 200 },
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
    const compassRef = useRef({ container: null, arrow: null });

    const { buildings, setMesh, elevated } = useData();
    const { setLoaderState, setLoaderMessage } = useError();

    const createCity = useCallback(
        (buildingsData, isElevated) => {
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

                const shape = new THREE.Shape();

                shape.moveTo(nodes[0][0], nodes[0][1]);
                for (let i = 1; i < nodes.length; i++) {
                    shape.lineTo(nodes[i][0], nodes[i][1]);
                }
                shape.lineTo(nodes[0][0], nodes[0][1]);

                const extrudeSettings = {
                    depth: height / 4,
                    bevelEnabled: false,
                };

                const geometry = new THREE.ExtrudeGeometry(
                    shape,
                    extrudeSettings,
                );
                geometry.rotateX(Math.PI / 2);
                geometry.translate(0, -elevation * (isElevated ? 1 : 0), 0);
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
            const cityMesh = new THREE.Mesh(mergedGeometry, material);
            cityMesh.rotation.z = Math.PI;

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
                    if (Array.isArray(object.material)) {
                        object.material.forEach((material) =>
                            material.dispose(),
                        );
                    } else {
                        object.material.dispose();
                    }
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
    }, [handleResize]);

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

        const cityMesh = createCity(buildings, elevated);
        if (cityMesh) {
            cityMesh.scale.y = 0.001;
            scene.add(cityMesh);
            cityMeshRef.current = cityMesh;
            setMesh(cityMesh);
        }

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

        let buildProgress = 0;
        const dirVec = new THREE.Vector3();
        const animate = () => {
            animationFrameRef.current = requestAnimationFrame(animate);
            controls.update();

            if (cityMeshRef.current && buildProgress < 1) {
                buildProgress += 0.001;
                cityMeshRef.current.scale.y = THREE.MathUtils.lerp(
                    cityMeshRef.current.scale.y,
                    1,
                    buildProgress,
                );
            }

            if (cameraRef.current && compassRef.current.arrow) {
                cameraRef.current.getWorldDirection(dirVec);
                dirVec.y = 0;
                if (dirVec.lengthSq() > 0.000001) dirVec.normalize();
                const angleRad = Math.atan2(dirVec.x, dirVec.z);
                const angleDeg = angleRad * (180 / Math.PI);
                compassRef.current.arrow.style.transform = `rotate(${angleDeg}deg)`;
            }

            renderer.render(scene, camera);
        };
        animate();

        window.addEventListener("resize", handleResize);

        setLoaderState(false);
        setLoaderMessage("");
        return cleanup;
    }, [
        buildings,
        createCity,
        createSkybox,
        handleResize,
        cleanup,
        setMesh,
        createCompassOverlay,
        elevated,
        setLoaderMessage,
        setLoaderState,
    ]);

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
