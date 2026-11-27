/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { game } from './game/Game';
import { MainMenu } from './ui/MainMenu';
import { CampaignSelect } from './ui/CampaignSelect';
import { RosterView } from './ui/RosterView';
import { BattleHUD } from './ui/BattleHUD';
import { OverworldHUD } from './ui/OverworldHUD';
import { PauseModal, VictoryModal, DefeatModal } from './ui/Modals';
import { soundManager } from './utils/SoundManager';
import { resolveBodyDatasetState } from './ui/brand/BrandKit';

export default function App() {
  const [, setTick] = useState(0);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const overworldContainerRef = useRef<HTMLDivElement>(null);

  const forceUpdate = () => setTick(t => t + 1);
  const bodyState = resolveBodyDatasetState(game.state, game.isPaused);

  useEffect(() => {
    document.body.dataset.state = bodyState;
    if (bodyState === 'playing' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [bodyState]);

  useEffect(() => {
    game.setOnStateChange(forceUpdate);

    // Support ?autostart=1 to boot directly into Overworld (or ?autostart=battle for tactical battle)
    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart');
    if (autostart === 'battle' && game.state === 'menu') {
      game.startMission(0);
    } else if (autostart === '1' && game.state === 'menu') {
      game.startOverworld();
    }

    return () => {
      game.setOnStateChange(null);
    };
  }, []);

  // Isolated WebGL scene lifecycle when entering/leaving Overworld
  useEffect(() => {
    if (game.state === 'overworld' && overworldContainerRef.current) {
      game.initOverworldScene(overworldContainerRef.current);

      const handleResize = () => {
        if (game.overworldScene && overworldContainerRef.current) {
          game.overworldScene.resize(
            overworldContainerRef.current.clientWidth,
            overworldContainerRef.current.clientHeight
          );
        }
      };

      const observer = new ResizeObserver(handleResize);
      observer.observe(overworldContainerRef.current);
      window.addEventListener('resize', handleResize);

      return () => {
        observer.disconnect();
        window.removeEventListener('resize', handleResize);
        game.disposeOverworldScene();
      };
    }
  }, [game.state]);

  // Isolated WebGL scene lifecycle when entering/leaving battle
  useEffect(() => {
    if (game.state === 'battle' && canvasContainerRef.current) {
      game.initScene(canvasContainerRef.current);

      const handleResize = () => {
        if (game.sceneManager && canvasContainerRef.current) {
          game.sceneManager.resize(
            canvasContainerRef.current.clientWidth,
            canvasContainerRef.current.clientHeight
          );
        }
      };

      const observer = new ResizeObserver(handleResize);
      observer.observe(canvasContainerRef.current);
      window.addEventListener('resize', handleResize);

      return () => {
        observer.disconnect();
        window.removeEventListener('resize', handleResize);
        game.disposeScene();
      };
    }
  }, [game.state]);

  // Global keyboard controls (Battle & Overworld)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (game.state === 'overworld') {
        switch (e.key) {
          case '1':
            if (!game.isPaused) {
              soundManager.playClick();
              game.setOverworldMovetype('smallfoot');
              forceUpdate();
            }
            break;
          case '2':
            if (!game.isPaused) {
              soundManager.playClick();
              game.setOverworldMovetype('mounted');
              forceUpdate();
            }
            break;
          case '3':
            if (!game.isPaused) {
              soundManager.playClick();
              game.setOverworldMovetype('woodland');
              forceUpdate();
            }
            break;
          case 'ArrowUp':
          case 'w':
          case 'W':
            e.preventDefault();
            game.stepOverworldDirection(0, -1);
            break;
          case 'ArrowDown':
          case 's':
          case 'S':
            e.preventDefault();
            game.stepOverworldDirection(0, 1);
            break;
          case 'ArrowLeft':
          case 'a':
          case 'A':
            e.preventDefault();
            game.stepOverworldDirection(-1, 0);
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            e.preventDefault();
            game.stepOverworldDirection(1, 0);
            break;
          case 'Enter':
          case ' ':
            if (game.overworldManager?.pendingEncounter) {
              e.preventDefault();
              game.engagePendingEncounter();
            } else if (game.overworldManager?.pendingRuin) {
              e.preventDefault();
              const ruin = game.overworldManager.pendingRuin;
              const unlockedTarget = game.overworldManager.unlockedDungeonFloors.has(ruin.recommendedFloor)
                ? ruin.recommendedFloor
                : 1;
              game.enterDungeonFromRuin(unlockedTarget);
            } else if (game.overworldManager?.pendingTrap) {
              e.preventDefault();
              game.dismissPendingTrap();
            } else if (game.overworldManager?.pendingDungeonTreasure) {
              e.preventDefault();
              game.resolvePendingDungeonTreasure();
            } else if (game.overworldManager?.pendingDungeonAlly) {
              e.preventDefault();
              game.resolvePendingDungeonAlly();
            } else if (game.overworldManager?.pendingStairs) {
              e.preventDefault();
              if (game.overworldManager.pendingStairs.blockedByWardenName) {
                game.dismissPendingStairs();
              } else {
                game.confirmStairsTransition();
              }
            } else if (game.overworldManager?.pendingPoi) {
              e.preventDefault();
              game.resolvePendingPoi();
            } else if (game.overworldManager?.pendingWorldEvent) {
              e.preventDefault();
              const first = game.overworldManager.pendingWorldEvent.choices.find(
                c =>
                  !c.offer?.purchased &&
                  (!c.costGold || game.saveData.gold >= c.costGold) &&
                  (!c.costMp || (game.overworldManager?.currentMp ?? 0) >= c.costMp)
              );
              if (first) game.resolveWorldEventChoice(first.id);
              else game.dismissPendingWorldEvent();
            }
            break;
          case 'q':
          case 'Q':
            game.overworldScene?.rotateCamera(-Math.PI / 5);
            break;
          case 'e':
          case 'E':
            game.overworldScene?.rotateCamera(Math.PI / 5);
            break;
          case 'p':
          case 'P':
          case 'Escape':
            if (game.overworldManager?.pendingEncounter) {
              game.evadePendingEncounter();
            } else if (game.overworldManager?.pendingRuin) {
              game.dismissPendingRuin();
            } else if (game.overworldManager?.pendingTrap) {
              game.dismissPendingTrap();
            } else if (game.overworldManager?.pendingStairs) {
              game.dismissPendingStairs();
            } else if (game.overworldManager?.pendingWorldEvent) {
              game.dismissPendingWorldEvent();
            } else {
              game.togglePause();
            }
            break;
          case 'm':
          case 'M':
            soundManager.toggleSound();
            forceUpdate();
            break;
        }
        return;
      }

      if (game.state !== 'battle') return;

      const isPlayerActive = game.activeUnit?.faction === 'player' && !game.isPaused;
      if (isPlayerActive && game.phase === 'action_hub') {
        switch (e.key) {
          case '1':
            e.preventDefault();
            soundManager.playClick();
            if (!game.hasMovedThisTurn) game.enterMoveSelect();
            else if (!game.hasActedThisTurn) game.undoMove();
            forceUpdate();
            return;
          case 'u':
          case 'U':
            if (game.hasMovedThisTurn && !game.hasActedThisTurn) {
              e.preventDefault();
              soundManager.playClick();
              game.undoMove();
              forceUpdate();
            }
            return;
          case '2':
            if (!game.hasActedThisTurn && game.activeUnit) {
              e.preventDefault();
              soundManager.playClick();
              const atkId = game.activeUnit.jobId === 'tirador' ? 'aimed_shot' : 'slash';
              game.selectAbility(atkId);
              forceUpdate();
            }
            return;
          case '3':
            if (!game.hasActedThisTurn) {
              e.preventDefault();
              soundManager.playClick();
              game.enterActionSelect();
              forceUpdate();
            }
            return;
          case '4':
            if (!game.hasActedThisTurn && game.getBattleConsumables().length > 0) {
              e.preventDefault();
              soundManager.playClick();
              game.enterBagSelect();
              forceUpdate();
            }
            return;
          case '5':
            e.preventDefault();
            soundManager.playClick();
            game.enterFacingSelect();
            forceUpdate();
            return;
        }
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault();
          game.moveCursorBy(0, -1);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          game.moveCursorBy(0, 1);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          game.moveCursorBy(-1, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          game.moveCursorBy(1, 0);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          game.confirmCursorAction();
          break;
        case 'q':
        case 'Q':
          game.sceneManager?.rotateCamera(-Math.PI / 4);
          break;
        case 'e':
        case 'E':
          game.sceneManager?.rotateCamera(Math.PI / 4);
          break;
        case 'p':
        case 'P':
          game.togglePause();
          break;
        case 'm':
        case 'M':
          soundManager.toggleSound();
          forceUpdate();
          break;
        case 'Escape':
          if (
            game.phase === 'move_select' ||
            game.phase === 'action_select' ||
            game.phase === 'bag_select' ||
            game.phase === 'target_select'
          ) {
            game.cancelSubMenu();
          } else {
            game.togglePause();
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#090d16] select-none">
      {game.state === 'menu' && <MainMenu onUpdate={forceUpdate} />}
      {game.state === 'campaign_select' && <CampaignSelect onUpdate={forceUpdate} />}
      {game.state === 'roster' && <RosterView onUpdate={forceUpdate} />}

      {game.state === 'overworld' && (
        <div
          ref={overworldContainerRef}
          data-testid="overworld-canvas-container"
          className="absolute inset-0 w-full h-full cursor-pointer"
        />
      )}
      {game.state === 'overworld' && <OverworldHUD onUpdate={forceUpdate} />}
      {game.state === 'overworld' && game.isPaused && <PauseModal onUpdate={forceUpdate} />}

      {game.state === 'battle' && (
        <div
          ref={canvasContainerRef}
          data-testid="tactical-canvas-container"
          className="absolute inset-0 w-full h-full cursor-crosshair"
        />
      )}

      {game.state === 'battle' && <BattleHUD onUpdate={forceUpdate} />}
      {game.state === 'battle' && game.isPaused && <PauseModal onUpdate={forceUpdate} />}
      {game.state === 'victory' && <VictoryModal onUpdate={forceUpdate} />}
      {game.state === 'defeat' && <DefeatModal onUpdate={forceUpdate} />}
    </div>
  );
}

