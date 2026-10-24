import { useEffect, useState, type ReactNode } from 'react';

export const STAGE_WIDTH = 1440;
export const STAGE_HEIGHT = 1000;

function fitScale(height: number): number {
  return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / height);
}

/** Fixed-size design canvas (1440 wide, 1000 tall unless the screen says otherwise), scaled to fit the window. */
export function Stage({ height = STAGE_HEIGHT, children }: { height?: number; children: ReactNode }) {
  const [scale, setScale] = useState(() => fitScale(height));

  useEffect(() => {
    const onResize = () => setScale(fitScale(height));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [height]);

  return (
    <div className="flex h-full w-full items-center justify-center overflow-hidden bg-night">
      <div style={{ width: STAGE_WIDTH * scale, height: height * scale }}>
        <div
          className="relative origin-top-left overflow-hidden bg-night"
          style={{ width: STAGE_WIDTH, height, transform: `scale(${scale})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
