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

export default function App() {
  const [, setTick] = useState(0);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const overworldContainerRef = useRef<HTMLDivElement>(null);

  const forceUpdate = () => setTick(t => t + 1);

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
          if (game.phase === 'move_select' || game.phase === 'action_select' || game.phase === 'target_select') {
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
    <div className="relative w-full h-screen overflow-hidden bg-[#0d1017] select-none">
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
