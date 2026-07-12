/** 2D Point representation with utility methods */
export class Point2 {
  x: number;
  y: number;

  public constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** Create a point from an angle (in radians) */
  public static from_angle(angle: number): Point2 {
    return new Point2(Math.cos(angle), Math.sin(angle));
  }

  /** Create a point from polar coordinates (radius and angle in radians) */
  public static from_polar(radius: number, angle: number): Point2 {
    return new Point2(radius * Math.cos(angle), radius * Math.sin(angle));
  }

  /** Calculate the length of the point */
  public length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /** Calculate the squared length of the point */
  public length_squared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /** Calculate the angle of the point in radians */
  public angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /** Calculate the angle of the point in degrees */
  public angle_deg(): number {
    return (this.angle() * 180) / Math.PI;
  }

  /** Calculate distance to another point */
  public distance_to(other: Point2): number {
    return Math.sqrt(
      Math.pow(other.x - this.x, 2) + Math.pow(other.y - this.y, 2),
    );
  }

  /** Calculate the angle to another point in radians */
  public angle_to(other: Point2): number {
    let delta = other.angle() - this.angle();
    if (delta < -Math.PI) delta += 2 * Math.PI;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    return delta;
  }

  /** Calculate the angle to another point in degrees */
  public angle_to_deg(other: Point2): number {
    return (this.angle_to(other) * 180) / Math.PI;
  }

  /** Sum of this point and another point */
  public add(other: Point2): Point2 {
    return new Point2(this.x + other.x, this.y + other.y);
  }

  /** Subtract another point from this point */
  public sub(other: Point2): Point2 {
    return new Point2(this.x - other.x, this.y - other.y);
  }

  /** Multiply by a scalar */
  public mul(scalar: number): Point2 {
    return new Point2(this.x * scalar, this.y * scalar);
  }

  /** Divide by a scalar */
  public div(scalar: number): Point2 {
    if (scalar === 0) return ZERO;
    return new Point2(this.x / scalar, this.y / scalar);
  }

  /** Sets the length, conserving the direction */
  public scale_to_length(scalar: number): Point2 {
    const lenght = this.length();
    if (lenght === 0) return new Point2(scalar, 0);
    return this.mul(scalar / lenght);
  }

  /** Scales the length to a minimum value if length is lower, conserving the direction */
  public limit_length_min(min: number): Point2 {
    const lenght = this.length();
    if (lenght < min) {
      if (lenght === 0) return new Point2(min, 0);
      return this.mul(min / lenght);
    }
    return this;
  }

  /** Scales the length to a minimum value if length is lower, conserving the direction */
  public limit_length_max(max: number): Point2 {
    const lenght = this.length();
    if (lenght > max) {
      if (lenght === 0) return new Point2(max, 0);
      return this.mul(max / lenght);
    }
    return this;
  }

  /** Appends to the length, conserving the direction */
  public extend_length(scalar: number): Point2 {
    return Point2.from_polar(this.length() + scalar, this.angle());
  }

  public equals(other: Point2): boolean {
    return this.x === other.x && this.y === other.y;
  }

  /** Returns a new point with the x coordinate flipped */
  public mirrorX(): Point2 {
    return new Point2(-this.x, this.y);
  }

  /** Returns a new point with the y coordinate flipped */
  public mirrorY(): Point2 {
    return new Point2(this.x, -this.y);
  }

  public toString(): string {
    return `[${this.x.toFixed(1)},${this.y.toFixed(1)}]`;
  }

  public clone(): Point2 {
    return new Point2(this.x, this.y);
  }

  /** Convert to unit vector, with a lenght of one */
  public normalize(): Point2 {
    return this.div(this.length());
  }

  /** Perpendicular or normal to this point */
  public perp(): Point2 {
    return new Point2(-this.y, this.x);
  }

  /** Dot product with another point */
  public dot(other: Point2): number {
    return this.x * other.x + this.y * other.y;
  }

  /** Cross product with another point (2D cross product returns scalar) */
  public cross(other: Point2): number {
    return this.x * other.y - this.y * other.x;
  }

  /** Linear interpolation to another point */
  public lerp(other: Point2, t: number): Point2 {
    return new Point2(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t,
    );
  }

  /** Spherical linear interpolation to another point */
  public slerp(other: Point2, t: number): Point2 {
    const angle = this.angle_to(other);
    return Point2.from_polar(
      this.length() + (other.length() - this.length()) * t,
      this.angle() + angle * t,
    );
  }

  /**
   * Calcule la proportion **t** entre 0 et 1 (étendu si dépasse)
   * tel que : this = start.lerp(end, t)
   *
   * Si le point n'est pas sur la ligne, il est projeté orthogonalement.
   */
  public parameter_on_segment(start: Point2, end: Point2): number {
    const delta = end.sub(start);
    if (delta === ZERO) return 0;
    return this.sub(start).dot(delta) / delta.length_squared();
  }

  /**
   * Renvoie les coordonées du point dans les coordonnées locales du segment **Point2(t, d)**.
   *
   * Ou **t** est la proportion entre 0 et 1 (étendu si dépasse).
   *
   * Et **d** est la distance au segment (gauche négatif, droite positif).
   */
  public to_segment_coordinates(start: Point2, end: Point2): Point2 {
    const delta = end.sub(start);
    if (delta === ZERO) return ZERO;
    return new Point2(
      this.sub(start).dot(delta) / delta.length_squared(),
      this.sub(start).dot(delta.perp().normalize()),
    );
  }

  /**
   * Renvoie les coordonnées locales du point sur le segment **Point2(t, d)** en coordonées globales.
   *
   * Ou **t** est la proportion entre 0 et 1 (étendu si dépasse).
   *
   * Et **d** est la distance au segment (gauche négatif, droite positif).
   */
  public from_segment_coordinates(start: Point2, end: Point2): Point2 {
    const delta = end.sub(start);
    if (delta === ZERO) return start;
    return start.lerp(end, this.x).add(delta.perp().normalize().mul(this.y));
  }

  /**
   * Renvoie les coordonées du point dans les coordonnées locales de la paire de segments **Point2(t1, t2)**.
   *
   * Ou **t** est la proportion entre 0 et 1 (étendu si dépasse).
   */
  public to_double_segment_coordinates(
    start1: Point2,
    end1: Point2,
    start2: Point2,
    end2: Point2,
  ): Point2 {
    const delta1 = end1.sub(start1);
    const delta2 = end2.sub(start2);
    if (delta1 === ZERO || delta2 === ZERO) return ZERO;
    return new Point2(
      this.sub(start1).dot(delta1) / delta1.length_squared(),
      this.sub(start2).dot(delta2) / delta2.length_squared(),
    );
  }

  /**
   * Renvoie les coordonnées locales du point sur la paire de segments **Point2(t1, t2)** en coordonées globales.
   *
   * Ou **t** est la proportion entre 0 et 1 (étendu si dépasse).
   */
  public from_double_segment_coordinates(
    start1: Point2,
    end1: Point2,
    start2: Point2,
    end2: Point2,
  ): Point2 | null {
    const delta1 = end1.sub(start1);
    if (delta1 === ZERO) return start1;
    const delta2 = end2.sub(start2);
    if (delta2 === ZERO) return start2;

    const pos1 = start1.lerp(end1, this.x);
    const pos2 = start2.lerp(end2, this.y);
    return Point2.lines_intersection(
      pos1,
      pos1.add(delta1.perp()),
      pos2,
      pos2.add(delta2.perp()),
    );
  }

  /**
   * Renvoie les coordonées du point dans les coordonnées locales de la paire de segments **Point2(r, a)**.
   *
   * Ou **r** est le rayon vers le point de croisement et *a* la proportion entre 0 et 1 de l'angle.
   */
  public to_polar_segments_coordinates(
    start1: Point2,
    end1: Point2,
    start2: Point2,
    end2: Point2,
  ): Point2 | null {
    const origin = Point2.lines_intersection(start1, end1, start2, end2);
    if (!origin) return null;
    const pos_dir = this.sub(origin);
    const delta1 = end1.sub(start1);
    return new Point2(
      this.distance_to(origin),
      delta1.angle_to(pos_dir) / delta1.angle_to(end2.sub(start2)),
    );
  }

  /**
   * Renvoie les coordonnées locales du point sur la paire de segments **Point2(r, a)** en coordonées globales.
   *
   * Ou **r** est le rayon vers le point de croisement et *a* la proportion entre 0 et 1 de l'angle.
   */
  public from_polar_segments_coordinates(
    start1: Point2,
    end1: Point2,
    start2: Point2,
    end2: Point2,
  ): Point2 | null {
    const origin = Point2.lines_intersection(start1, end1, start2, end2);
    if (!origin) return null;
    const delta1 = end1.sub(start1);
    return origin.add(
      Point2.from_polar(
        this.x,
        delta1.angle() + delta1.angle_to(end2.sub(start2)) * this.y,
      ),
    );
  }

  /** Projection onto a line defined by two points */
  public project_on_line(start: Point2, end: Point2): Point2 {
    const delta = end.sub(start);
    return start.add(
      delta.mul(this.sub(start).dot(delta)).div(delta.length_squared()),
    );
  }

  /** Smallest vector from a line (defined by two points) to this point */
  public reject_on_line(start: Point2, end: Point2): Point2 {
    const delta = end.sub(start);
    return start.add(
      delta
        .perp()
        .mul(this.sub(start).dot(delta.perp()))
        .div(delta.length_squared()),
    );
  }

  /** Length of projection onto a line defined by two points */
  public scalar_projection_on_line(start: Point2, end: Point2): number {
    return this.sub(start).dot(end.sub(start).normalize());
  }

  /** Distance to a line defined by two points */
  public distance_to_line(start: Point2, end: Point2): number {
    return Math.abs(this.sub(start).dot(end.sub(start).perp().normalize()));
  }

  /** Distance to a line defined by two points */
  public is_on_left_side_of_line(start: Point2, end: Point2): boolean {
    return this.sub(start).dot(end.sub(start).perp().normalize()) <= 0;
  }

  /**
   * Distance to a segment defined by two points
   */
  public distance_to_segment(start: Point2, end: Point2): number {
    const scalar_projection = this.scalar_projection_on_line(start, end);
    if (scalar_projection <= 0) return this.distance_to(start);
    if (scalar_projection >= start.distance_to(end))
      return this.distance_to(end);
    return this.distance_to_line(start, end);
  }

  /** Reflect this point across a line defined by two points */
  public reflect(start: Point2, end: Point2): Point2 {
    const projection = this.project_on_line(start, end);
    return new Point2(2 * projection.x - this.x, 2 * projection.y - this.y);
  }

  /** Rotate this point by angle (in radians) around origin */
  public rotate(angle: number): Point2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Point2(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
  }

  /** Rotate this point by angle (in radians) around another point */
  public rotate_around(center: Point2, angle: number): Point2 {
    const translatedX = this.x - center.x;
    const translatedY = this.y - center.y;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const rotatedX = translatedX * cos - translatedY * sin;
    const rotatedY = translatedX * sin + translatedY * cos;
    return new Point2(rotatedX + center.x, rotatedY + center.y);
  }
  /** Vérifie si un point est dans un rectangle défini par deux points */
  public is_in_rect(rectStart: Point2, rectEnd: Point2): boolean {
    const xMin = Math.min(rectStart.x, rectEnd.x);
    const xMax = Math.max(rectStart.x, rectEnd.x);
    const yMin = Math.min(rectStart.y, rectEnd.y);
    const yMax = Math.max(rectStart.y, rectEnd.y);

    return this.x >= xMin && this.x <= xMax && this.y >= yMin && this.y <= yMax;
  }

  /** Le point d'intersection de 2 droites, chacune définie par 2 points. */
  public static lines_intersection(
    start1: Point2,
    end1: Point2,
    start2: Point2,
    end2: Point2,
  ): Point2 | null {
    const delta1 = end1.sub(start1);
    const delta2 = end2.sub(start2);
    const deltaStart = start1.sub(start2);
    const denominator = delta2.y * delta1.x - delta2.x * delta1.y;
    if (denominator === 0) return null; // Droites parallèles
    return start1.lerp(
      end1,
      (delta2.x * deltaStart.y - delta2.y * deltaStart.x) / denominator,
    );
  }

  /** Vérifie si un point est dans le quadrilatère de distributed-force définit par un segment, une direction et deux amplitudes
   */
  public is_in_distributed_force(
    startPoint: Point2,
    endPoint: Point2,
    direction: Point2,
    magnitudeStart: number,
    magnitudeEnd: number,
  ): boolean {
    const vertices = [
      startPoint,
      startPoint.add(direction.mul(magnitudeStart)),
      endPoint.add(direction.mul(magnitudeEnd)),
      endPoint,
    ];
    let inside = false;
    for (let i = 0; i < 4; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % 4];
      const intersect = current.y > this.y !== next.y > this.y;
      if (intersect) {
        const xIntersect =
          ((next.x - current.x) * (this.y - current.y)) / (next.y - current.y) +
          current.x;
        if (xIntersect > this.x) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  /** Renvoie un segment (`start` to `end`) tangeant aux 2 cercles. direction {false: clockwise, true: counterClockwise}*/
  public static circles_link(
    center1: Point2,
    radius1: number,
    direction1: boolean,
    center2: Point2,
    radius2: number,
    direction2: boolean,
  ): { start: Point2; end: Point2 } {
    const delta = center2.sub(center1);
    const d = delta.length();
    let alpha: number;
    if (direction1 === direction2) {
      const r_diff = radius1 - radius2;
      if (d < Math.abs(r_diff)) {
        return {
          start: delta.normalize().mul(radius1),
          end: delta.normalize().mul(-radius2),
        };
      }
      alpha = Math.asin(r_diff / d);
    } else {
      const r_sum = radius2 + radius1;
      if (d < r_sum) {
        return {
          start: delta.normalize().mul(radius1),
          end: delta.normalize().mul(-radius2),
        };
      }
      alpha = Math.asin(r_sum / d);
    }
    const n = Point2.from_angle(
      delta.angle() + alpha * (direction1 ? -1 : 1) + Math.PI / 2,
    );
    return {
      start: n.mul(radius1 * (direction1 ? 1 : -1)),
      end: n.mul(radius2 * (direction2 ? 1 : -1)),
    };
  }
}

export const ZERO: Point2 = new Point2(0, 0);
export const ONE: Point2 = new Point2(1, 1);
export const TOP: Point2 = new Point2(0, 1);
export const BOTTOM: Point2 = new Point2(0, -1);
export const RIGHT: Point2 = new Point2(1, 0);
export const LEFT: Point2 = new Point2(-1, 0);
