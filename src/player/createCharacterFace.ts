import * as THREE from 'three';
import { PLAYER_HALF_HEIGHT, PLAYER_RADIUS } from '../../shared/combat.ts';

export function createCharacterFace(): THREE.Group {
  const face = new THREE.Group();
  const frontZ = PLAYER_RADIUS + 0.015;
  const eyeY = PLAYER_HALF_HEIGHT * 0.55;

  const eyeGeometry = new THREE.SphereGeometry(0.055, 10, 8);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pupilGeometry = new THREE.SphereGeometry(0.025, 8, 6);
  const pupilMaterial = new THREE.MeshBasicMaterial({ color: 0x101018 });

  for (const x of [-0.105, 0.105]) {
    const eye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    eye.position.set(x, eyeY, frontZ);
    eye.scale.z = 0.45;
    face.add(eye);

    const pupil = new THREE.Mesh(pupilGeometry, pupilMaterial);
    pupil.position.set(x, eyeY, frontZ + 0.045);
    face.add(pupil);
  }

  const smileCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.12, eyeY - 0.18, frontZ + 0.025),
    new THREE.Vector3(0, eyeY - 0.27, frontZ + 0.055),
    new THREE.Vector3(0.12, eyeY - 0.18, frontZ + 0.025),
  );
  const smile = new THREE.Mesh(
    new THREE.TubeGeometry(smileCurve, 12, 0.015, 6, false),
    pupilMaterial,
  );
  face.add(smile);

  return face;
}
