// remotion/src/scenes/DiagramScene.tsx
/**
 * Diagram scene — renders mathematical formulas, charts, and data visualizations.
 *
 * Sub-views based on diagramSpec.type:
 *   - math_formula: LaTeX rendering via react-katex
 *   - line_chart: SVG animated curve drawing
 *   - bar_chart: SVG animated bars growing up
 *   - scatter: SVG animated circles appearing
 *   - fallback: narration text centered (when no diagramSpec)
 *
 * All views use center_focus layout (constraint from Director).
 */

import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import "katex/dist/katex.min.css";
import { BlockMath } from "react-katex";
import type { SceneData, VideoProps } from "../schemas/videoProps";
import { fontFamily } from "../lib/fonts";
import { useExitAnimation } from "../lib/useExitAnimation";
import { AnimatedGradientBg } from "../components/AnimatedGradientBg";

interface DiagramSceneProps {
  scene: SceneData;
  colorPalette: VideoProps["colorPalette"];
  wordTimestamps?: { text: string; startMs: number; endMs: number }[];
}

type DiagramSpec = NonNullable<SceneData["diagramSpec"]>;
type DataPoint = { x: number | string; y: number; label?: string };

// ═════════════════════════════════════
// SVG Chart Constants
// ═════════════════════════════════════

const CHART = {
  WIDTH: 800,
  HEIGHT: 500,
  MARGIN: { top: 30, right: 40, bottom: 60, left: 70 },
} as const;

const PLOT = {
  width: CHART.WIDTH - CHART.MARGIN.left - CHART.MARGIN.right,
  height: CHART.HEIGHT - CHART.MARGIN.top - CHART.MARGIN.bottom,
} as const;

/**
 * Compute the maximum pixel width for an SVG chart so it never overflows
 * the video frame vertically when the chart starts at topOffset px from top.
 * Maintains the SVG's 800×500 aspect ratio.
 */
function _chartMaxWidth(vw: number, vh: number, topOffset: number): number {
  const bottomMargin = 80;
  const maxH = vh - topOffset - bottomMargin;
  const maxWByHeight = maxH * (CHART.WIDTH / CHART.HEIGHT);
  const containerW = (vw - 120) * 0.97;  // left:60 + right:60 + small safety margin
  return Math.round(Math.min(containerW, maxWByHeight));
}

// ═════════════════════════════════════
// Sub-view: Math Formula (KaTeX)
// ═════════════════════════════════════

const MathFormulaView: React.FC<{
  spec: DiagramSpec;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
}> = ({ spec, colorPalette, frame, fps }) => {
  const scaleProgress = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 0.8 },
  });

  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  const annotations = spec.annotations ?? [];

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 60px",
      }}
    >
      {/* LaTeX Formula */}
      <div
        style={{
          transform: `scale(${scaleProgress})`,
          opacity,
          fontSize: 48,
          color: colorPalette.text,
        }}
      >
        {spec.latex ? (
          <BlockMath
            math={spec.latex}
            errorColor={colorPalette.primary}
          />
        ) : (
          <span style={{ fontFamily, fontSize: 36, color: colorPalette.text }}>
            (No formula provided)
          </span>
        )}
      </div>

      {/* Annotations */}
      {annotations.length > 0 && (
        <div
          style={{
            marginTop: 60,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            opacity: interpolate(frame, [30, 50], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {annotations.map((note, i) => {
            const noteOpacity = interpolate(
              frame,
              [35 + i * 10, 45 + i * 10],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );
            return (
              <div
                key={i}
                style={{
                  fontFamily,
                  fontSize: 28,
                  color: `${colorPalette.text}CC`,
                  opacity: noteOpacity,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ color: colorPalette.primary, fontSize: 20 }}>
                  ●
                </span>
                {note}
              </div>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════
// Sub-view: Line Chart (SVG)
// ═════════════════════════════════════

/** Scale a value from [domainMin, domainMax] to [0, rangeSize] */
function scaleLinear(
  value: number,
  domainMin: number,
  domainMax: number,
  rangeSize: number,
): number {
  if (domainMax === domainMin) return rangeSize / 2;
  return ((value - domainMin) / (domainMax - domainMin)) * rangeSize;
}

/** Build a smooth SVG path from data points */
function buildPath(
  data: DataPoint[],
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
): string {
  const points = data
    .filter((d) => typeof d.x === "number")
    .sort((a, b) => (a.x as number) - (b.x as number))
    .map((d) => ({
      px: CHART.MARGIN.left + scaleLinear(d.x as number, xMin, xMax, PLOT.width),
      py: CHART.MARGIN.top + PLOT.height - scaleLinear(d.y, yMin, yMax, PLOT.height),
    }));

  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.px} ${p.py}`).join(" ");
}

const LineChartView: React.FC<{
  spec: DiagramSpec;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
}> = ({ spec, colorPalette, frame }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const chartMaxWidth = _chartMaxWidth(vw, vh, 280);
  const data = (spec.data ?? []) as DataPoint[];
  if (data.length === 0) return null;

  const xs = data.filter((d) => typeof d.x === "number").map((d) => d.x as number);
  const ys = data.map((d) => d.y);
  const xMin = spec.xRange?.[0] ?? Math.min(...xs);
  const xMax = spec.xRange?.[1] ?? Math.max(...xs);
  const yMin = Math.min(0, Math.min(...ys));
  const yMax = Math.max(...ys) * 1.15;

  const pathD = buildPath(data, xMin, xMax, yMin, yMax);
  const totalLength = 1200;

  // Animated line drawing
  const drawnLength = interpolate(frame, [15, 70], [0, totalLength], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Axis opacity
  const axisOpacity = interpolate(frame, [0, 15], [0, 0.5], {
    extrapolateRight: "clamp",
  });

  // Formula label
  const labelOpacity = interpolate(frame, [60, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Generate nice tick values
  const xTicks = Array.from({ length: 6 }, (_, i) =>
    xMin + ((xMax - xMin) * i) / 5,
  );
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    yMin + ((yMax - yMin) * i) / 4,
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 280,
        left: 60,
        right: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <svg
        viewBox={`0 0 ${CHART.WIDTH} ${CHART.HEIGHT}`}
        style={{ width: "100%", maxWidth: chartMaxWidth }}
      >
        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y = CHART.MARGIN.top + PLOT.height - scaleLinear(tick, yMin, yMax, PLOT.height);
          return (
            <line
              key={`grid-y-${i}`}
              x1={CHART.MARGIN.left}
              y1={y}
              x2={CHART.MARGIN.left + PLOT.width}
              y2={y}
              stroke={`${colorPalette.text}15`}
              strokeDasharray="4 6"
              opacity={axisOpacity}
            />
          );
        })}

        {/* X axis */}
        <line
          x1={CHART.MARGIN.left}
          y1={CHART.MARGIN.top + PLOT.height}
          x2={CHART.MARGIN.left + PLOT.width}
          y2={CHART.MARGIN.top + PLOT.height}
          stroke={colorPalette.text}
          strokeWidth={1.5}
          opacity={axisOpacity}
        />
        {/* Y axis */}
        <line
          x1={CHART.MARGIN.left}
          y1={CHART.MARGIN.top}
          x2={CHART.MARGIN.left}
          y2={CHART.MARGIN.top + PLOT.height}
          stroke={colorPalette.text}
          strokeWidth={1.5}
          opacity={axisOpacity}
        />

        {/* X tick labels */}
        {xTicks.map((tick, i) => (
          <text
            key={`x-${i}`}
            x={CHART.MARGIN.left + scaleLinear(tick, xMin, xMax, PLOT.width)}
            y={CHART.MARGIN.top + PLOT.height + 30}
            fill={colorPalette.text}
            fontSize={18}
            textAnchor="middle"
            opacity={axisOpacity}
            fontFamily={fontFamily}
          >
            {tick % 1 === 0 ? tick : tick.toFixed(1)}
          </text>
        ))}

        {/* Y tick labels */}
        {yTicks.map((tick, i) => (
          <text
            key={`y-${i}`}
            x={CHART.MARGIN.left - 15}
            y={CHART.MARGIN.top + PLOT.height - scaleLinear(tick, yMin, yMax, PLOT.height) + 5}
            fill={colorPalette.text}
            fontSize={18}
            textAnchor="end"
            opacity={axisOpacity}
            fontFamily={fontFamily}
          >
            {tick % 1 === 0 ? tick : tick.toFixed(1)}
          </text>
        ))}

        {/* Animated curve */}
        <path
          d={pathD}
          stroke={colorPalette.primary}
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLength}
          strokeDashoffset={totalLength - drawnLength}
        />

        {/* Data point dots (appear after line is drawn) */}
        {data
          .filter((d) => typeof d.x === "number" && d.label)
          .map((d, i) => {
            const px = CHART.MARGIN.left + scaleLinear(d.x as number, xMin, xMax, PLOT.width);
            const py = CHART.MARGIN.top + PLOT.height - scaleLinear(d.y, yMin, yMax, PLOT.height);
            const dotOpacity = interpolate(frame, [60 + i * 5, 68 + i * 5], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <g key={`dot-${i}`} opacity={dotOpacity}>
                <circle cx={px} cy={py} r={6} fill={colorPalette.primary} />
                <text
                  x={px + 10}
                  y={py - 12}
                  fill={colorPalette.text}
                  fontSize={16}
                  fontFamily={fontFamily}
                >
                  {d.label}
                </text>
              </g>
            );
          })}
      </svg>

      {/* Formula label below chart */}
      {spec.latex && (
        <div
          style={{
            marginTop: 24,
            opacity: labelOpacity,
            fontSize: 32,
            color: colorPalette.text,
          }}
        >
          <BlockMath math={spec.latex} errorColor={colorPalette.primary} />
        </div>
      )}
    </div>
  );
};

// ═════════════════════════════════════
// Sub-view: Bar Chart (SVG)
// ═════════════════════════════════════

const BarChartView: React.FC<{
  spec: DiagramSpec;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
}> = ({ spec, colorPalette, frame, fps }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const chartMaxWidth = _chartMaxWidth(vw, vh, 300);
  const data = (spec.data ?? []) as DataPoint[];
  if (data.length === 0) return null;

  const maxY = Math.max(...data.map((d) => d.y)) * 1.15;
  const barWidth = Math.min(80, PLOT.width / data.length - 20);
  const totalBarsWidth = data.length * (barWidth + 20) - 20;
  const startX = CHART.MARGIN.left + (PLOT.width - totalBarsWidth) / 2;

  // Axis opacity
  const axisOpacity = interpolate(frame, [0, 15], [0, 0.5], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 300,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox={`0 0 ${CHART.WIDTH} ${CHART.HEIGHT}`}
        style={{ width: "100%", maxWidth: chartMaxWidth }}
      >
        {/* X axis */}
        <line
          x1={CHART.MARGIN.left}
          y1={CHART.MARGIN.top + PLOT.height}
          x2={CHART.MARGIN.left + PLOT.width}
          y2={CHART.MARGIN.top + PLOT.height}
          stroke={colorPalette.text}
          strokeWidth={1.5}
          opacity={axisOpacity}
        />

        {/* Bars */}
        {data.map((d, i) => {
          const delay = 10 + i * 8;
          const growProgress = spring({
            frame: Math.max(0, frame - delay),
            fps,
            config: { damping: 18, stiffness: 80, mass: 0.6 },
          });

          const barHeight = scaleLinear(d.y, 0, maxY, PLOT.height) * growProgress;
          const x = startX + i * (barWidth + 20);
          const y = CHART.MARGIN.top + PLOT.height - barHeight;
          const color = i % 2 === 0 ? colorPalette.primary : colorPalette.secondary;

          const labelOpacity = interpolate(
            frame,
            [delay + 15, delay + 25],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          );

          return (
            <g key={i}>
              {/* Bar */}
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                fill={color}
                rx={6}
              />
              {/* Value label on top */}
              <text
                x={x + barWidth / 2}
                y={y - 10}
                fill={colorPalette.text}
                fontSize={20}
                fontWeight={700}
                textAnchor="middle"
                fontFamily={fontFamily}
                opacity={labelOpacity}
              >
                {typeof d.y === "number" && d.y % 1 === 0
                  ? d.y
                  : d.y.toFixed(1)}
              </text>
              {/* X label below bar */}
              <text
                x={x + barWidth / 2}
                y={CHART.MARGIN.top + PLOT.height + 30}
                fill={colorPalette.text}
                fontSize={18}
                textAnchor="middle"
                fontFamily={fontFamily}
                opacity={axisOpacity}
              >
                {d.label ?? String(d.x)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ═════════════════════════════════════
// Sub-view: Scatter Plot (SVG)
// ═════════════════════════════════════

const ScatterView: React.FC<{
  spec: DiagramSpec;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
  fps: number;
}> = ({ spec, colorPalette, frame, fps }) => {
  const { width: vw, height: vh } = useVideoConfig();
  const chartMaxWidth = _chartMaxWidth(vw, vh, 300);
  const data = (spec.data ?? []) as DataPoint[];
  if (data.length === 0) return null;

  const xs = data.filter((d) => typeof d.x === "number").map((d) => d.x as number);
  const ys = data.map((d) => d.y);
  const xMin = spec.xRange?.[0] ?? Math.min(...xs);
  const xMax = spec.xRange?.[1] ?? Math.max(...xs);
  const yMin = Math.min(0, Math.min(...ys));
  const yMax = Math.max(...ys) * 1.15;

  // Axis opacity
  const axisOpacity = interpolate(frame, [0, 15], [0, 0.5], {
    extrapolateRight: "clamp",
  });

  // Color by label groups
  const labels = [...new Set(data.map((d) => d.label).filter(Boolean))];
  const colors = [colorPalette.primary, colorPalette.secondary, "#10B981", "#F59E0B"];

  return (
    <div
      style={{
        position: "absolute",
        top: 300,
        left: 60,
        right: 60,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox={`0 0 ${CHART.WIDTH} ${CHART.HEIGHT}`}
        style={{ width: "100%", maxWidth: chartMaxWidth }}
      >
        {/* Axes */}
        <line
          x1={CHART.MARGIN.left}
          y1={CHART.MARGIN.top + PLOT.height}
          x2={CHART.MARGIN.left + PLOT.width}
          y2={CHART.MARGIN.top + PLOT.height}
          stroke={colorPalette.text}
          strokeWidth={1.5}
          opacity={axisOpacity}
        />
        <line
          x1={CHART.MARGIN.left}
          y1={CHART.MARGIN.top}
          x2={CHART.MARGIN.left}
          y2={CHART.MARGIN.top + PLOT.height}
          stroke={colorPalette.text}
          strokeWidth={1.5}
          opacity={axisOpacity}
        />

        {/* Data points */}
        {data
          .filter((d) => typeof d.x === "number")
          .map((d, i) => {
            const delay = 10 + i * 5;
            const scaleVal = spring({
              frame: Math.max(0, frame - delay),
              fps,
              config: { damping: 18, stiffness: 120, mass: 0.4 },
            });

            const px = CHART.MARGIN.left + scaleLinear(d.x as number, xMin, xMax, PLOT.width);
            const py = CHART.MARGIN.top + PLOT.height - scaleLinear(d.y, yMin, yMax, PLOT.height);

            // Color by label group
            const labelIdx = d.label ? labels.indexOf(d.label) : 0;
            const dotColor = colors[labelIdx % colors.length];

            return (
              <g key={i} transform={`translate(${px}, ${py}) scale(${scaleVal})`}>
                <circle cx={0} cy={0} r={8} fill={dotColor} opacity={0.85} />
                {d.label && (
                  <text
                    x={12}
                    y={5}
                    fill={colorPalette.text}
                    fontSize={14}
                    fontFamily={fontFamily}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
      </svg>
    </div>
  );
};

// ═════════════════════════════════════
// Sub-view: Fallback (text only)
// ═════════════════════════════════════

const FallbackView: React.FC<{
  narration: string;
  colorPalette: VideoProps["colorPalette"];
  frame: number;
}> = ({ narration, colorPalette, frame }) => {
  const opacity = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "0 80px",
        opacity,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 48,
          fontWeight: 700,
          color: colorPalette.text,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        {narration}
      </span>
    </AbsoluteFill>
  );
};

// ═════════════════════════════════════
// Main Component
// ═════════════════════════════════════

export const DiagramScene: React.FC<DiagramSceneProps> = ({
  scene,
  colorPalette,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const exitOpacity = useExitAnimation();

  const spec = scene.diagramSpec;

  // Header animation
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        opacity: exitOpacity,
      }}
    >
      {/* Animated background */}
      <AnimatedGradientBg
        colorPalette={colorPalette}
        intensity="subtle"
        withParticles={true}
        particleDensity={8}
      />

      {/* Header */}
      <div
        style={{
          position: "absolute",
          top: Math.round(height * 0.06),
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headerOpacity,
          padding: "0 60px",
          zIndex: 10,
        }}
      >
        <h2
          style={{
            fontFamily,
            fontSize: Math.max(30, Math.round(width * 0.038)),
            fontWeight: 800,
            color: colorPalette.text,
            margin: 0,
            lineHeight: 1.3,
            maxHeight: 100,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            textShadow: "0 2px 12px rgba(0,0,0,0.4)",
          }}
        >
          {scene.visualDescription}
        </h2>
      </div>

      {/* Diagram content — type switch */}
      {!spec ? (
        <FallbackView
          narration={scene.narration}
          colorPalette={colorPalette}
          frame={frame}
        />
      ) : spec.type === "math_formula" ? (
        <MathFormulaView
          spec={spec}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
        />
      ) : spec.type === "line_chart" ? (
        <LineChartView
          spec={spec}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
        />
      ) : spec.type === "bar_chart" ? (
        <BarChartView
          spec={spec}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
        />
      ) : spec.type === "scatter" ? (
        <ScatterView
          spec={spec}
          colorPalette={colorPalette}
          frame={frame}
          fps={fps}
        />
      ) : (
        <FallbackView
          narration={scene.narration}
          colorPalette={colorPalette}
          frame={frame}
        />
      )}
    </AbsoluteFill>
  );
};
