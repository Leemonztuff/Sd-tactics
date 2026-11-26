import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  createRiggedModelInstance,
  CustomRigController,
  CustomMaterialMode
} from '../rendering/CustomModelRig';
import {
  Play,
  Swords,
  Footprints,
  Flame,
  Bone,
  Palette,
  RotateCcw,
  Gauge,
  X,
  Crosshair,
  Shield
} from 'lucide-react';
import { game } from '../game/Game';
import { soundManager } from '../utils/SoundManager';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onEnterBattle?: () => void;
}

export const ModelViewerModal: React.FC<Props> = ({ isOpen, onClose, onEnterBattle }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAnim, setActiveAnim] = useState<'idle' | 'attack' | 'walk' | 'hit'>('idle');
  const [materialMode, setMaterialMode] = useState<CustomMaterialMode>('toon');
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showWeapons, setShowWeapons] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const rigRef = useRef<CustomRigController | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    let disposed = false;
    let animId = 0;
    const container = containerRef.current;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 400;

    // 1. Scene & Lighting
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1320);

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(0, 0.95, 3.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.replaceChildren(renderer.domElement);

    // Grid platform with circular arena
    const groundGeo = new THREE.CircleGeometry(1.4, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1b2333,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.005;
    ground.receiveShadow = true;
    scene.add(ground);

    const ringGeo = new THREE.RingGeometry(1.36, 1.40, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xd89b32, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.001;
    scene.add(ring);

    // Lighting rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.2);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.2);
    sunLight.position.set(3, 5, 4);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
    rimLight.position.set(-3, 2, -3);
    scene.add(rimLight);

    // Orbit & Pan state
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = { radius: 3.6, theta: 0.15, phi: Math.PI / 2.35 };
    const lookTarget = new THREE.Vector3(0, 0.48, 0);

    const updateCameraPos = () => {
      camera.position.x = lookTarget.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = lookTarget.y + spherical.radius * Math.cos(spherical.phi);
      camera.position.z = lookTarget.z + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.lookAt(lookTarget);
    };
    updateCameraPos();

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      isDragging = true;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      prevMouseX = clientX;
      prevMouseY = clientY;
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - prevMouseX;
      const dy = clientY - prevMouseY;
      prevMouseX = clientX;
      prevMouseY = clientY;

      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.15, Math.min(Math.PI / 2 - 0.05, spherical.phi - dy * 0.008));
      updateCameraPos();
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(1.2, Math.min(5.5, spherical.radius + e.deltaY * 0.003));
      updateCameraPos();
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    domEl.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);
    domEl.addEventListener('wheel', onWheel, { passive: false });

    // 2. Load and Instantiate Rigged Model
    setLoading(true);
    setError(null);

    createRiggedModelInstance(true, true)
      .then(rig => {
        if (disposed) {
          rig.dispose();
          return;
        }
        rigRef.current = rig;
        rig.setSpeed(playbackSpeed);
        rig.setMaterialMode(materialMode);
        rig.setSkeletonVisible(showSkeleton);
        scene.add(rig.group);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error creating rigged model instance:', err);
        setError('No se pudo cargar el modelo 3D. Verifica que exista /models/model01.glb');
        setLoading(false);
      });

    // 3. Render loop with delta timing
    const clock = new THREE.Clock();
    const animate = () => {
      if (disposed) return;
      animId = requestAnimationFrame(animate);
      const dt = clock.getDelta();

      if (rigRef.current) {
        rigRef.current.update(dt);
      }

      renderer.render(scene, camera);
    };
    animate();

    // 4. Resize observer
    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      domEl.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      domEl.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
      domEl.removeEventListener('wheel', onWheel);

      if (rigRef.current) {
        rigRef.current.dispose();
        rigRef.current = null;
      }
      groundGeo.dispose();
      groundMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
    };
  }, [isOpen]);

  const handlePlayAnim = (anim: 'idle' | 'attack' | 'walk' | 'hit') => {
    soundManager.playClick();
    setActiveAnim(anim);
    if (!rigRef.current) return;
    if (anim === 'idle') rigRef.current.playIdle(0.15);
    else if (anim === 'attack') {
      rigRef.current.playAttack(() => {
        setActiveAnim('idle');
      }, 0.1);
    } else if (anim === 'walk') rigRef.current.playWalk(0.15);
    else if (anim === 'hit') {
      rigRef.current.playHit(0.08);
      setTimeout(() => setActiveAnim('idle'), 400);
    }
  };

  const handleToggleMaterial = () => {
    soundManager.playClick();
    const nextMode: CustomMaterialMode = materialMode === 'toon' ? 'textured' : 'toon';
    setMaterialMode(nextMode);
    rigRef.current?.setMaterialMode(nextMode);
  };

  const handleToggleSkeleton = () => {
    soundManager.playClick();
    const nextVal = !showSkeleton;
    setShowSkeleton(nextVal);
    rigRef.current?.setSkeletonVisible(nextVal);
  };

  const handleToggleWeapons = () => {
    soundManager.playClick();
    const nextVal = !showWeapons;
    setShowWeapons(nextVal);
    rigRef.current?.setWeaponsVisible(nextVal);
  };

  const handleSetSpeed = (speed: number) => {
    soundManager.playClick();
    setPlaybackSpeed(speed);
    rigRef.current?.setSpeed(speed);
  };

  const handleResetCamera = () => {
    soundManager.playClick();
    // Handled by re-triggering effect or resetting
  };

  const handleTestInBattle = () => {
    soundManager.playClick();
    onClose();
    if (onEnterBattle) {
      onEnterBattle();
    } else {
      if (game.state !== 'battle') {
        game.startMission(0);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#04060abf] backdrop-blur-md">
      <div className="relative w-full max-w-4xl h-[92vh] max-h-[820px] bg-[#090d16] border-2 border-[#d89b32] shadow-[0_12px_48px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden rounded-md text-[#f6eedb]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#222e44] bg-[#0e1422]">
          <div className="flex items-center gap-2.5">
            <Crosshair className="text-[#f3cf7a]" size={20} />
            <div>
              <h2 className="font-display font-extrabold text-sm sm:text-base text-[#f6eedb] tracking-wider uppercase">
                Visor y Rig 3D · Modelo de Batalla Táctica
              </h2>
              <p className="text-[11px] text-[#8a99b3] leading-none mt-0.5">
                model01.glb · Rig Esquelético (13 Huesos) · Animaciones Idle &amp; Ataque AAA
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-8 h-8 flex items-center justify-center rounded bg-[#162032] hover:bg-[#223048] text-[#cbd5e1] hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main 3D Viewport Area */}
        <div className="relative flex-1 w-full min-h-0 bg-[#070a12] overflow-hidden">
          <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing select-none" />

          {/* Loading Indicator */}
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#090d16]/80 backdrop-blur-sm z-20">
              <div className="w-10 h-10 border-4 border-[#3b82f6] border-t-[#f3cf7a] rounded-full animate-spin mb-3" />
              <p className="font-display font-bold text-sm text-[#f6eedb]">
                Cargando y Riggeando model01.glb...
              </p>
              <p className="text-xs text-[#8a99b3] mt-1">
                Calculando pesos de piel y vinculando esqueleto de 13 huesos
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#090d16]/90 p-6 z-20 text-center">
              <p className="font-display font-bold text-base text-rose-400 mb-2">{error}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 valen-btn-steel valen-bevel font-bold text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          )}

          {/* Top-Right Overlay Toggles */}
          <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
            <button
              type="button"
              onClick={handleToggleMaterial}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel transition-all cursor-pointer ${
                materialMode === 'toon'
                  ? 'bg-[#1e3a8a] text-sky-200 border border-sky-400/50'
                  : 'bg-[#1b2333] text-[#cbd5e1] border border-slate-700'
              }`}
              title="Alternar entre Sombreado Toon Brawl Stars y Textura PBR Original"
            >
              <Palette size={14} />
              <span>{materialMode === 'toon' ? 'Toon Brawl Stars' : 'Textura Original'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleSkeleton}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel transition-all cursor-pointer ${
                showSkeleton
                  ? 'bg-amber-600 text-amber-100 border border-amber-300/60'
                  : 'bg-[#1b2333] text-[#cbd5e1] border border-slate-700'
              }`}
              title="Mostrar u ocultar los huesos del rig (SkeletonHelper)"
            >
              <Bone size={14} />
              <span>{showSkeleton ? 'Ocultar Rig' : 'Ver Huesos / Rig'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleWeapons}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold valen-bevel transition-all cursor-pointer ${
                showWeapons
                  ? 'bg-[#1e293b] text-[#f3cf7a] border border-[#d89b32]/50'
                  : 'bg-[#1b2333] text-[#8a99b3] border border-slate-700'
              }`}
              title="Equipar u ocultar espada y escudo tácticos"
            >
              <Shield size={14} />
              <span>{showWeapons ? 'Con Armas' : 'Sin Armas (Puro)'}</span>
            </button>
          </div>

          {/* Camera Interaction Hint */}
          <div className="absolute bottom-3 left-3 bg-[#090d16]/75 px-2.5 py-1 rounded text-[11px] text-[#8a99b3] pointer-events-none select-none border border-slate-800">
            🖱 Arrastra para girar · Rueda o pellizca para zoom
          </div>
        </div>

        {/* Bottom Control Deck */}
        <div className="p-3 sm:p-4 bg-[#0c121e] border-t border-[#222e44] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Animation Triggers */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-bold text-[#8a99b3] uppercase tracking-wider mr-1 hidden sm:inline">
              Animación:
            </span>

            <button
              type="button"
              onClick={() => handlePlayAnim('idle')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'idle'
                  ? 'bg-[#2563eb] text-white shadow-[0_0_12px_rgba(37,99,235,0.6)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Play size={14} />
              <span>Idle (Respiración)</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlayAnim('attack')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'attack'
                  ? 'bg-[#dc2626] text-white shadow-[0_0_14px_rgba(220,38,38,0.7)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Swords size={14} />
              <span>Ataque (Estocada)</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlayAnim('walk')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'walk'
                  ? 'bg-[#059669] text-white shadow-[0_0_12px_rgba(5,150,105,0.6)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Footprints size={14} />
              <span>Caminar</span>
            </button>

            <button
              type="button"
              onClick={() => handlePlayAnim('hit')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded text-xs font-bold transition-all cursor-pointer ${
                activeAnim === 'hit'
                  ? 'bg-[#ea580c] text-white shadow-[0_0_12px_rgba(234,88,12,0.6)]'
                  : 'bg-[#162032] text-[#cbd5e1] hover:bg-[#1e293b]'
              }`}
            >
              <Flame size={14} />
              <span>Impacto</span>
            </button>
          </div>

          {/* Speed & Direct Battle Deploy */}
          <div className="flex items-center justify-between sm:justify-end gap-2.5">
            {/* Speed Selector */}
            <div className="flex items-center gap-1 bg-[#162032] p-1 rounded border border-slate-800">
              <Gauge size={13} className="text-[#8a99b3] ml-1" />
              {[0.5, 1.0, 1.5].map(spd => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => handleSetSpeed(spd)}
                  className={`px-2 py-1 rounded text-[11px] font-mono-num font-bold transition-colors cursor-pointer ${
                    playbackSpeed === spd
                      ? 'bg-[#d89b32] text-[#090d16]'
                      : 'text-[#8a99b3] hover:text-[#f6eedb]'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>

            {/* Test in Tactical Battle Button */}
            <button
              type="button"
              onClick={handleTestInBattle}
              className="flex items-center gap-2 px-4 py-2 valen-btn-gold valen-bevel font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              <Swords size={15} />
              <span>Jugar en Batalla Táctica</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
