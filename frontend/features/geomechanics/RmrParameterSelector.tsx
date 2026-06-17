'use client';

import React from 'react';
import { RmrCatalogOption } from '@/services/geomechanicsService';

interface Props {
  title: string;
  options: RmrCatalogOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
  isAuto?: boolean;
}

export default function RmrParameterSelector({ title, options, selectedCode, onSelect, isAuto = false }: Props) {
  return (
    <div className="flex flex-col gap-1 w-full">
      <div className="flex justify-between items-center">
        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {title}
        </label>
        {isAuto && (
          <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-800/50 px-1.5 py-0.5 rounded">
            Auto
          </span>
        )}
      </div>
      <div className="relative">
        <select
          value={selectedCode}
          onChange={(e) => onSelect(e.target.value)}
          className={`w-full p-2 border rounded appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-200 
            ${isAuto ? 'border-green-400 dark:border-green-600' : 'border-gray-300 dark:border-gray-600'}`}
        >
          <option value="" disabled>Seleccione una opción...</option>
          {options.map((opt) => {
            const scoreFormatted = opt.score > 0 ? `+${opt.score}` : `${opt.score}`;
            return (
              <option key={opt.code} value={opt.code}>
                {opt.label} ({scoreFormatted})
              </option>
            );
          })}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700 dark:text-gray-300">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
