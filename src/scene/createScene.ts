
import * as THREE from 'three';
import { GROUND_SIZE } from '../../shared/arena.ts';
import { createMilitaryDetails } from './createMilitaryDetails.ts';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();

  const skyColor = 0xaebfc0;

  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.FogExp2(skyColor, 0.0045);

  const camera = new THREE.PerspectiveCamera(
    60,
    Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
    0.1,
    220,
  );

  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });

  renderer.setSize(
    Math.max(1, container.clientWidth),
    Math.max(1, container.clientHeight),
  );

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  container.appendChild(renderer.domElement);

  const hemisphere = new THREE.HemisphereLight(
    0xdce8ec,
    0x77715c,
    1.65,
  );

  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(
    0xffe1ac,
    2.8,
  );

  sun.position.set(-32, 45, 25);
  sun.castShadow = true;

  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 130;
  sun.shadow.camera.left = -52;
  sun.shadow.camera.right = 52;
  sun.shadow.camera.top = 52;
  sun.shadow.camera.bottom = -52;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;

  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(
    0xa6c2d5,
    0.55,
  );

  fill.position.set(24, 16, -20);
  scene.add(fill);

  const ambient = new THREE.AmbientLight(
    0xffffff,
    0.16,
  );

  scene.add(ambient);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 32, 20),
    new THREE.MeshBasicMaterial({
      color: 0xb6c8c9,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );

  scene.add(sky);

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffe8b3,
      fog: false,
      depthWrite: false,
    }),
  );

  sunDisc.position.set(-105, 125, -90);
  scene.add(sunDisc);

  const distantGround = new THREE.Mesh(
    new THREE.PlaneGeometry(360, 360),
    new THREE.MeshStandardMaterial({
      color: 0x767e6b,
      roughness: 1,
    }),
  );

  distantGround.rotation.x = -Math.PI / 2;
  distantGround.position.y = -0.4;
  distantGround.receiveShadow = true;
  scene.add(distantGround);

  const distantMaterial = new THREE.MeshStandardMaterial({
    color: 0x657168,
    roughness: 0.95,
  });

  const structures = [
    [-75, -72, 24, 12, 18],
    [-42, -86, 19, 9, 14],
    [10, -90, 35, 11, 17],
    [70, -75, 27, 14, 20],
    [-86, 8, 18, 9, 30],
    [88, -8, 18, 12, 28],
    [-74, 75, 34, 11, 18],
    [64, 84, 30, 13, 20],
  ];

  for (const [x, z, width, height, depth] of structures) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      distantMaterial,
    );

    mesh.position.set(x, height / 2 - 0.35, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const half = GROUND_SIZE / 2;

  const outerRoadMaterial = new THREE.MeshStandardMaterial({
    color: 0x555c56,
    roughness: 0.97,
  });

  for (const side of [-1, 1]) {
    const roadX = new THREE.Mesh(
      new THREE.PlaneGeometry(8, GROUND_SIZE + 48),
      outerRoadMaterial,
    );

    roadX.rotation.x = -Math.PI / 2;
    roadX.position.set(side * (half + 17), -0.29, 0);
    scene.add(roadX);

    const roadZ = new THREE.Mesh(
      new THREE.PlaneGeometry(GROUND_SIZE + 48, 8),
      outerRoadMaterial,
    );

    roadZ.rotation.x = -Math.PI / 2;
    roadZ.position.set(0, -0.29, side * (half + 17));
    scene.add(roadZ);
  }

  createMilitaryDetails(scene);

  const resize = () => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  };

  window.addEventListener('resize', resize);

  return {
    scene,
    camera,
    renderer,
  };
}
