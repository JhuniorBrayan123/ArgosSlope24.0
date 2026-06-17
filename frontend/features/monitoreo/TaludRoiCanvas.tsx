'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import CrackOverlayLayer from './CrackOverlayLayer';

interface TaludRoiCanvasProps {
  cracks?: any[];
  roiConfig?: { x: number; y: number; w: number; h: number };
  onRoiChange?: (roi: { x: number; y: number; w: number; h: number }) => void;
  width?: number;
  height?: number;
  // Desplazamiento si el ROI analizado difiere del Canvas global
  roiOffset?: { x: number; y: number }; 
}

export default function TaludRoiCanvas({
  cracks = [],
  roiConfig,
  onRoiChange,
  width = 640,
  height = 480,
  roiOffset = { x: 0, y: 0 }
}: TaludRoiCanvasProps) {
  const [roi, setRoi] = useState(roiConfig || { x: 50, y: 50, w: 200, h: 200 });
  const [isSelected, setIsSelected] = useState(false);
  
  const trRef = useRef<any>(null);
  const roiRef = useRef<any>(null);

  useEffect(() => {
    if (roiConfig) {
      setRoi(roiConfig);
    }
  }, [roiConfig]);

  useEffect(() => {
    if (isSelected && trRef.current && roiRef.current) {
      trRef.current.nodes([roiRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  const handleRoiDragEnd = (e: any) => {
    const newRoi = {
      ...roi,
      x: e.target.x(),
      y: e.target.y()
    };
    setRoi(newRoi);
    onRoiChange?.(newRoi);
  };

  const handleRoiTransformEnd = (e: any) => {
    const node = roiRef.current;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    node.scaleX(1);
    node.scaleY(1);

    const newRoi = {
      x: node.x(),
      y: node.y(),
      w: Math.max(5, node.width() * scaleX),
      h: Math.max(5, node.height() * scaleY)
    };
    
    setRoi(newRoi);
    onRoiChange?.(newRoi);
  };

  return (
    <div className="absolute inset-0 pointer-events-auto">
      <Stage 
        width={width} 
        height={height} 
        onMouseDown={(e) => {
          const clickedOnEmpty = e.target === e.target.getStage();
          if (clickedOnEmpty) setIsSelected(false);
        }}
      >
        {/* Renderizamos las fisuras si las hay */}
        {cracks.length > 0 && (
           <CrackOverlayLayer cracks={cracks} />
        )}
        
        <Layer>
          {onRoiChange && (
            <>
              <Rect
                ref={roiRef}
                x={roi.x}
                y={roi.y}
                width={roi.w}
                height={roi.h}
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[5, 5]}
                draggable
                onClick={() => setIsSelected(true)}
                onTap={() => setIsSelected(true)}
                onDragEnd={handleRoiDragEnd}
                onTransformEnd={handleRoiTransformEnd}
              />
              {isSelected && (
                <Transformer
                  ref={trRef}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (newBox.width < 10 || newBox.height < 10) return oldBox;
                    return newBox;
                  }}
                />
              )}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
}
