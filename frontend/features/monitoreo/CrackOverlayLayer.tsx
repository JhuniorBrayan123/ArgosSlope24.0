'use client';

import React from 'react';
import { Layer, Rect, Text } from 'react-konva';

interface CrackData {
  id: string;
  length_mm: number;
  aperture_mm: number;
  family: string;
  bbox: { x: number; y: number; w: number; h: number };
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
        return (
          <React.Fragment key={crack.id}>
            <Rect
              x={crack.bbox.x * scaleX}
              y={crack.bbox.y * scaleY}
              width={crack.bbox.w * scaleX}
              height={crack.bbox.h * scaleY}
              stroke={color}
              strokeWidth={2}
            />
            <Text
              x={crack.bbox.x * scaleX}
              y={(crack.bbox.y * scaleY) - 15}
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
