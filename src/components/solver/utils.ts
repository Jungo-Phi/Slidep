import { GeomNodes, Link, SimNodes } from "../../types";

/**
 * Degrees of freedom for the geometric solver (edition).
 * Variables: positions (×2) + gear radii (×1), minus link DOF and anchored positions.
 */
export function get_geom_degrees_of_freedom(
  nodes: GeomNodes,
  links: Link[],
): number {
  return (
    nodes.positions.size * 2 +
    nodes.radii.size -
    links.map((link) => link.ddl).reduce((a: number, b: number) => a + b, 0) -
    [...nodes.posMasses.values()].filter((mass) => mass === 0).length * 2
  );
}

/**
 * Degrees of freedom for the kinematic simulation.
 * Variables: positions (×2) + gear angles (×1), minus link DOF and anchored
 * positions. Angles are never anchored, so they carry no mass term.
 */
export function get_sim_degrees_of_freedom(
  nodes: SimNodes,
  links: Link[],
): number {
  return (
    nodes.positions.size * 2 +
    nodes.angles.size -
    links.map((link) => link.ddl).reduce((a: number, b: number) => a + b, 0) -
    [...nodes.posMasses.values()].filter((mass) => mass === 0).length * 2
  );
}

function keys_of(link: Link): string[] {
  switch (link.type) {
    case "Radius":
      return [link.key1];
    case "Coincidence":
    case "Distance":
    case "Spring":
    case "Horizontal":
    case "Vertical":
    case "GearMeshing":
    case "GearRatio":
      return [link.key1, link.key2];
    case "DistanceToLine":
    case "SlideOnSegment":
    case "FixedOnSegment":
      return [link.key1, link.key2, link.key3];
    case "Angle":
    case "Normal":
    case "Parallel":
    case "EqualLength":
      return [link.key1, link.key2, link.key3, link.key4];
    case "KeepOrientation":
      return [link.key1, link.key2];
    case "MotorBeam":
      return [link.pivotKey, link.drivenKey];
    case "MotorAngle":
      return [link.angleKey];
    case "GearMeshAngle":
      return [link.angleKey1, link.angleKey2, link.posKey1, link.posKey2];
    case "CoaxialAngle":
      return [link.angleKey1, link.angleKey2];
    case "GearPerimeterPin":
      return [link.nodeKey, link.centerKey, link.angleKey];
    case "BeamFollowsAngle":
      return [link.pivotKey, link.drivenKey, link.angleKey];
    case "HandleGrab":
      return [link.grabbedKey];
  }
}

/*
 * Return Links sorted from an anchor to HandleGrab
 */
export function sort_links(
  links: Link[],
  posMasses: Map<string, number>,
): Link[] {
  // 1. Construire l'index clé → liens qui la touchent
  const key_to_links = new Map<string, number[]>();
  links.forEach((link, i) => {
    keys_of(link).forEach((k) => {
      if (!key_to_links.has(k)) key_to_links.set(k, []);
      key_to_links.get(k)!.push(i);
    });
  });

  // 2. BFS : priorité aux liens touchant une clé ancrée (masse = 0)
  const visited = new Array(links.length).fill(false);
  const result: Link[] = [];
  const queue: number[] = [];

  // Amorcer avec les HandleGrab en dernier, ancres en premier
  const grab_indices: number[] = [];
  links.forEach((link, i) => {
    if (link.type === "HandleGrab") {
      grab_indices.push(i);
      visited[i] = true;
    }
  });

  // Seed unique : le premier lien touchant une clé de masse 0
  const first_anchored = links.findIndex(
    (link, i) =>
      !visited[i] && keys_of(link).some((k) => posMasses.get(k) === 0),
  );
  if (first_anchored !== -1) {
    queue.push(first_anchored);
    visited[first_anchored] = true;
  }
  // Si rien d'ancré, partir du premier lien non-visité
  if (queue.length === 0 && links.length > 0) {
    queue.push(0);
    visited[0] = true;
  }

  while (
    queue.length > 0 ||
    result.length + grab_indices.length < links.length
  ) {
    if (queue.length === 0) {
      // Composante isolée : trouver le prochain lien non-visité
      const next = links.findIndex((_, i) => !visited[i]);
      if (next === -1) break;
      queue.push(next);
      visited[next] = true;
    }
    const idx = queue.shift()!;
    result.push(links[idx]);
    // Voisins : tous les liens partageant une clé
    keys_of(links[idx]).forEach((k) => {
      key_to_links.get(k)?.forEach((j) => {
        if (!visited[j]) {
          visited[j] = true;
          queue.push(j);
        }
      });
    });
  }

  return [...result, ...grab_indices.map((i) => links[i])];
}
