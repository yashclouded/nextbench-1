/**
 * Segmented progress bars at the top of the viewer — one segment per story in the current
 * author's set. Segments before the active one are full, the active one reflects live
 * progress (0..1), the rest are empty. Purely presentational and cheap to re-render.
 */
interface Props {
  count: number;
  activeIndex: number;
  activeProgress: number;
}

export default function StoryProgressBars({ count, activeIndex, activeProgress }: Props) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }).map((_, i) => {
        const fill = i < activeIndex ? 1 : i === activeIndex ? Math.min(Math.max(activeProgress, 0), 1) : 0;
        return (
          <div
            key={i}
            className="flex-1 h-[2.5px] rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.35)' }}
          >
            <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: 'rgba(255,255,255,0.95)' }} />
          </div>
        );
      })}
    </div>
  );
}
