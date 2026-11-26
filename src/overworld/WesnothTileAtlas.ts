import * as THREE from 'three';
import { WesnothMapData } from './WesnothMapSystem';
import { computeHexAutoTilePlan } from './WesnothAutoTiler';
import { getWesnothImage, whenAllWesnothImagesReady } from './WesnothAssetLoader';

export const TILE_PX = 72;
export const CELL_PAD = 4;
export const CELL_STRIDE = TILE_PX + CELL_PAD * 2; // 80px

export interface AtlasLayout {
  atlasW: number;
  atlasH: number;
  cellOrigin(x: number, y: number): { ox: number; oy: number };
}

export class WesnothTileAtlas {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  public layout: AtlasLayout;
  private disposed = false;

  constructor(map: WesnothMapData, onReady?: () => void) {
    const atlasW = 2048; // fits up to 25 columns at 80px stride
    const atlasH = 2048; // fits up to 25 rows at 80px stride

    this.canvas = document.createElement('canvas');
    this.canvas.width = atlasW;
    this.canvas.height = atlasH;
    const ctx = this.canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    this.layout = {
      atlasW,
      atlasH,
      cellOrigin(x: number, y: number) {
        return {
          ox: x * CELL_STRIDE + CELL_PAD,
          oy: y * CELL_STRIDE + CELL_PAD
        };
      }
    };

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;

    // Paint immediately with any cached images, then repaint once all 102 PNGs finish decoding
    this.compositeMap(map);
    whenAllWesnothImagesReady().then(() => {
      if (this.disposed) return;
      this.compositeMap(map);
      onReady?.();
    });
  }

  public compositeMap(map: WesnothMapData) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;

        const { ox, oy } = this.layout.cellOrigin(x, y);
        const plan = computeHexAutoTilePlan(map, x, y);

        // Fallback biome fill color to prevent any sub-pixel edge gaps
        ctx.fillStyle = `#${tile.terrain.sideColor.toString(16).padStart(6, '0')}`;
        ctx.fillRect(ox - 2, oy - 2, TILE_PX + 4, TILE_PX + 4);

        const baseImg = getWesnothImage(plan.baseAsset);
        if (baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
          // Slight 2px bleed underneath prevents any transparent border fringe on hex corners
          ctx.drawImage(baseImg, ox - 1, oy - 1, TILE_PX + 2, TILE_PX + 2);
          ctx.drawImage(baseImg, ox, oy, TILE_PX, TILE_PX);
        }

        // Composite all ordered Wesnoth directional transitions on top of the base tile
        for (const tr of plan.transitions) {
          const trImg = getWesnothImage(tr.assetKey);
          if (trImg && trImg.complete && trImg.naturalWidth > 0) {
            ctx.drawImage(trImg, ox, oy, TILE_PX, TILE_PX);
          }
        }

        // Apply calibrated biome grading (Frostpeaks, Sunfire Dunes, Ashen Caldera, Magma)
        if (tile.terrain.baseCode === 'Qlf') {
          ctx.save();
          ctx.fillStyle = '#36100a';
          ctx.fillRect(ox - 1, oy - 1, TILE_PX + 2, TILE_PX + 2);
          ctx.fillStyle = '#d9480f';
          ctx.fillRect(ox + 10, oy + 14, 52, 8);
          ctx.fillRect(ox + 18, oy + 34, 40, 7);
          ctx.fillRect(ox + 12, oy + 50, 44, 6);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(ox + 18, oy + 16, 26, 3);
          ctx.fillRect(ox + 26, oy + 36, 22, 3);
          ctx.restore();
        } else if (tile.terrain.biomeTint && tile.terrain.biomeTintAlpha) {
          ctx.save();
          ctx.globalAlpha = tile.terrain.biomeTintAlpha;
          ctx.fillStyle = tile.terrain.biomeTint;
          ctx.fillRect(ox - 1, oy - 1, TILE_PX + 2, TILE_PX + 2);
          ctx.restore();
        }
      }
    }

    this.texture.needsUpdate = true;
  }

  public dispose() {
    this.disposed = true;
    this.texture.dispose();
  }
}
