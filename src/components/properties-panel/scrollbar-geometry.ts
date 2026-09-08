/** The three numbers a scroll container exposes; an `HTMLElement` satisfies it as is. */
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Shape of the thumb: how short it may get, and how far the track stays clear of both ends. */
export interface ThumbSpec {
  minHeight: number;
  /** Floor of the squeeze against an edge, which goes under `minHeight`. */
  minSqueezed: number;
  margin: number;
}

/** Where a floating scrollbar's thumb sits, in pixels down from the top of the scroller. */
export interface ThumbGeometry {
  top: number;
  height: number;
}

/** Length the thumb travels between the track's ends, once its own height is taken out. */
function travel(metrics: ScrollMetrics, height: number, margin: number): number {
  return metrics.clientHeight - 2 * margin - height;
}

/**
 * Thumb due for a scroller in this state, or null when its content fits and no thumb is drawn.
 * `overscroll` is how far the panel is currently pulled past an edge — signed the way the content moves, so positive is a pull at the top — and squeezes the thumb against the edge it is held at.
 */
export function thumb_geometry(
  metrics: ScrollMetrics,
  spec: ThumbSpec,
  overscroll = 0,
): ThumbGeometry | null {
  const overflow = metrics.scrollHeight - metrics.clientHeight;
  const track = metrics.clientHeight - 2 * spec.margin;
  if (overflow <= 0 || track <= 0) return null;
  const height = Math.min(
    track,
    Math.max(spec.minHeight, (track * metrics.clientHeight) / metrics.scrollHeight),
  );
  if (overscroll !== 0) {
    const squeezed = Math.max(spec.minSqueezed, height - Math.abs(overscroll));
    return {
      top: overscroll > 0 ? spec.margin : spec.margin + track - squeezed,
      height: squeezed,
    };
  }
  const progress = Math.min(1, Math.max(0, metrics.scrollTop / overflow));
  return {
    top: spec.margin + travel(metrics, height, spec.margin) * progress,
    height,
  };
}

/**
 * How far a pull of `distance` px past an edge actually moves the panel: the first pixels follow at `resistance`, then it stiffens and never reaches `limit` however hard it is pushed.
 */
export function rubber_band(
  distance: number,
  limit: number,
  resistance: number,
): number {
  if (distance <= 0 || limit <= 0) return 0;
  return (limit * distance * resistance) / (limit + distance * resistance);
}

/** Scroll offset that brings the thumb's top to `top` — the inverse of `thumb_geometry`, for dragging. */
export function scroll_top_for_thumb(
  top: number,
  thumb: ThumbGeometry,
  metrics: ScrollMetrics,
  spec: ThumbSpec,
): number {
  const overflow = metrics.scrollHeight - metrics.clientHeight;
  const reach = travel(metrics, thumb.height, spec.margin);
  if (overflow <= 0 || reach <= 0) return 0;
  return Math.min(
    overflow,
    Math.max(0, ((top - spec.margin) / reach) * overflow),
  );
}
