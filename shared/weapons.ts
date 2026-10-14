export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  slot: number;
  damage: number;
  magazineSize: number;
  reserveAmmo: number;
  fireCooldownMs: number;
  reloadSeconds: number;
  automatic: boolean;
  pellets: number;
  spread: number;
  recoil: number;
  range: number;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  pistol: {
    id: 'pistol',
    name: 'PISTOL',
    slot: 1,
    damage: 4,
    magazineSize: 12,
    reserveAmmo: 60,
    fireCooldownMs: 260,
    reloadSeconds: 1.2,
    automatic: false,
    pellets: 1,
    spread: 0.004,
    recoil: 0.5,
    range: 65,
  },
  rifle: {
    id: 'rifle',
    name: 'ASSAULT RIFLE',
    slot: 2,
    damage: 5,
    magazineSize: 30,
    reserveAmmo: 120,
    fireCooldownMs: 150,
    reloadSeconds: 1.8,
    automatic: true,
    pellets: 1,
    spread: 0.009,
    recoil: 0.65,
    range: 80,
  },
  shotgun: {
    id: 'shotgun',
    name: 'SHOTGUN',
    slot: 3,
    damage: 2,
    magazineSize: 6,
    reserveAmmo: 36,
    fireCooldownMs: 850,
    reloadSeconds: 2.4,
    automatic: false,
    pellets: 8,
    spread: 0.085,
    recoil: 1,
    range: 30,
  },
  sniper: {
    id: 'sniper',
    name: 'SNIPER',
    slot: 4,
    damage: 16,
    magazineSize: 5,
    reserveAmmo: 25,
    fireCooldownMs: 1300,
    reloadSeconds: 2.8,
    automatic: false,
    pellets: 1,
    spread: 0,
    recoil: 1.2,
    range: 100,
  },
};

export const WEAPON_IDS: WeaponId[] = [
  'pistol',
  'rifle',
  'shotgun',
  'sniper',
];