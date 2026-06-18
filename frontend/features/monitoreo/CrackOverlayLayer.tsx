'use client';

import React from 'react';
import { Layer, Rect, Text } from 'react-konva';

interface CrackData {
  id: string;
  length_mm: number;
  aperture_mm?: number;
  family: string;
  bbox?: { x: number; y: number; w: number; h: number };
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface CrackOverlayLayerProps {
  cracks: CrackData[];
  scaleX?: number;
  scaleY?: number;
}

const FAMILY_COLORS: Record<string, string> = {
  F1: 'red',
  F2: '#00ff00', // lime green
  F3: 'blue',
  Unknown: 'yellow'
};

export default function CrackOverlayLayer({ cracks, scaleX = 1, scaleY = 1 }: CrackOverlayLayerProps) {
  return (
    <Layer>
      {cracks.map((crack) => {
        const color = FAMILY_COLORS[crack.family] || 'white';
        // Soporta formato {bbox} y {x,y,width,height} directo
        const bx = crack.bbox?.x ?? crack.x ?? 0;
        const by = crack.bbox?.y ?? crack.y ?? 0;
        const bw = crack.bbox?.w ?? crack.width ?? 10;
        const bh = crack.bbox?.h ?? crack.height ?? 10;
        return (
          <React.Fragment key={crack.id}>
            <Rect
              x={bx * scaleX}
              y={by * scaleY}
              width={bw * scaleX}
              height={bh * scaleY}
              stroke={color}
              strokeWidth={2}
            />
            <Text
              x={bx * scaleX}
              y={(by * scaleY) - 15}
              text={`${crack.id} (${crack.family})`}
              fontSize={12}
              fill={color}
            />
          </React.Fragment>
        );
      })}
    </Layer>
  );
}
