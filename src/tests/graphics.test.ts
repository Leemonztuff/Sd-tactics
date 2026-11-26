import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BRAWL_PALETTE,
  QUALITY_PRESETS,
  getBrawlToonGradientTexture,
  resolveDefaultQualityTier
} from '../rendering/BrawlStyleSystem';
import { createEntityGroup } from '../rendering/EntityMeshFactory';
import { EntityManager } from '../entities/EntityManager';
import { createStarterSaveData, serializeSaveData, validateSaveData } from '../utils/SaveSystem';
import { parseWesnothMap } from '../overworld/WesnothMapSystem';
import { VALEN_WESNOTH_MAP_TEXT } from '../overworld/WesnothOverworldMap';
import {
  MAX_OVERWORLD_FOG_WISPS,
  MAX_OVERWORLD_MOTES,
  OverworldWeatherSystem
} from '../overworld/OverworldWeatherSystem';

test('resolveDefaultQualityTier selects Eco on low-RAM mobile and software WebGL', () => {
  assert.equal(resolveDefaultQualityTier({ isSoftwareGl: true, viewportWidth: 1440 }), 'eco');
  assert.equal(resolveDefaultQualityTier({ isSoftwareGl: false, deviceMemoryGb: 2, viewportWidth: 390 }), 'eco');
  assert.equal(
    resolveDefaultQualityTier({ isSoftwareGl: false, hardwareConcurrency: 4, viewportWidth: 390 }),
    'eco'
  );
  assert.equal(
    resolveDefaultQualityTier({ isSoftwareGl: false, deviceMemoryGb: 4, hardwareConcurrency: 8, viewportWidth: 390 }),
    'balanced'
  );
  assert.equal(
    resolveDefaultQualityTier({ isSoftwareGl: false, deviceMemoryGb: 8, hardwareConcurrency: 8, viewportWidth: 1440 }),
    'high'
  );

  // Eco preset disables costly shadows, outlines, and high DPR
  assert.equal(QUALITY_PRESETS.eco.maxPixelRatio, 1.0);
  assert.equal(QUALITY_PRESETS.eco.shadowsEnabled, false);
  assert.equal(QUALITY_PRESETS.eco.outlinesEnabled, false);
  assert.equal(QUALITY_PRESETS.high.shadowsEnabled, true);
  assert.equal(QUALITY_PRESETS.high.outlinesEnabled, true);
});

test('BRAWL_PALETTE calibrates Overworld terrain darker than units to prevent white blowout', () => {
  const ow = BRAWL_PALETTE.overworld;
  assert.ok(ow.toneMappingExposure <= 1.08);
  assert.ok(ow.sunIntensity <= 1.45);
  assert.ok(ow.hemiIntensity <= 0.85);

  const terrainTint = new THREE.Color(ow.terrainTintHex);
  const propTint = new THREE.Color(ow.propSpriteTintHex);
  const unitTint = new THREE.Color(ow.unitSpriteTintHex);
  assert.ok(terrainTint.getHSL({ h: 0, s: 0, l: 0 }).l < unitTint.getHSL({ h: 0, s: 0, l: 0 }).l);
  assert.ok(propTint.getHSL({ h: 0, s: 0, l: 0 }).l < unitTint.getHSL({ h: 0, s: 0, l: 0 }).l);
});

test('createEntityGroup uses Brawl toon ramp and toggleable inverted-hull outlines', () => {
  const grad = getBrawlToonGradientTexture();
  assert.equal(grad.image.width, 3);
  assert.equal(grad.image.height, 1);

  const em = new EntityManager();
  const guard = em.createEntity('g1', 'Valerius', 'player', 'guard', 1, 0, 0, 0);

  const groupWithOutlines = createEntityGroup(guard, true);
  let outlineCount = 0;
  let visibleOutlines = 0;
  groupWithOutlines.traverse(obj => {
    if (obj.userData?.isOutline) {
      outlineCount++;
      if (obj.visible) visibleOutlines++;
    }
  });
  assert.ok(outlineCount >= 6);
  assert.equal(visibleOutlines, outlineCount);

  const groupEco = createEntityGroup(guard, false);
  let ecoVisibleOutlines = 0;
  groupEco.traverse(obj => {
    if (obj.userData?.isOutline && obj.visible) ecoVisibleOutlines++;
  });
  assert.equal(ecoVisibleOutlines, 0);
});

test('SaveSystem persists and validates qualityTier setting', () => {
  const starter = createStarterSaveData();
  starter.qualityTier = 'eco';
  const parsed = JSON.parse(serializeSaveData(starter));
  const validated = validateSaveData(parsed);
  assert.equal(validated?.qualityTier, 'eco');

  // Invalid qualityTier is rejected
  parsed.qualityTier = 'ultra_bogus';
  assert.equal(validateSaveData(parsed), null);
});

test('OverworldWeatherSystem generates biome-tinted fog/motes, scales by quality tier, and steps cleanly within bounds', () => {
  const map = parseWesnothMap(VALEN_WESNOTH_MAP_TEXT);
  const weather = new OverworldWeatherSystem(map, QUALITY_PRESETS.eco.particleScale);

  const ecoCounts = weather.getActiveCounts();
  assert.ok(ecoCounts.fogCount < MAX_OVERWORLD_FOG_WISPS);
  assert.ok(ecoCounts.moteCount < MAX_OVERWORLD_MOTES);

  weather.setQualityScale(QUALITY_PRESETS.high.particleScale);
  const highCounts = weather.getActiveCounts();
  assert.equal(highCounts.fogCount, MAX_OVERWORLD_FOG_WISPS);
  assert.equal(highCounts.moteCount, MAX_OVERWORLD_MOTES);

  const posAttr = weather.motePoints.geometry.getAttribute('position') as THREE.BufferAttribute;
  const beforeX = posAttr.getX(0);

  for (let i = 0; i < 40; i++) {
    weather.step(0.05, i * 0.05);
  }

  const afterX = posAttr.getX(0);
  assert.notEqual(afterX, beforeX);
  for (let i = 0; i < highCounts.moteCount; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    assert.ok(x >= weather.bounds.minX && x <= weather.bounds.maxX);
    assert.ok(z >= weather.bounds.minZ && z <= weather.bounds.maxZ);
  }

  weather.dispose();
});
