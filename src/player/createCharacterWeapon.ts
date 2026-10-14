
import * as THREE from 'three';
import { createWeaponModel } from '../combat/createWeaponModel.ts';

export function createCharacterWeapon(): THREE.Group {
  const { group, muzzleZ } = createWeaponModel('rifle');

  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.35, 6),
    new THREE.MeshBasicMaterial({
      color: 0xffd044,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );

  flash.rotation.x = -Math.PI / 2;
  flash.position.z = muzzleZ - 0.17;
  flash.visible = false;
  flash.name = 'muzzleFlash';

  group.add(flash);
  group.scale.setScalar(0.45);
  group.position.set(0.38, 0.05, 0.3);
  group.rotation.y = Math.PI;

  return group;
}
