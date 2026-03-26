import { memo, useEffect, useRef } from 'react';
import L from 'leaflet';
import { usePlayerLayerStore } from '../../../stores/playerLayerStore';

export interface RadarSweepLayerProps {
  map: L.Map;
  isActive: boolean;
}

// 4 RPM = one revolution every 15 seconds
const DEG_PER_SEC = (4 / 60) * 360;
const TRAIL_ARC_DEG = 120;
const SCAN_RADIUS_METERS = 600;
const TARGET_FRAME_MS = 1000 / 30; // 30 fps cap
const RADAR_PANE = 'game-map-radar-pane';
const GLOW_RADIUS_PX = 20;
const FLARE_DECAY_S = 2.0;

// Phosphor cyan palette (Hals spec)
const ARM_COLOR = 'rgba(0, 243, 255, 0.90)';
const ARM_BLOOM_COLOR = 'rgba(0, 243, 255, 0.30)';
const TAIL_START_COLOR = 'rgba(0, 243, 255, 0.55)';
const TAIL_END_COLOR = 'rgba(0, 243, 255, 0.00)';
const RING_COLOR = 'rgba(120, 190, 255, 0.18)';

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Pixel radius for SCAN_RADIUS_METERS at the current zoom, using layerPoint distance. */
function computeRadiusPx(map: L.Map, lat: number, lng: number): number {
  const origin = map.latLngToLayerPoint(L.latLng(lat, lng));
  const edgeLat = lat + SCAN_RADIUS_METERS / 111_320;
  const edge = map.latLngToLayerPoint(L.latLng(edgeLat, lng));
  return Math.max(40, origin.distanceTo(edge));
}

function RadarSweepLayerComponent({ map, isActive }: RadarSweepLayerProps) {
  const currentLocation = usePlayerLayerStore((state) => state.currentLocation);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const sweepDegRef = useRef<number>(0);
  const prevFrameTimeRef = useRef<number | null>(null);
  const lastNorthPassRef = useRef<number>(0);

  const shouldRender = isActive && currentLocation != null;

  useEffect(() => {
    if (!shouldRender || !currentLocation) return;

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mql.matches) return;

    const handleMotionPrefChange = (): void => {
      if (mql.matches && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        const cvs = canvasRef.current;
        if (cvs) cvs.getContext('2d')?.clearRect(0, 0, cvs.width, cvs.height);
      }
    };
    mql.addEventListener('change', handleMotionPrefChange);

    const pane = map.getPane(RADAR_PANE) ?? map.getPane('overlayPane');
    if (!pane) {
      mql.removeEventListener('change', handleMotionPrefChange);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    pane.appendChild(canvas);
    canvasRef.current = canvas;

    function resizeCanvas(): void {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const size = map.getSize();
      cvs.width = size.x * dpr;
      cvs.height = size.y * dpr;
      cvs.style.width = `${size.x}px`;
      cvs.style.height = `${size.y}px`;
    }

    resizeCanvas();
    map.on('resize zoomend moveend viewreset rotate', resizeCanvas);

    const { lat: playerLat, lng: playerLng } = currentLocation;

    function drawFrame(now: number): void {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      if (!ctx) return;

      // Advance sweep angle by deltaTime
      const dt = prevFrameTimeRef.current === null ? 0 : (now - prevFrameTimeRef.current) / 1000;
      prevFrameTimeRef.current = now;

      const prevDeg = sweepDegRef.current;
      const nextDeg = (prevDeg + DEG_PER_SEC * dt) % 360;
      // Detect north crossing (wrap-around)
      if (prevDeg + DEG_PER_SEC * dt >= 360) {
        lastNorthPassRef.current = now;
      }
      sweepDegRef.current = nextDeg;

      // Canvas sweep angle: north = -π/2 (canvas 0° = east, clockwise positive)
      const sweepRad = toRad(nextDeg - 90);
      const trailStartRad = toRad(nextDeg - 90 - TRAIL_ARC_DEG);

      // CSS pixel dimensions (canvas is DPR-scaled)
      const cssW = cvs.width / dpr;
      const cssH = cvs.height / dpr;

      // Player center in layer-space canvas coordinates.
      // The canvas lives inside rotatePane, so it's in pre-rotation layer space.
      // latLngToContainerPoint returns post-rotation screen coords (double-applies rotation);
      // latLngToLayerPoint minus getPixelOrigin gives the correct pre-rotation canvas position.
      const lp = map.latLngToLayerPoint(L.latLng(playerLat, playerLng));
      const pixelOrigin = map.getPixelOrigin();
      const cx = lp.x - pixelOrigin.x;
      const cy = lp.y - pixelOrigin.y;

      const radiusPx = computeRadiusPx(map, playerLat, playerLng);

      // Reset DPR transform and clear
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Skip drawing if well off-screen
      if (cx < -radiusPx - 50 || cx > cssW + radiusPx + 50
          || cy < -radiusPx - 50 || cy > cssH + radiusPx + 50) {
        return;
      }

      // 2. Outer reference ring — source-over (subtle, no glow)
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
      ctx.strokeStyle = RING_COLOR;
      ctx.lineWidth = 1;
      ctx.stroke();

      // 3. Comet tail — radial gradient wedge fill (screen)
      ctx.globalCompositeOperation = 'screen';
      const tailGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radiusPx);
      tailGrad.addColorStop(0, TAIL_START_COLOR);
      tailGrad.addColorStop(1, TAIL_END_COLOR);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radiusPx, trailStartRad, sweepRad);
      ctx.closePath();
      ctx.fillStyle = tailGrad;
      ctx.fill();

      // 4. Sweep arm (screen)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radiusPx * Math.cos(sweepRad), cy + radiusPx * Math.sin(sweepRad));
      ctx.strokeStyle = ARM_COLOR;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 5. Arm bloom — wide stroke (screen)
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radiusPx * Math.cos(sweepRad), cy + radiusPx * Math.sin(sweepRad));
      ctx.strokeStyle = ARM_BLOOM_COLOR;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.stroke();

      // 6. Origin glow — breathes, flares on north crossing (screen)
      const timeSinceNorth = (now - lastNorthPassRef.current) / 1000;
      const flareT = Math.max(0, 1 - timeSinceNorth / FLARE_DECAY_S);
      const glowAlpha = 0.35 + (0.75 - 0.35) * flareT;
      const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, GLOW_RADIUS_PX);
      glowGrad.addColorStop(0, `rgba(0, 255, 170, ${glowAlpha.toFixed(3)})`);
      glowGrad.addColorStop(1, 'rgba(0, 255, 170, 0.00)');
      ctx.beginPath();
      ctx.arc(cx, cy, GLOW_RADIUS_PX, 0, Math.PI * 2);
      ctx.fillStyle = glowGrad;
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
    }

    function tick(now: DOMHighResTimeStamp): void {
      rafRef.current = requestAnimationFrame(tick);
      if (now - lastFrameTimeRef.current < TARGET_FRAME_MS) return;
      lastFrameTimeRef.current = now;
      drawFrame(now);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      prevFrameTimeRef.current = null;
      map.off('resize zoomend moveend viewreset rotate', resizeCanvas);
      mql.removeEventListener('change', handleMotionPrefChange);
      canvas.remove();
      canvasRef.current = null;
    };
  }, [shouldRender, map, currentLocation]);

  return null;
}

export const RadarSweepLayer = memo(RadarSweepLayerComponent);
