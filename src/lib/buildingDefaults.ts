/**
 * Identity used by a newly placed, otherwise unnamed Building.
 *
 * The editor keeps reservations for the lifetime of a campus editing session.
 * This is intentional: the structure-save RPC retires removed Buildings as
 * archived rows, and the campus-wide code constraint still includes those
 * rows. Remembering an allocated default code therefore prevents a
 * delete-then-create draft from reusing a code that the next save still sees.
 */
export interface BuildingIdentity {
  name: string;
  code: string;
}

function normalizedName(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizedCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function defaultCode(index: number): string {
  return `BLDG-${String(index).padStart(2, "0")}`;
}

/**
 * Pick the first friendly Building N / BLDG-NN pair that is not used by the
 * visible campus Buildings or by identities reserved earlier in this editing
 * session.
 */
export function nextDefaultBuildingIdentity(
  buildings: ReadonlyArray<Partial<BuildingIdentity>>,
  reserved: ReadonlyArray<Partial<BuildingIdentity>> = [],
): BuildingIdentity {
  const usedNames = new Set<string>();
  const usedCodes = new Set<string>();
  for (const building of [...buildings, ...reserved]) {
    const name = normalizedName(building.name);
    const code = normalizedCode(building.code);
    if (name) usedNames.add(name);
    if (code) usedCodes.add(code);
  }

  let index = 1;
  while (true) {
    const name = `Building ${index}`;
    const code = defaultCode(index);
    if (!usedNames.has(normalizedName(name)) && !usedCodes.has(code)) {
      return { name, code };
    }
    index += 1;
  }
}

/**
 * Return a persistence-safe identity for a building copy.
 *
 * Building codes are unique per campus in the database (including rows that
 * have been archived by the structure-save RPC). Copying a building must
 * therefore never carry the source code forward. Use the same short,
 * human-readable BLDG-NN sequence as new buildings instead of exposing an
 * implementation/id token in the code shown to administrators.
 */
export function nextBuildingCopyIdentity(
  source: Partial<BuildingIdentity>,
  buildings: ReadonlyArray<Partial<BuildingIdentity>>,
  reserved: ReadonlyArray<Partial<BuildingIdentity>> = [],
  _copyToken = "",
): BuildingIdentity {
  const sourceName = typeof source.name === "string" && source.name.trim().length > 0
    ? source.name.trim()
    : "Building";
  const identity = nextDefaultBuildingIdentity(buildings, reserved);

  const usedNames = new Set<string>();
  for (const building of [...buildings, ...reserved]) {
    const name = normalizedName(building.name);
    if (name) usedNames.add(name);
  }
  let name = `${sourceName} (copy)`;
  let nameIndex = 2;
  while (usedNames.has(normalizedName(name))) {
    name = `${sourceName} (copy ${nameIndex})`;
    nameIndex += 1;
  }
  return { name, code: identity.code };
}
