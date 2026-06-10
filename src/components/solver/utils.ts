import { Link, Nodes } from "../../types";

/**
 * get_degrees_of_liberty(positions, radii, links)
 */
export function get_degrees_of_freedom(nodes: Nodes, links: Link[]): number {
  return (
    nodes.positions.size * 2 +
    nodes.radii.size -
    links.map((link) => link.ddl).reduce((a, b) => a + b, 0) -
    [...nodes.posMasses.values()].filter((mass) => mass === 0).length * 2
  );
}

function keys_of(link: Link): string[] {
  switch (link.type) {
    case "Radius":
      return [link.key1];
    case "Coincidence":
    case "Distance":
    case "Horizontal":
    case "Vertical":
    case "GearMeshing":
    case "GearRatio":
      return [link.key1, link.key2];
    case "DistanceToLine":
    case "OnSegment":
    case "AtSegmentRatio":
      return [link.key1, link.key2, link.key3];
    case "Angle":
    case "Normal":
    case "Parallel":
    case "EqualLength":
      return [link.key1, link.key2, link.key3, link.key4];
    case "KeepOrientation":
      return [link.key1, link.key2];
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
