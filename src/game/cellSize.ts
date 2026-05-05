// Leaf module owning the world-units-per-grid-cell constant. Lives here so
// that pieceGeometry, trackVersion, and trackPath can all import it without
// forming a runtime cycle (trackPath imports trackVersion, trackVersion
// imports pieceGeometry, pieceGeometry imports CELL_SIZE; routing the import
// through trackPath would close the loop). External consumers can keep
// importing CELL_SIZE from `./trackPath`, which re-exports it.
export const CELL_SIZE = 20
