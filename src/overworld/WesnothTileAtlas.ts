import * as THREE from 'three';
import { WesnothMapData } from './WesnothMapSystem';
import { computeHexAutoTilePlan, getDirectionalNeighbors } from './WesnothAutoTiler';
import { getWesnothImage, whenAllWesnothImagesReady } from './WesnothAssetLoader';

export const TILE_PX = 72;
export const CELL_PAD = 4;
export const CELL_STRIDE = TILE_PX + CELL_PAD * 2; // 80px

export interface AtlasLayout {
  atlasW: number;
  atlasH: number;
  cellOrigin(x: number, y: number): { ox: number; oy: number };
}

export interface ShroudVisibilityState {
  isDungeon: boolean;
  explored: Set<string>;
  visible: Set<string>;
}

export class WesnothTileAtlas {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  public texture: THREE.CanvasTexture;
  public layout: AtlasLayout;
  private disposed = false;
  private latestVisibility?: ShroudVisibilityState;

  constructor(
    map: WesnothMapData,
    onReady?: () => void,
    initialVisibility?: ShroudVisibilityState
  ) {
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

    this.latestVisibility = initialVisibility;

    // Paint immediately with any cached images, then repaint once all PNGs finish decoding
    this.compositeMap(map, this.latestVisibility);
    whenAllWesnothImagesReady().then(() => {
      if (this.disposed) return;
      this.compositeMap(map, this.latestVisibility);
      onReady?.();
    });
  }

  public updateDungeonVisibility(map: WesnothMapData, visibility: ShroudVisibilityState) {
    if (this.disposed) return;
    this.latestVisibility = visibility;
    this.compositeMap(map, visibility);
  }

  public compositeMap(map: WesnothMapData, visibility?: ShroudVisibilityState) {
    this.latestVisibility = visibility;
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const isDungeon = Boolean(visibility?.isDungeon);
    const shroudCenterImg = isDungeon ? getWesnothImage('shroud_void') : undefined;
    const fogCenterImg = isDungeon ? getWesnothImage('fog_center') : undefined;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.tiles[y]?.[x];
        if (!tile) continue;

        const { ox, oy } = this.layout.cellOrigin(x, y);
        const key = `${x},${y}`;

        // Unexplored dungeon hex: solid pitch-black Shroud (#000000), zero spoiler pixels
        if (isDungeon && visibility && !visibility.explored.has(key)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(ox - 3, oy - 3, TILE_PX + 6, TILE_PX + 6);
          if (shroudCenterImg && shroudCenterImg.complete && shroudCenterImg.naturalWidth > 0) {
            ctx.drawImage(shroudCenterImg, ox, oy, TILE_PX, TILE_PX);
          }
          continue;
        }

        const plan = computeHexAutoTilePlan(map, x, y);

        // Fallback biome fill color to prevent any sub-pixel edge gaps
        ctx.fillStyle = `#${tile.terrain.sideColor.toString(16).padStart(6, '0')}`;
        ctx.fillRect(ox - 2, oy - 2, TILE_PX + 4, TILE_PX + 4);

        const baseImg = getWesnothImage(plan.baseAsset);
        if (baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
          // Slight bleed underneath prevents transparent border fringe on hex corners
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
          ctx.globalAlpha = 0.16;
          ctx.fillStyle = '#fb923c';
          ctx.fillRect(ox - 1, oy - 1, TILE_PX + 2, TILE_PX + 2);
          ctx.restore();
        } else if (tile.terrain.biomeTint && tile.terrain.biomeTintAlpha) {
          ctx.save();
          ctx.globalAlpha = tile.terrain.biomeTintAlpha;
          ctx.fillStyle = tile.terrain.biomeTint;
          ctx.fillRect(ox - 1, oy - 1, TILE_PX + 2, TILE_PX + 2);
          ctx.restore();
        }

        if (isDungeon && visibility) {
          // Wesnoth shroud-void edge transitions wherever an explored hex borders unexplored blackness
          const neighbors = getDirectionalNeighbors(map, x, y);
          for (const { dir, coord } of neighbors) {
            const nbKey = `${coord.x},${coord.y}`;
            if (!visibility.explored.has(nbKey)) {
              const svImg = getWesnothImage(`shroud_void_${dir}`);
              if (svImg && svImg.complete && svImg.naturalWidth > 0) {
                ctx.drawImage(svImg, ox, oy, TILE_PX, TILE_PX);
              }
            }
          }

          const isVisible = visibility.visible.has(key);
          if (!isVisible) {
            // Explored but out of torchlight LoS -> Dark Fog of War (legible dim slate vs pure #000000 Shroud)
            if (fogCenterImg && fogCenterImg.complete && fogCenterImg.naturalWidth > 0) {
              ctx.save();
              ctx.globalAlpha = 0.45;
              ctx.drawImage(fogCenterImg, ox, oy, TILE_PX, TILE_PX);
              ctx.restore();
            }
            ctx.save();
            ctx.fillStyle = 'rgba(4, 8, 16, 0.42)';
            ctx.fillRect(ox - 2, oy - 2, TILE_PX + 4, TILE_PX + 4);
            ctx.restore();
          } else if (!tile.terrain.isWall && !tile.terrain.isChasm) {
            // Subtle warm hero torchlight glaze inside visible dungeon halls
            ctx.save();
            ctx.fillStyle = 'rgba(255, 204, 128, 0.1)';
            ctx.fillRect(ox - 1, oy - 1, TILE_PX + 2, TILE_PX + 2);
            ctx.restore();
          }
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
