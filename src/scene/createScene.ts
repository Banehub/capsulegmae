import * as THREE from 'three';
import { GROUND_SIZE } from '../../shared/arena.ts';
import { FireEffect } from './FireEffect.ts';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x121826);
  scene.fog = new THREE.FogExp2(0x151d2c, 0.008);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    200,
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.75;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0x8a9ab8, 0x1a2030, 1.4);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0xd8e4ff, 1.55);
  moon.position.set(-12, 20, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 0.5;
  moon.shadow.camera.far = 70;
  moon.shadow.camera.left = -28;
  moon.shadow.camera.right = 28;
  moon.shadow.camera.top = 28;
  moon.shadow.camera.bottom = -28;
  moon.shadow.bias = -0.0004;
  scene.add(moon);

  const fill = new THREE.DirectionalLight(0xa8c0ff, 0.75);
  fill.position.set(8, 12, -10);
  scene.add(fill);

  // Soft top fill so crates/players read clearly.
  const top = new THREE.DirectionalLight(0xffffff, 0.35);
  top.position.set(0, 25, 0);
  scene.add(top);

  const half = GROUND_SIZE / 2;

  const firePositions = [
    new THREE.Vector3(half - 2, 0, -half + 2),
    new THREE.Vector3(-half + 2, 0, -half + 4),
    new THREE.Vector3(half - 4, 0, half - 3),
  ];

  const fires: FireEffect[] = [];
  const fireLights: THREE.PointLight[] = [];

  for (const pos of firePositions) {
    const fire = new FireEffect(pos, 100, 1.2, 1);
    scene.add(fire.points);
    fires.push(fire);

    const light = new THREE.PointLight(0xff6a2e, 38, 45, 2);
    light.position.set(pos.x, 2.5, pos.z);
    scene.add(light);
    fireLights.push(light);
  }

  const blueRim = new THREE.PointLight(0x3f7bff, 28, 60, 2);
  blueRim.position.set(-half + 3, 6, half - 3);
  scene.add(blueRim);

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const fire of fires) fire.update(delta);
    for (let i = 0; i < fireLights.length; i += 1) {
      const flicker = 0.8 + Math.sin(t * 12 + i) * 0.12 + Math.sin(t * 27 + i) * 0.08;
      fireLights[i]!.intensity = 38 * flicker;
    }
  });

  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  return { scene, camera, renderer };
}
